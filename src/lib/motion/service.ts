export {ClientMessage} from './client-message';
import {ClientMessage} from './client-message';
import {motionBudgets} from './budgets';
import {AIHttpTransient} from '../agent/transport';
import {savedWritingDiagnostic} from './saved-diagnostic';
import {motionPreflight} from './worker';
import {motionWriterReady,motionWriterContract} from './writer';
import {supervisedStep} from '../agent/recovery-step';
import {consumeRecovery,recoveryView} from '../agent/recovery-policy';
import {reviewDelivery} from '../agent/delivery-review';
import {CreativeApproval,reviewMotionCreative} from './creative-review';
import {randomUUID} from 'node:crypto';
import {acceptedMotionPrice,revisionTargets,estimateMotionRevision,revisionAmounts,assertRevisionQuote,motionFirstVersionOffer} from './pricing';
import {freshRecovery,writingKey,planMotionRecovery,diagnoseMotionFailure,incompleteMotionDiagnosis,legacyRepairContractFailure,writerRepairError,resumableRepairTurn,savedRecordingRecheck,restartableWriting,resumableAgentWriting} from './recovery';
import {localRepairDiagnostic,provisionalBuildDiagnostic,bestSavedCandidate,scoreCandidate} from './diagnostic';
import {assembleMotionRuntime} from './assembly';
import {observeVideo} from '../agent/observations';
import {z} from 'zod';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {AIResponseError} from '../ai-response';
import {pool} from '@/db';
import {getSetting} from '../settings';
import {reserveCredits,settleCredits} from '../customer-wallet';
import {directMotionFeedback} from './feedback-direction';
import {withCamExecution} from '../providers/live-policy';
import {getMotion,saveMotion,lockMotion,motionDirectory,motionQuote,newMotion} from './store';
import {publicMotion} from './state';
import {Film,Timing,assertMotionRevisionAvailable,digest,validateTiming,assertChecks,type MotionFilm} from './model';
import {AgentPlanFailure} from '../agent/runtime';
import {AIHttpRejection} from '../ai-usage';
import {writeMotion,type WriterInput} from './writer';
import {motionVoice,prepareSavedMotionVoice} from './voice';
import {buildMotion,renderMotion,motionSound,inspectMotion,compileMotion} from './worker';
export type MotionDependencies={diagnose?:typeof diagnoseMotionFailure;voice:typeof motionVoice;write:typeof writeMotion;build:typeof buildMotion;finish:typeof renderMotion;authorize:<T>(id:string,work:()=>Promise<T>)=>Promise<T>};
const dependencies:MotionDependencies={diagnose:diagnoseMotionFailure,voice:motionVoice,write:writeMotion,build:buildMotion,finish:renderMotion,authorize:withCamExecution};
export const StartMotion=z.object({script:z.string().trim().min(10).max(12000),title:z.string().trim().min(1).max(80),requestId:z.uuid(),acceptedPriceUsd:z.number().int().positive()}).strict();
export const MotionAction=z.discriminatedUnion('type',[
 z.object({type:z.literal('approve-board'),revision:z.number().int(),votes:z.record(z.string(),z.boolean())}),
 z.object({type:z.literal('approve-visuals'),revision:z.number().int()}),
 z.object({type:z.literal('approve-finishing'),revision:z.number().int()}),
 z.object({type:z.literal('quote-revision'),revision:z.number().int(),targets:z.array(z.string()).min(1),feedback:z.string().trim().min(3).max(4000)}),
 z.object({type:z.literal('revise'),revision:z.number().int(),targets:z.array(z.string()).min(1),feedback:z.string().trim().min(3).max(4000),quoteId:z.string().min(1),acceptedPriceUsd:z.number().positive()}),
 z.object({type:z.literal('defer-feedback'),revision:z.number().int(),feedback:z.string().trim().min(1).max(4000)}),
 z.object({type:z.literal('finishing'),revision:z.number().int(),music:z.enum(['normal','quiet','off']),captions:z.boolean()}),
 z.object({type:z.literal('resume'),revision:z.number().int()}),
 z.object({type:z.literal('save'),revision:z.number().int()}),
]);
/** Creation binds the client to the first-version price shown on the creation screen (Shimi's grid of 2026-10-23):
 * the price is recomputed here from the same allowances, must equal the accepted one, and is saved with its
 * estimate before any paid step. A changed price is a client message, never a silent recompute. */
