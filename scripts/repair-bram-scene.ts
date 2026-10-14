/** Operator workflow for the specifically authorized Bram correction.
 * Each command advances at most one request; visual reviews are separate,
 * hash-bound decisions. Recovery only polls the saved request ID. */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../src/db';
import { acquireJobLock } from '../src/lib/job-lock';
import { withCamExecution, assertAuthorizedExecution } from '../src/lib/providers/live-policy';
import { connectCamAssets } from '../src/lib/providers/cam-assets';
import { priceCamPlan, type CamQuote } from '../src/lib/providers/cam-pricing';
import { createBudget, quoteHash, budgetedQueue, type BudgetApproval, type BudgetQuote } from '../src/lib/concept/budget';
import { postgresBudgetStore } from '../src/lib/concept/budget-store';
import { lockedAssets } from '../src/lib/concept/assets';
import { sha256, saveCheckpoint } from '../src/lib/concept/checkpoints';
import { materializeRequest, IMAGE_ENDPOINT, VIDEO_ENDPOINT, type GenerationOperation } from '../src/lib/concept/generation-plan';
import { falQueue, type JsonRequest } from '../src/lib/concept/provider-transports';
import { advanceRequest, requestReceipts } from '../src/lib/concept/request-journal';
import { uploadReference, downloadResult } from '../src/lib/concept/media-transfers';
import { verifiedSceneMedia } from '../src/lib/concept/imported-media';
import type { SceneMedia } from '../src/lib/concept/preview-inputs';
import type { sceneRepairPlan } from '../src/lib/concept/scene-repair';
import { StoryboardSheetSchema, StoryboardDecisionSchema, requireApprovedStoryboardPanel } from '../src/lib/concept/storyboard-review';

type Plan = ReturnType<typeof sceneRepairPlan>;
type Phase = { operation: GenerationOperation; payload: Record<string, unknown>; quote: BudgetQuote; approval: BudgetApproval };
type Trial = { plan: Plan; planSha256: string; quote: CamQuote; phases: Record<string, Phase>; media: Record<string, SceneMedia>;
  history?: { plan: Plan; quote: CamQuote; reason: string; at: string }[];
  reviews: Record<string, { decision: 'approved' | 'rejected'; sha256: string; note: string; at: string; reviewer: string }> };