export async function startMotion(actor:string,value:unknown,preflight=async()=>{await motionPreflight();await motionWriterReady();},offer=motionFirstVersionOffer){const input=StartMotion.parse(value);const current=await offer();if(input.acceptedPriceUsd!==current.priceUsd)throw new ClientMessage(`The film price is now $${current.priceUsd}. Review the price before starting.`);const id=await newMotion(actor,input);await lockMotion(id,async()=>{const s=await getMotion(id,actor);if(s.progress!=='Waiting to start')return;await supervisedStep({jobId:id,category:'motion',stage:'preflight',inputs:{script:s.script},directory:motionDirectory(id),assertOwned:async()=>{},execute:preflight});const q=await motionQuote(id,0,{totalUsd:current.priceUsd});await reserveCredits(id,q.quoteId,q.quote);s.acceptedPriceUsd=current.priceUsd;s.firstVersionOffer=current;s.recovery=freshRecovery();s.progress='Preparing your recording';await saveMotion(id,s);});return id;}
export async function actMotion(id:string,actor:string,value:unknown,options:{estimate?:typeof estimateMotionRevision;direct?:typeof directMotionFeedback}={}){const action=MotionAction.parse(value);return lockMotion(id,async()=>{
 const s=await getMotion(id,actor);if(action.revision!==s.revision)throw Error('This film has changed. Review its latest version.');
 if(action.type==='save'){await pool.query('UPDATE jobs SET saved_to_library=true WHERE id=$1',[id]);s.saved=true;await saveMotion(id,s);return publicMotion(id,s);}
 if(action.type==='defer-feedback'){s.deferredFeedback=action.feedback;s.revisionQuote=undefined;await saveMotion(id,s);return publicMotion(id,s);}
 if(['queued','working'].includes(s.phase))throw Error('Your film is already being prepared.');
 if(action.type==='approve-board'){
  if(s.phase!=='board'||!s.film||s.film.scenes.some(scene=>action.votes[scene.id]!==true))throw Error('Watch and approve every scene before continuing.');
  s.votes=action.votes;s.approved.board=s.revision;s.phase='visuals';s.progress='Review the complete film visuals';
 }else if(action.type==='approve-visuals'){
  if(s.phase==='board'){s.approved.board=s.revision;s.phase='visuals';}
  if(s.phase!=='visuals')throw Error('Watch the current version of your film first.');
  s.approved.visuals=s.revision;s.work='finish';s.phase='queued';s.progress='Preparing the finishing review';
 }else if(action.type==='approve-finishing'){
  if(s.phase!=='finishing'||s.approved.visuals!==s.revision||!s.mediaHash)throw Error('Review the complete finished film first.');
  if(Object.values(s.operations).some(o=>o.input?.contract===4)&&s.creativeApproval?.sourceHash!==digest(s.film!.source))throw Error('The visual review does not match the current film. Your work is saved for review.');
  const file=await readFile(path.join(motionDirectory(id,s.revision),'final.mp4'));if(digest(file)!==s.mediaHash)throw Error('The finished film has changed. Review it again.');
  // Senior review 2026-10-21: the client's explicit approval is the release gate. Claude's
  // delivery review is kept as recorded notes; it can no longer lock a paid download.
  try{await reviewDelivery({jobId:id,category:'motion',mediaHash:s.mediaHash,file:path.join(motionDirectory(id,s.revision),'final.mp4'),script:s.script,facts:{humanApproval:'This final approval action',approved:s.approved,checks:s.checks,settings:s.settings,deferredFeedback:s.deferredFeedback,consultativeNotes:s.creativeApproval?.issues},evidence:s.film?.scenes.slice(0,2).map(scene=>path.join(motionDirectory(id,s.revision),'evidence',`render-${scene.id}.png`))});s.deliveryNotes=undefined;}
  catch(error){const message=error instanceof Error?error.message:String(error);if(!message.startsWith('Final review:'))throw error;s.deliveryNotes=message.slice('Final review:'.length).trim();}
  await settleCredits(id,true);s.approved.finishing=s.mediaHash;s.phase='complete';s.progress='Your film is ready';
  await pool.query("UPDATE jobs SET status='succeeded',output_path=$2,finished_at=now() WHERE id=$1",[id,path.join(motionDirectory(id,s.revision),'final.mp4')]);
 }else if(action.type==='revise'||action.type==='quote-revision'){
  if(!['board','visuals'].includes(s.phase)||!s.film)throw Error('Revisions are available while reviewing your storyboard or film visuals.');
  if(action.targets.some(t=>!s.film!.scenes.some(scene=>scene.id===t)))throw Error('Select a scene from this film.');
  assertMotionRevisionAvailable(s.revision+1);
  if(action.type==='quote-revision'){
   const targets=revisionTargets(action.targets),direction=await supervisedStep({jobId:id,category:'motion',stage:'feedback',inputs:{revision:s.revision,targets,feedback:action.feedback,source:digest(s.film.source)},directory:motionDirectory(id,s.revision),assertOwned:async()=>{},execute:()=>(options.direct??directMotionFeedback)(id,s,targets,action.feedback)});
   if(direction.finishingFeedback)s.deferredFeedback=[s.deferredFeedback,direction.finishingFeedback].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join('\n');
   if(direction.stage==='finishing'){s.revisionQuote=undefined;await saveMotion(id,s);return publicMotion(id,s);}
   if(direction.actionable===false){s.revisionQuote=undefined;await saveMotion(id,s);throw new ClientMessage(direction.summary||'Your note does not tell us what to change yet. Name a scene or a moment and what feels wrong: rhythm, timing, size, a word.');}
   const cost=await (options.estimate??estimateMotionRevision)(s,targets,direction.visualFeedback);
   const amounts=revisionAmounts(cost.supplierUsd,acceptedMotionPrice(s));
   s.revisionQuote={id:`motion-revision-${randomUUID()}`,revision:s.revision,sourceHash:digest(s.film.source),targets,feedback:direction.visualFeedback,originalFeedback:action.feedback,...(direction.summary?{summary:direction.summary}:{}),expiresAt:Date.now()+15*60*1000,estimate:cost,...amounts};
   await motionQuote(id,s.revision+1,s.revisionQuote);await saveMotion(id,s);return publicMotion(id,s);
  }
  const offer=assertRevisionQuote(s,action);
  await reserveCredits(id,`${id}-${offer.id}`,offer.id);
  s.acceptedPriceUsd=offer.totalUsd;s.revisionQuote=undefined;
  s.history.push({revision:s.revision,film:s.film,mediaHash:s.mediaHash});s.revision++;s.work='revision';s.targets=[...new Set(action.targets)];s.feedback=action.feedback;s.votes={};s.approved={};s.checks=undefined;s.mediaHash=undefined;s.phase='queued';s.progress='Applying your requested changes';
 }else if(action.type==='finishing'){
  if(s.phase!=='finishing')throw Error('Sound and subtitle settings are available at the finishing step.');
  s.settings={music:action.music,captions:action.captions};s.work='finish';s.phase='queued';s.progress='Updating the finishing preview';s.approved.finishing=undefined;
 }else if(action.type==='resume'){
  if(s.phase!=='blocked')throw Error('This film does not need resuming.');
  s.recovery??=freshRecovery();
  if(savedRecordingRecheck(s)){
   // Free local recheck of the saved recording with the current comparator.
   // No provider contact, no new speech: if it passes, the stop was ours.
   try{await prepareSavedMotionVoice(motionDirectory(id),s.script,s);}
   catch(error){throw Error(`The saved recording still does not match the script: ${error instanceof Error?error.message:String(error)} Your recording is preserved.`);}
   s.recovery.reconciliations=[...(s.recovery.reconciliations??[]),{at:new Date().toISOString(),operation:'voice',reason:`Resume rechecked the saved recording locally with the current transcript comparator: it matches the script. Previous stop: ${(s.error??'').slice(0,200)}`}];
   s.error=undefined;s.recovery.nextAt=0;s.phase='queued';s.progress='Preparing your recording';
   await saveMotion(id,s);await observeVideo(id,async()=>({attemptedAction:action,result:{phase:s.phase,revision:s.revision,recheckedRecording:true}}));return publicMotion(id,s);
  }
  const agentTurn=resumableAgentWriting(s);
  if(agentTurn){
   // Contract 6: the persisted turn and its working file continue as they are.
   s.operations[agentTurn]={...s.operations[agentTurn],state:'sending'};
   s.recovery.reconciliations=[...(s.recovery.reconciliations??[]),{at:new Date().toISOString(),operation:agentTurn,reason:`Resume continued the agent writing turn under its own identity. Previous stop: ${(s.error??'').slice(0,300)}`}];
   s.error=undefined;s.recovery.nextAt=0;s.phase='queued';s.progress='Writing your scenes';
   await saveMotion(id,s);await observeVideo(id,async()=>({attemptedAction:action,result:{phase:s.phase,revision:s.revision,resumedAgentWriting:agentTurn}}));return publicMotion(id,s);
  }
  const restartable=restartableWriting(s);
  if(restartable){
   // The stopped operation keeps its receipts under a journaled key; the
   // writing restarts as a fresh bounded turn with the current contract.
   const stopped=s.operations[restartable];const n=Object.keys(s.operations).filter(k=>k.startsWith(`${restartable}-stopped-`)).length+1;
   s.operations[`${restartable}-stopped-${n}`]=stopped;delete s.operations[restartable];
   s.recovery.reconciliations=[...(s.recovery.reconciliations??[]),{at:new Date().toISOString(),operation:restartable,reason:`Resume restarted the initial writing as a fresh bounded turn after a format rejection with no saved candidate. Previous stop: ${(s.recovery.supervision?.current?.input.error??s.error??'').slice(0,300)}`}];
   s.error=undefined;s.recovery.nextAt=0;s.phase='queued';s.progress='Writing your scenes';
   await saveMotion(id,s);await observeVideo(id,async()=>({attemptedAction:action,result:{phase:s.phase,revision:s.revision,restartedWriting:restartable}}));return publicMotion(id,s);
  }
  const resumable=resumableRepairTurn(s);
  if(resumable){
   // The saved repair turn keeps its identity, allowance and counters; only the
   // executor stop is lifted, and the reconciliation is journaled in the state.
   // The writer's own best saved candidate (by the measured checks) becomes the
   // repair base when it is strictly closer to passing than the pinned one. The
   // previous input stays journaled; no creative choice is made here.
   const operation=s.operations[resumable],pinned=operation.input!;let rebased='';let passesChecks=false;
   const reviewed=(i:WriterInput|undefined)=>Boolean(i?.repair?.currentDiagnostic?.startsWith('Technical checks pass.'));
   const revising=reviewed(pinned)||(operation.previousInputs??[]).some(reviewed);
   if(s.voice&&s.timing&&pinned.repair?.failedFilm){
    const reference=await readFile(path.resolve('motion/reference/plot-hole-v4-safe.py'),'utf8');
    // Once Claude's visual review has asked for corrections, every later turn
    // belongs to that revision: its newest building candidate is the base, never
    // the earlier technically clean film that the review rejected.
    const windows:{from:number;to:number}[]=[];
    if(revising){
     const rows=(await pool.query("SELECT created_at,updated_at,state FROM cam_agent_turns WHERE session_id=$1 AND state->'loadedSkills' ? 'motion-method'",[id])).rows as {created_at:Date;updated_at:Date;state:{messages:{content:unknown}[]}}[];
     for(const row of rows){try{const first=row.state.messages[0]?.content;const text=Array.isArray(first)?(first as {text?:string}[]).find(p=>typeof p.text==='string')?.text:undefined;const request=JSON.parse(JSON.parse(text!).currentRequest);if(typeof request?.repair?.currentDiagnostic==='string'&&(request.repair.currentDiagnostic.startsWith('Technical checks pass.')||request.repair.currentDiagnostic.includes('visual review')))windows.push({from:row.created_at.getTime(),to:row.updated_at.getTime()});}catch{/* a turn without a parsable request is not a revision turn */}}
    }
    const best=await bestSavedCandidate(motionDirectory(id),reference,s.timing,s.voice,pinned.repair.failedFilm,{preferNewestBuilding:revising,...(revising&&windows.length?{within:windows}:{})}).catch(()=>null);
    if(best&&!(revising&&best.at<=((await stat(path.join(motionDirectory(id),`candidate-${digest(pinned.repair.failedFilm.source).slice(0,16)}`)).catch(()=>null))?.mtimeMs??0))){
     const failedFilm=best.film;let currentDiagnostic=best.diagnostic??undefined;passesChecks=best.score===0;
     if(revising&&currentDiagnostic)currentDiagnostic+=' This candidate already carries the corrections requested by the visual review; keep them while fixing the above.';
     if(revising&&!currentDiagnostic)currentDiagnostic=undefined;
     // A candidate that passes every technical check may still carry Claude's
     // persisted visual verdict: those observations are then the correction to make.
     if(!currentDiagnostic){
      const review=await readFile(path.join(motionDirectory(id),`candidate-${digest(failedFilm.source).slice(0,16)}`,'creative-review.json'),'utf8').then(JSON.parse).catch(()=>null) as {sourceHash?:string;review?:{verdict?:string;issues?:unknown[]}}|null;
      // The candidate directory is named by the raw answer hash; the review is bound to the assembled source.
      const assembledHash=await assembleMotionRuntime(failedFilm,reference,s.timing).then(f=>digest(f.source)).catch(()=>null);
      if(review&&(review.sourceHash===digest(failedFilm.source)||review.sourceHash===assembledHash)&&review.review?.verdict==='revise'&&review.review.issues?.length)currentDiagnostic=`Technical checks pass. Claude's visual review of the rendered frames returned revise with these observations and corrections: ${JSON.stringify(review.review.issues)}. Make each requested movement actually visible in the scene, preserving narration, scope and all passing checks. The review frames are sampled at each scene's entry, settle, middle and outgoing moments and in the middle of its registered animation events (calls that record ev(): L, SWG, MO, DR, FA, BLUR, M). A movement written with a bare mv() is never sampled and therefore never seen: register every movement the review must see with M(js, t0, t1, label).`;
     }
     operation.previousInputs=[...(operation.previousInputs??[]),pinned];
     operation.input={...pinned,repair:{...pinned.repair,failedFilm,error:currentDiagnostic??pinned.repair.error,...(currentDiagnostic?{currentDiagnostic}:{})}};
     rebased=` Repair base re-pinned to the writer's saved candidate ${digest(failedFilm.source).slice(0,16)} (check score ${best.score} instead of ${best.currentScore}).`;
    }
   }
   if(operation.state==='failed'&&!rebased&&s.timing&&pinned.repair?.failedFilm&&!pinned.repair.currentDiagnostic?.startsWith('Technical checks pass.')){
    // Already pinned to the best candidate: carry its persisted visual verdict if any.
    const reference=await readFile(path.resolve('motion/reference/plot-hole-v4-safe.py'),'utf8');
    const film=pinned.repair.failedFilm,assembledHash=await assembleMotionRuntime(film,reference,s.timing).then(f=>digest(f.source)).catch(()=>null);
    const review=await readFile(path.join(motionDirectory(id),`candidate-${digest(film.source).slice(0,16)}`,'creative-review.json'),'utf8').then(JSON.parse).catch(()=>null) as {sourceHash?:string;review?:{verdict?:string;issues?:unknown[]}}|null;
    if(review&&(review.sourceHash===digest(film.source)||review.sourceHash===assembledHash)&&review.review?.verdict==='revise'&&review.review.issues?.length){
     const currentDiagnostic=`Technical checks pass. Claude's visual review of the rendered frames returned revise with these observations and corrections: ${JSON.stringify(review.review.issues)}. Make each requested movement actually visible in the scene, preserving narration, scope and all passing checks. The review frames are sampled at each scene's entry, settle, middle and outgoing moments and in the middle of its registered animation events (calls that record ev(): L, SWG, MO, DR, FA, BLUR, M). A movement written with a bare mv() is never sampled and therefore never seen: register every movement the review must see with M(js, t0, t1, label).`;
     operation.previousInputs=[...(operation.previousInputs??[]),pinned];operation.input={...pinned,repair:{...pinned.repair,error:currentDiagnostic,currentDiagnostic}};rebased=' Repair input now carries the persisted visual review verdict.';
    }
   }
   // A candidate that passes every technical check is first re-judged on fresh
   // mid-event evidence. An approval ends the repair without another writer turn;
   // a refusal becomes the next repair diagnostic. Same bytes, better evidence.
   const rebasedFilm=operation.input?.repair?.failedFilm;
   if(rebasedFilm&&s.voice&&s.timing&&(passesChecks||revising&&operation.input?.repair?.currentDiagnostic?.startsWith('Technical checks pass.'))){
    const dir=path.join(motionDirectory(id),`candidate-${digest(rebasedFilm.source).slice(0,16)}`);
    await compileMotion(dir,rebasedFilm,s.timing,s.voice,undefined,[],{compositionOnly:true});await inspectMotion(dir);
    const model=process.env.CAM_MOTION_MODEL??await getSetting<string>('ai_deep_model')??'anthropic/claude-sonnet-5';
    const result=await reviewMotionCreative({jobId:id,model,dir,film:rebasedFilm,targets:[],feedback:'',beforeImages:[],maximumUsd:motionBudgets().reviewUsd});
    s.receipts.push({kind:'writing',requestId:`agent-review-${digest(rebasedFilm.source).slice(0,16)}-${Date.now()}`,actualUsd:result.actualUsd,model});
    // The verdict is consultative: the film proceeds to the board with its notes.
    operation.state='complete';operation.result=rebasedFilm;operation.id=`agent-review-${digest(rebasedFilm.source).slice(0,16)}`;s.creativeApproval=result.approval;
    s.recovery.reconciliations=[...(s.recovery.reconciliations??[]),{at:new Date().toISOString(),operation:resumable,reason:`Review of candidate ${digest(rebasedFilm.source).slice(0,16)} on mid-event evidence: ${result.review.verdict} (${result.review.issues.length} notes). No writer turn; the board shows the notes.`}];
    s.error=undefined;s.recovery.nextAt=0;s.phase='queued';s.progress='Composing your film';
    await saveMotion(id,s);await observeVideo(id,async()=>({attemptedAction:action,result:{phase:s.phase,revision:s.revision,reReviewed:operation.id}}));return publicMotion(id,s);
   }
   if(operation.state==='failed'&&!rebased&&pinned.repair?.failedFilm){
    // Same best candidate, same diagnostic: a fresh bounded turn, told what the
    // previous one did wrong. The previous turn keeps its identity and receipts.
    const previousAttempt=(await readFile(path.join(motionDirectory(id,s.revision),'failure.log'),'utf8').catch(()=>s.error??'')).split('\n')[0].slice(0,1500);
    // The validator may have improved since the diagnostic was pinned: refresh it, free of charge.
    const refreshed=s.voice&&s.timing?await scoreCandidate(pinned.repair.failedFilm,await readFile(path.resolve('motion/reference/plot-hole-v4-safe.py'),'utf8'),s.timing,s.voice,path.join(motionDirectory(id),'diagnostic-score-refresh')).then(r=>r.diagnostic).catch(()=>null):null;
    operation.previousInputs=[...(operation.previousInputs??[]),pinned];
    operation.input={...pinned,repair:{...pinned.repair,...(refreshed?{error:refreshed,currentDiagnostic:refreshed}:{}),resumption:(pinned.repair.resumption??0)+1,previousAttempt:`A previous bounded turn on this same candidate stopped without an accepted patch. Its last result: ${previousAttempt}. Do not repeat that mistake; keep every protected line and submit one complete patch.`}};
    rebased=` Fresh bounded turn ${(pinned.repair.resumption??0)+1} on the same candidate with the previous stop recorded.`;
   }
   if(operation.state==='failed'&&!rebased)throw Error('This film needs a closer saved composition before another correction turn; none was found. Your work is preserved.');
   if(operation.state==='failed'){operation.state='sending';delete operation.result;}
   s.recovery.reconciliations=[...(s.recovery.reconciliations??[]),{at:new Date().toISOString(),operation:resumable,reason:`Resume requested while ${resumable} was still sending with a pinned contract-5 input: the saved writer turn continues from its last step.${rebased} Previous stop: ${(s.recovery.supervision?.current?.input.error??s.error??'').slice(0,300)}`}];
   s.error=undefined;s.recovery.nextAt=0;s.phase='queued';s.progress='Please wait — correcting the composition';
   await saveMotion(id,s);await observeVideo(id,async()=>({attemptedAction:action,result:{phase:s.phase,revision:s.revision,resumedOperation:resumable}}));return publicMotion(id,s);
  }
  if(incompleteMotionDiagnosis(s)){
   const diagnostic=await savedWritingDiagnostic(id,s);
   if(!diagnostic)throw Error('The original writing diagnostic could not be recovered. Your work is preserved.');
   const contractRepair=legacyRepairContractFailure(s);
   consumeRecovery(s.recovery.supervision);s.error=contractRepair?`${diagnostic}\nExecutor update: authoring contract 5 now pins the complete rejected candidate as the repair patch base and exchanges typed numeric timing data. The previous "candidate none" rejection was an executor defect, not missing source. Preserve the script and use the remaining repair allowance only if a supported correction is possible; do not change the customer price.`:diagnostic;
  }else s.error=s.recovery.supervision?.current?.input.error??s.error??'Interrupted saved work requires analysis.';
  s.phase='queued';s.progress='Analysing the saved interruption';
 }
 if(s.phase==='queued'&&action.type!=='resume')s.recovery=freshRecovery();
 await saveMotion(id,s);await observeVideo(id,async()=>({attemptedAction:action,result:{phase:s.phase,revision:s.revision,approved:s.approved,progress:s.progress}}));return publicMotion(id,s);
 });}