type Session = { version: 1; jobId: string; capUsdMicros: number; authorization: string; at: string; trials: Record<string, Trial> };
const jobId = '2b0df353-688e-4d7c-b5aa-6a31cd4b2f21';
const root = path.join(process.cwd(), 'storage/concepts', jobId, 'live/repairs/bram-method-20261014');
const sessionFile = path.join(root, 'session.json');
const authorization = 'Shimi, 2026-10-14, chat: continue en autonomie; jusqu’à 20 dollars sur mes crédits fal.ai sans demander la permission; conserver Bram. Total includes the previously approved $1 scroll repair.';
const request: JsonRequest = async (url, init) => {
  assertAuthorizedExecution();
  const parsed = new URL(url);
  const pricing = parsed.origin === 'https://api.fal.ai' && parsed.pathname === '/v1/models/pricing' && init.method === 'GET';
  const queue = parsed.origin === 'https://queue.fal.run' && (init.method === 'GET' || [IMAGE_ENDPOINT, VIDEO_ENDPOINT].some(e => parsed.pathname === `/${e}`));
  if ((!pricing && !queue) || parsed.username || parsed.password || !process.env.FAL_KEY) throw new Error('Unexpected provider request.');
  const response = await fetch(url, { ...init, headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`fal HTTP ${response.status}; no automatic resubmission.`);
  return response.json();
};
const total = (session: Session) => Object.values(session.trials).reduce((n, t) => n + Object.values(t.phases).reduce((a, p) => a + p.quote.lines.reduce((b, l) => b + l.maximum, 0), 0), 0);
async function main() {
  const [command, trialName, ...args] = process.argv.slice(2);
  if (!['prepare', 'advance', 'review', 'status', 'amend', 'motion'].includes(command) || !/^[a-z0-9-]+$/.test(trialName)) throw new Error('Use prepare|advance|review|status|amend|motion <trial-name>.');
  const lock = await acquireJobLock(jobId); if (!lock) throw new Error('Production busy.');
  try { await withCamExecution(jobId, async () => {
    await mkdir(root, { recursive: true });
    let session: Session;
    try { session = JSON.parse(await readFile(sessionFile, 'utf8')); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      session = { version: 1, jobId, capUsdMicros: 20_000_000, authorization, at: new Date().toISOString(), trials: {} }; }
    if (session.jobId !== jobId || session.capUsdMicros !== 20_000_000 || session.authorization !== authorization) throw new Error('Authorization mismatch.');
    const save = async () => {
      await saveCheckpoint(sessionFile, session, lock.assertOwned);
      await saveCheckpoint(path.join(root, '../../repair-progress.json'), {
        capUsdMicros: session.capUsdMicros, reservedUsdMicros: total(session), costsSettled: false,
        trials: Object.entries(session.trials).map(([name,t])=>({name,scene:t.plan.repair.scene,
          quoteUsdMicros:t.quote.caps.usd, requests:Object.keys(t.phases).length,
          completed:Object.keys(t.media).length, reviews:Object.values(t.reviews).map(r=>r.decision)})),
      }, lock.assertOwned);
    };
    if (command === 'prepare') {
      if (session.trials[trialName]) throw new Error('Trial already exists; advance the saved trial.');
      const bytes = await readFile(args[0]); const plan: Plan = JSON.parse(bytes.toString());
      const source = JSON.parse(await readFile(path.join(root, '../../state.json'), 'utf8')).render;
      if (plan.sourceFingerprint !== source.fingerprint || plan.sourceProduction !== jobId || plan.reusedRecording.audioSha256 !== source.audioSha256 || sha256(await readFile(source.voiceFile)) !== source.audioSha256) throw new Error('Source production changed.');
      if (plan.operations.length !== 3 || plan.operations.some((op, i) => op.kind !== (i < 2 ? 'image' : 'video') || op.transport !== 'fal-queue' || op.scene !== plan.repair.scene || op.model !== (i < 2 ? IMAGE_ENDPOINT : VIDEO_ENDPOINT)) || !plan.operations[2].bindings.end_image_url) throw new Error('Repair must be exactly two endpoint images and one silent animation.');
      if (Object.values(session.trials).some(t => t.plan.fingerprint === plan.fingerprint)) throw new Error('This plan already has a trial; preserve its requests.');
      const quote = await priceCamPlan(plan, { fal: request, higgsfield: async () => { throw new Error('Voice calls prohibited.'); } });
      if (quote.caps['higgsfield-credit'] || total(session) + quote.caps.usd > session.capUsdMicros) throw new Error('Repair exceeds the authorized $20 total.');
      session.trials[trialName] = { plan, planSha256: sha256(bytes), quote, phases: {}, media: {}, reviews: {} }; await save();
      console.log(JSON.stringify({ trial: trialName, quoteUsd: quote.caps.usd / 1e6, reservedUsd: total(session) / 1e6, capUsd: 20, submitted: false })); return;
    }
    const trial = session.trials[trialName]; if (!trial) throw new Error('Prepare the trial first.');
    const dir = path.join(root, trialName); await mkdir(dir, { recursive: true });
    if (command === 'motion') {
      const scene=trial.plan.repair.scene, clip=`scene-${scene}-clip`;
      if(trial.phases[clip]||['start','end'].some(s=>trial.reviews[`scene-${scene}-${s}`]?.decision!=='approved'))throw new Error('Motion can only be refined after endpoint review and before its first submission.');
      const motion=(await readFile(args[0],'utf8')).trim();if(motion.length<40||motion.length>2000)throw new Error('Invalid motion direction.');
      const next:Plan=structuredClone(trial.plan);next.repair.direction.motion=motion;
      const op=next.operations[2];op.input.prompt=`Handcrafted plasticine stop-motion animation, animated on twos with subtle clay boil. ${motion} Keep the exact locked character design and clothing. No new objects, text, logos, cuts, dialogue or music.`;
      op.fingerprint=sha256(JSON.stringify({previous:op.fingerprint,motion,images:trial.media}));
      next.fingerprint=sha256(JSON.stringify({previous:trial.plan.fingerprint,operations:next.operations,direction:next.repair.direction}));
      const quote=await priceCamPlan(next,{fal:request,higgsfield:async()=>{throw new Error('Voice calls prohibited.');}});
      const remaining=quote.lines.find(l=>l.id===clip)!.maximum;if(total(session)+remaining>session.capUsdMicros)throw new Error('Session cap exceeded.');
      trial.history??=[];trial.history.push({plan:trial.plan,quote:trial.quote,reason:'Refine unsubmitted motion to the two inspected endpoints; retain both generated images.',at:new Date().toISOString()});
      trial.plan=next;trial.quote=quote;await save();console.log(JSON.stringify({motionRefined:trialName,remainingUsd:remaining/1e6,submitted:false}));return;
    }
    if (command === 'amend') {
      const start = `scene-${trial.plan.repair.scene}-start`;
      if (trial.reviews[start]?.decision !== 'approved' || Object.keys(trial.phases).some(id=>id!==start)) throw new Error('Only an approved start with no downstream attempt can be adapted.');
      const bytes = await readFile(args[0]); const next: Plan = JSON.parse(bytes.toString());
      if (next.sourceFingerprint !== trial.plan.sourceFingerprint || next.repair.scene !== trial.plan.repair.scene || next.operations.length !== 3 || next.operations.some((op,i)=>op.kind!==(i<2?'image':'video')||op.model!==(i<2?IMAGE_ENDPOINT:VIDEO_ENDPOINT))) throw new Error('Adaptation changed repair scope.');
      next.operations[0] = trial.plan.operations[0];
      for(let i=1;i<3;i++)next.operations[i].fingerprint=sha256(JSON.stringify({op:next.operations[i],approvedStart:trial.media[start].sha256,parents:next.operations.slice(0,i).map(o=>o.fingerprint)}));
      next.fingerprint=sha256(JSON.stringify({previous:trial.plan.fingerprint,proposal:next.fingerprint,operations:next.operations,approvedStart:trial.media[start].sha256}));
      const quote=await priceCamPlan(next,{fal:request,higgsfield:async()=>{throw new Error('Voice calls prohibited.');}});
      const remaining=quote.lines.filter(l=>l.id!==start).reduce((n,l)=>n+l.maximum,0);
      if(quote.caps['higgsfield-credit']||total(session)+remaining>session.capUsdMicros)throw new Error('Adaptation exceeds session cap.');
      trial.history??=[];trial.history.push({plan:trial.plan,quote:trial.quote,reason:'Adapt unsubmitted endpoint and movement to the inspected start geometry; reuse the same start bytes and request.',at:new Date().toISOString()});
      trial.plan=next;trial.planSha256=sha256(bytes);trial.quote=quote;await save();
      console.log(JSON.stringify({adapted:trialName,reusedStart:trial.media[start].sha256,remainingUsd:remaining/1e6,submitted:false}));return;
    }
    if (command === 'review') {
      const [opId, hash, decision, ...note] = args; const media = trial.media[opId];
      if (!media || media.sha256 !== hash || !['approved', 'rejected'].includes(decision) || note.join(' ').length < 20) throw new Error('Review needs exact media hash and a substantive visual note.');
      await verifiedSceneMedia(jobId, media);
      if (trial.reviews[opId]) throw new Error('Review already saved.');
      trial.reviews[opId] = { decision: decision as 'approved' | 'rejected', sha256: hash, note: note.join(' '), at: new Date().toISOString(), reviewer: 'Codex visual inspection under Shimi autonomy authorization' }; await save();
      console.log(JSON.stringify({ reviewed: opId, decision })); return;
    }
    if (command === 'status') { console.log(JSON.stringify({ trial: trialName, media: trial.media, reviews: trial.reviews, reservedUsd: total(session)/1e6, requests: (await requestReceipts(path.join(dir, 'requests'))).map(r=>({operation:r.binding?.operation,state:r.state,requestId:r.requestId})) }, null, 2)); return; }
    const op = trial.plan.operations.find(op => !trial.reviews[op.id]);
    if (!op) { console.log('All three media reviews completed.'); return; }
    if (Object.values(trial.reviews).some(r => r.decision === 'rejected')) throw new Error('Trial rejected; no further spend on it.');
    for (const parent of op.dependsOn) if (trial.reviews[parent]?.decision !== 'approved') throw new Error('Review the preceding image first.');
    if (trial.media[op.id]) { console.log(JSON.stringify({ awaitingReview: op.id, media: trial.media[op.id] })); return; }
    if(op.kind==='video'){
      const sheet=StoryboardSheetSchema.parse(JSON.parse(await readFile(path.join(root,'../../storyboard-review.json'),'utf8')));
      const human=StoryboardDecisionSchema.parse(JSON.parse(await readFile(path.join(root,'../../storyboard-reviews',`${sheet.target}.json`),'utf8')));
      requireApprovedStoryboardPanel(sheet,human,{scene:op.scene!,startSha256:trial.media[`scene-${op.scene}-start`].sha256,endSha256:trial.media[`scene-${op.scene}-end`]?.sha256,motion:trial.plan.repair.direction.motion,visualMode:trial.plan.repair.direction.visualMode,overlay:trial.plan.repair.direction.overlay});
    }
    const assets = connectCamAssets(); const transfer = { directory: path.join(dir, 'transfers'), transport: assets, assertOwned: lock.assertOwned };
    let phase = trial.phases[op.id];
    if (!phase) {
      if (trial.quote.expiresAt <= Date.now()) throw new Error('Quote expired; refresh remaining prices before new submissions.');
      const urls: Record<string,string> = {};
      const references = await lockedAssets();
      for (const binding of Object.values(op.bindings).flat()) {
        const ref = binding.startsWith('reference:') ? references.find(r => r.id === binding.slice(10)) : null;
        if (ref) { const expected = trial.plan.references.find(r=>r.id===ref.id); if (expected?.sha256 !== ref.sha256) throw new Error('Locked reference changed.');
          urls[binding] = (await uploadReference({ ...transfer, file: ref.filePath, sha256: ref.sha256, contentType:'image/png' })).url;
        } else { const parentId = binding.slice(7), media = trial.media[parentId]; if (!binding.startsWith('output:') || !media || trial.reviews[parentId]?.sha256 !== media.sha256 || trial.reviews[parentId]?.decision !== 'approved') throw new Error('Missing reviewed endpoint.');
          const verified = await verifiedSceneMedia(jobId, media); urls[binding] = (await uploadReference({ ...transfer, file: verified.file, sha256: media.sha256, contentType: 'image/png' })).url; }
      }
      const payload = materializeRequest(op, urls);
      const operation = { ...op, fingerprint: sha256(JSON.stringify({ op, payload, source: trial.plan.sourceFingerprint, reviews: trial.reviews })) };
      const plan = sha256(JSON.stringify(operation));
      const line = trial.quote.lines.find(l => l.id === op.id && l.model === op.model && l.kind === op.kind); if (!line || line.unit !== 'usd') throw new Error('Unquoted operation.');
      if (op.kind === 'video' && Number(op.input.duration) !== line.quantity) throw new Error('Duration differs from quote.');
      if (total(session) + line.maximum > session.capUsdMicros) throw new Error('Session budget exhausted.');
      const quote: BudgetQuote = { plan, source: 'provider', expiresAt: trial.quote.expiresAt, lines: [{ operation: operation.fingerprint, unit:'usd', maximum:line.maximum }] };
      const approval: BudgetApproval = { id:randomUUID(), mode:'live', plan, quote:quoteHash(quote), expiresAt:quote.expiresAt, caps:{usd:line.maximum,'higgsfield-credit':0} };
      phase = { operation, payload, quote, approval }; trial.phases[op.id] = phase; await save();
    }
    const budget = createBudget(postgresBudgetStore('live','cam-provider-account'), {usd:100_000_000,'higgsfield-credit':100_000_000});
    await budget.reserve({ jobId, plan:phase.approval.plan, operations:[phase.operation], quote:phase.quote, approval:phase.approval });
    const result = await advanceRequest({ directory:path.join(dir,'requests'), fingerprint:phase.operation.fingerprint, assertOwned:lock.assertOwned,
      binding:{jobId,operation:op.id,model:op.model,transport:op.transport,payloadSha256:sha256(JSON.stringify(phase.payload))},
      queue:budgetedQueue(falQueue(phase.operation,phase.payload,'live',request),budget,phase.approval.id,phase.operation.fingerprint) });
    if (result.state === 'complete' && result.output) {
      const output = await downloadResult({...transfer,jobId,fingerprint:phase.operation.fingerprint,kind:op.kind==='video'?'video':'image',provider:'fal',url:result.output});
      if (!output.media || (op.kind==='video' && output.media.duration!+1/30 < Number(op.input.duration))) throw new Error('Invalid provider media.');
      trial.media[op.id] = output.media; await save();
    }
    console.log(JSON.stringify({operation:op.id,state:result.state,requestId:result.requestId,media:trial.media[op.id]??null,reservedUsd:total(session)/1e6,capUsd:20}));
  }); } finally { await lock.release(); await pool.end(); }
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Repair interrupted; retain all request receipts.'); process.exitCode=1; });