export async function runMotion(id:string,actor:string,deps:MotionDependencies=dependencies,background=false){
 // This lock spans the worker, preventing two processes from charging/rendering the same request.
 return lockMotion(id,async()=>{
  const s=await getMotion(id,actor);if(background&&!s.recovery?.enabled)return;if(s.phase!=='queued'&&!(background&&s.phase==='working'))return;if((s.recovery?.nextAt??0)>Date.now())return;
  if(s.error){
   const recovered=deps.diagnose&&await planMotionRecovery(s,s.error,input=>deps.authorize(id,()=>deps.diagnose!(input)),id,()=>saveMotion(id,s));
   if(!recovered){s.phase='blocked';s.error=recoveryView(s.recovery?.supervision)?.message??s.error;}await saveMotion(id,s);return;
  }
  consumeRecovery(s.recovery?.supervision);s.phase='working';await saveMotion(id,s);
  const heartbeat=setInterval(()=>{void pool.query('UPDATE motion_runs SET updated_at=now() WHERE job_id=$1',[id]).catch(()=>{});},15000);
  const save=()=>saveMotion(id,s);const progress=async(text:string)=>{s.progress=text;await save();};const dir=motionDirectory(id,s.revision);
  try{
   await mkdir(dir,{recursive:true});
   if(s.work==='finish'){
    await progress('Finishing sound, editing and subtitles');
    const raw=await readFile(path.join(dir,'render.html'),'utf8');const clean=raw.replace(/<style id="motion-captions">[\s\S]*?<\/style>/,'');
    await writeFile(path.join(dir,'render.html'),clean.replace('</head>',`${s.settings.captions?'':'<style id="motion-captions">.clip{display:none!important}</style>'}</head>`));
    const browser=await inspectMotion(dir);const sound=await motionSound(dir,s.settings.music);if(!s.checks)throw Error('Quality checks are missing.');s.checks={...s.checks,...browser,...sound};assertChecks(s.checks);await deps.finish(dir,'delivery');
    s.mediaHash=digest(await readFile(path.join(dir,'final.mp4')));s.phase='finishing';s.progress='Review sound, editing and subtitles';
   }else{
    if(!s.voice||!s.timing){await progress('Preparing your recording');const voice=await deps.authorize(id,()=>deps.voice(motionDirectory(id),s.script,s,save));s.voice=voice.voice;s.timing=Timing.parse(voice.timing);s.receipts.push(voice.receipt);await save();}
    validateTiming(s.timing,s.script);
    const key=writingKey(s),previous=s.work==='revision'?s.history.at(-1)?.film:undefined;
    let film=s.operations[key]?.state==='complete'?s.operations[key].result as MotionFilm:undefined;
    if(!film){if(s.operations[key]&&!s.operations[key].agentManaged)throw Error('Writing request needs reconciliation. No automatic retry was made.');
     await progress(s.recovery?.codeRepairs?'Please wait — correcting the composition':'Writing your scenes');
     if(s.operations[key]?.state==='sending'&&!s.operations[key].input)throw Error('Legacy writing input needs reconciliation before resuming.');
     const operation=s.operations[key]??={state:'sending',agentManaged:true};
     // Persist the exact authorized writer input before transport. A restart or
     // a later diagnostic must not invent another identity for the same work.
     if(!operation.input){
      const failedFilm=Object.entries(s.operations).filter(([k,o])=>(k===`writing-${s.revision}`||k.startsWith(`writing-${s.revision}-repair-`))&&Film.safeParse(o.result).success).sort(([a],[b])=>Number(b.split('-repair-')[1]??0)-Number(a.split('-repair-')[1]??0)).map(([,o])=>Film.parse(o.result))[0];
      // Pin the exact current validator diagnostic with the input: the writer
      // and any restart reason about the same evidence, under the same identity.
      const reference=motionWriterContract()===5&&s.recovery?.codeRepairs&&failedFilm?await readFile(path.resolve('motion/reference/plot-hole-v4-safe.py'),'utf8'):'';
      const currentDiagnostic=reference&&failedFilm?await localRepairDiagnostic(failedFilm,reference,s.timing!,previous,s.targets):null;
      const provisionalBuild=currentDiagnostic&&!previous&&s.voice?await provisionalBuildDiagnostic(failedFilm!,reference,s.timing!,s.voice,path.join(motionDirectory(id),`diagnostic-${digest(failedFilm!.source).slice(0,16)}`)).catch(()=>null):null;
      operation.input={contract:motionWriterContract(),jobId:id,revision:s.revision,script:s.script,timing:s.timing!,previous,targets:s.targets,feedback:s.feedback,...(s.recovery?.codeRepairs?{repair:{attempt:s.recovery.codeRepairs,error:writerRepairError(s),failedFilm,...(currentDiagnostic?{currentDiagnostic}:{}),...(provisionalBuild?{provisionalBuild}:{})}}:{})};
     }
     await save();
     const result=await deps.authorize(id,()=>deps.write(operation.input!));
     film=Film.parse(result.film);
     if(operation.input!.contract===4||operation.input!.contract===5||operation.input!.contract===6){
      // The review is consultative: present and current, it is shown; otherwise the film ships without notes.
      const approval=CreativeApproval.safeParse(result.creativeApproval);
      s.creativeApproval=approval.success&&approval.data.sourceHash===digest(film.source)?approval.data:undefined;
     }
     s.operations[key]={state:'complete',agentManaged:true,input:operation.input,id:result.receipt.requestId,result:film};s.receipts.push(result.receipt);await save();
    }
    const result=await deps.build({dir,film,timing:s.timing,voice:s.voice,previous,targets:s.targets,progress});
    // Shimi's decision of 2026-10-21: no scene-by-scene storyboard for Motion. Each
    // version is a complete film; the client gives general feedback, then V2, V3.
    s.film=film;s.checks=result.checks;s.htmlHash=result.htmlSha256;s.mediaHash=digest(await readFile(path.join(dir,'preview.mp4')));s.approved.board=s.revision;s.phase='visuals';s.progress=`Version ${s.revision+1} of your film is ready`;
   }
   s.error=undefined;await save();
  }catch(error){
   if(error instanceof AIResponseError){const r=error.failure.receipt;s.receipts.push({kind:'writing',requestId:r.usage.requestId,actualUsd:r.actualUsd,model:r.model,inputTokens:r.usage.inputTokens,outputTokens:r.usage.outputTokens});s.operations[writingKey(s)]={...s.operations[writingKey(s)],state:'failed',agentManaged:true,id:r.usage.requestId,result:{failure:error.failure.code}};}
   if(error instanceof AgentPlanFailure){const candidate=Film.safeParse(error.candidate);s.operations[writingKey(s)]={...s.operations[writingKey(s)],state:'failed',agentManaged:true,...(candidate.success?{result:candidate.data}:{})};}
   if(error instanceof AIHttpRejection)s.operations[writingKey(s)]={...s.operations[writingKey(s)],state:'failed',agentManaged:true,result:{httpStatus:error.status,diagnostic:error.detail}};
   const diagnostic=error instanceof Error?error.stack??error.message:String(error);
   await writeFile(path.join(dir,'failure.log'),diagnostic);
   await writeFile(path.join(dir,`failure-${s.recovery?.attempts??0}.log`),diagnostic);
   s.error=error instanceof Error?error.message:String(error);s.progress='Please wait — checking an interruption and preserving your work';await save();
   let recovered=false;
   // Agent writer (contract 6): a turn that stopped at its allowance or step limit leaves a saved working file.
   // Continuing from that file is deterministic work, not a decision: start the next bounded attempt directly
   // (at most two), without spending a supervisor turn (live case 2026-10-21, "Emilio Agent 2" stopped at $6.18 with every scene written).
   const stopMessage=s.error??'';
   // A provider capacity refusal (OpenRouter 402 "in-flight requests", 429, 5xx) is waited out and retried on a timer, up to five times, without a supervisor decision (three such stops on 2026-10-21 within one film).
   if(error instanceof AIHttpTransient&&s.recovery?.enabled&&(s.recovery.transientRetries??0)<5){
    s.recovery.transientRetries=(s.recovery.transientRetries??0)+1;s.recovery.nextAt=Date.now()+90_000*s.recovery.transientRetries;
    s.recovery.reconciliations=[...(s.recovery.reconciliations??[]),{at:new Date().toISOString(),operation:writingKey(s),reason:`Provider capacity refusal ${s.recovery.transientRetries}/5, retry scheduled: ${stopMessage.slice(0,200)}`}];
    s.error=undefined;s.phase='queued';s.progress='Please wait — the writing service is busy, retrying shortly';recovered=true;
   }
   const agentOp=s.operations[writingKey(s)];
   if(!recovered&&error instanceof AgentPlanFailure&&agentOp?.input?.contract===6&&s.recovery?.enabled&&s.recovery.codeRepairs<Number(process.env.CAM_MOTION_AGENT_CONTINUATIONS??3)&&Film.safeParse(agentOp.result).success){
    s.recovery.codeRepairs++;s.recovery.nextAt=0;
    s.recovery.history.push({attempt:s.recovery.attempts,error:stopMessage,decision:{action:'repair-code',reason:'Deterministic continuation of the agent writing turn from its saved working file; no supervisor decision was needed.'}});
    s.recovery.reconciliations=[...(s.recovery.reconciliations??[]),{at:new Date().toISOString(),operation:writingKey(s),reason:`Agent writing attempt ${s.recovery.codeRepairs} continues from the saved working file after: ${stopMessage.slice(0,300)}`}];
    s.error=undefined;s.phase='queued';s.progress='Please wait — continuing your film from its saved state';recovered=true;
   }
   try{if(!recovered&&deps.diagnose)recovered=await planMotionRecovery(s,error,async input=>{await save();return deps.authorize(id,()=>deps.diagnose!(input));},id,save);}
   catch(diagnosisError){await writeFile(path.join(dir,'recovery-failure.log'),String(diagnosisError));}
   if(!recovered){s.phase='blocked';s.error=recoveryView(s.recovery?.supervision)?.message??'The saved recovery analysis could not complete. Your work is preserved.';s.progress='Your saved work needs attention';}
   await save();
  }finally{clearInterval(heartbeat);await observeVideo(id,async()=>({workerResult:{phase:s.phase,revision:s.revision,error:s.error,checks:s.checks,mediaHash:s.mediaHash,progress:s.progress}}));}
 },background);
}

/** Durable opt-in only. Taking the lock proves any prior worker released it;
 * persisted provider identities and agent receipts are reused after a restart. */
export async function runQueuedMotions(deps:MotionDependencies=dependencies){
 const rows=(await pool.query("SELECT m.job_id,m.actor_id FROM motion_runs m JOIN jobs j ON j.id=m.job_id WHERE j.deleted_at IS NULL AND m.state->'recovery'->>'enabled'='true' AND m.state->>'phase' IN ('queued','working') ORDER BY m.updated_at LIMIT 10")).rows;
 for(const row of rows)await runMotion(row.job_id,row.actor_id,deps,true);
}
