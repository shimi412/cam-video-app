import { referenceSheetPreparations } from "./reference-sheet-preparation";
import {supersededImage} from "./image-recovery";
import type { CharacterReference } from "./character-sheet-policy";
import { editorialTimeline } from "./editorial-method";
import { KLING_PRO, KLING_STANDARD, HF_SEEDANCE, draftOperationId, type VideoModels, type VideoWorkflow } from "./model-selection";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import type { ProductionParams } from "../brain";
import type { Recipe } from "../recipes";
import { assertTransportMode, type QueueRequest, type TransportMode } from "./provider-transports";
import { generationPlan, materializeRequest, type GenerationOperation } from "./generation-plan";
import { planConcept } from "./storyboard";
import { placeholderTiming } from "./timing";
import { Hash, readCheckpoint, saveCheckpoint, sha256 } from "./checkpoints";
import { advanceRequest, DefinitiveRequestFailure, RequestBinding, requestReceipts } from "./request-journal";
import { RetryableReadError } from "../providers/network";
import { budgetedQueue, type BudgetApproval, type BudgetQuote, type createBudget } from "./budget";
import { downloadResult, uploadReference, type AssetTransport } from "./media-transfers";
import { alignVoice, alignmentHash, scriptHash, whisperAlignment, TranscriptMismatchError } from "./voice-alignment";
import type { AlignmentRecoveryInput } from "./local-voice-alignment";
import type { VoiceAlignment } from "./voice-alignment";
import { alignedGenerationPlan } from "./aligned-plan";
import { CAM_VOICE } from "./cam-voice";
import { sceneWorkflow } from "./scene-workflow";
import { importedVisualTarget, visualReview } from "./visual-review";
import { mediaFile, type SceneMedia } from "./preview-inputs";
import { stageSceneMedia, verifiedSceneMedia } from "./imported-media";
import type { ConceptBoard, ConceptTiming } from "./types";
import { writeMontage } from "./montage";
import { checkpointedRender } from "./render-checkpoint";
import { renderConcept, downscalePreview } from "./render";
import { controls, validateTiming } from "./controls";
import { subtitleFile } from "./existing-run";
import { selectedNarration } from "./narration";
import { finishingBoard, type Finishing } from "./finishing";
import { prepareEditorialAudio, checkEditorialAudio } from "./editorial-audio";
import { StoryboardSheetSchema, applyStoryboardEdits, storyboardReviewContent, type StoryboardEdits, type StoryboardPanel } from "./storyboard-review";
import { inspectImageQuality } from "./image-quality";
import { applyImageRevisions, type ImageRevisions } from "./storyboard-feedback";

export type FlowPlan = ReturnType<typeof generationPlan>;
export type FlowReview = { stage: "script" | "voice" | "direction" | "start" | "end" | "storyboard" | "draft" | "draft-film" | "finishing-film" | "clip"; scene: number | null; target: string;
  film?: { file: string; sha256: string; duration: number }; media?: SceneMedia; storyboard?: StoryboardPanel[]; audio?: { file: string; sha256: string; duration: number }; timing?: ConceptTiming };
const Decision = z.object({ id: z.uuid(), target: Hash, decision: z.enum(["approved", "rejected"]), mode: z.enum(["simulation", "live"]), source:z.enum(["human","automatic-preparation"]).optional() }).strict();
export type FlowDecision = z.infer<typeof Decision>;
type Reservation = { budget: ReturnType<typeof createBudget>; quote: BudgetQuote; approval: BudgetApproval };
export type FlowServices = {
  mode: TransportMode; assets: AssetTransport;
  recoverAlignment?: (input: AlignmentRecoveryInput) => Promise<VoiceAlignment>;
  videoModels?: VideoModels; videoWorkflow?: VideoWorkflow;
  reviewPolicy?: "storyboard-first";
  storyboardBeforeVoice?: boolean; // New jobs prepare approved images before any narration/animation.
  imageRetries?:Record<string,number>;
  storyboardEdits?: StoryboardEdits;
  imageRevisions?: ImageRevisions;
  /** A provider's definitive refusal of a revised image is reworked internally (Shimi, 2026-10-22): the director rewrites the instruction, the batch continues with the next attempt, the client sees no error. Returns null when no rework is possible. */
  reworkRefusedImage?: (input:{scene:number;narration:string;revision:ImageRevisions[string];reason:string;attempt:number}) => Promise<{revision:ImageRevisions[string];attempt:number}|null>;
  reuseOnly?: boolean; completedInputs?: Record<string,string>; // Exact previously completed payloads authorized for reuse during a film correction.
  allowPendingCost?: boolean; // Keep the approved reservation while a receipt is unavailable.
  queue: (operation: GenerationOperation, payload: Record<string, unknown>) => QueueRequest;
  authorize: (plan: FlowPlan) => Promise<Reservation | null>;
  cost: (operation: GenerationOperation, requestId: string) => Promise<{ unit: "usd" | "higgsfield-credit"; actual: number; evidence: string } | null>;
  review: (request: FlowReview) => Promise<FlowDecision | null>;
};
type Reference = CharacterReference & {filePath:string};
export type FlowInput = { jobId: string; script: string; params: ProductionParams; recipe: Recipe; references: Reference[];
  directory: string; assertOwned: () => Promise<void>; services: FlowServices };
export type FlowEvent = { stage: string; scene?: number | null; fingerprint: string; reused?: boolean; requestId?: string };
export type RenderPacket = { mode: TransportMode; jobId: string; board: ConceptBoard; timing: ConceptTiming; aspectRatio: ProductionParams["aspectRatio"];
  voiceOrigin?: "generated-bram" | "reviewed-import"; voiceFile: string; audioSha256: string; alignmentSha256: string; media: Record<string, SceneMedia>; reviews: FlowDecision[]; fingerprint: string };
export type FlowOutcome = { status: "awaiting-review" | "rejected" | "awaiting-budget" | "awaiting-cost" | "pending" | "blocked-duration" | "blocked-scenes" | "ready-to-render";
  phase: string; events: FlowEvent[]; sceneFailures?:number[]; storyboardFailures?:Record<string,string>; storyboardPending?:number[]; review?: FlowReview; plan?: FlowPlan; render?: RenderPacket; paidGenerationAuthorized: boolean };
class Pause extends Error {
  constructor(readonly result: Omit<FlowOutcome, "events" | "paidGenerationAuthorized">) { super(result.phase); }
}
export function flowReviewTarget(mode: TransportMode, jobId: string, stage: FlowReview["stage"], data: unknown) {
  return sha256(JSON.stringify({ version: 1, mode, jobId, stage, data }));
}

/** One resumable production chain. Live mode requires the connected controller
 * and authenticated execution context before any provider access. Every downstream request is bound to the
 * actual reviewed inputs, including normalized voice and image bytes.
 */
export async function advanceProductionFlow(input: FlowInput): Promise<FlowOutcome> {
  const { services, jobId, directory, assertOwned } = input;
  assertTransportMode(services.mode);
  if (services.assets.mode !== services.mode) throw new Error("Mixed production transport modes.");
  z.uuid().parse(jobId); await assertOwned();
  const journal = path.join(directory, "requests");
  const receipts = await requestReceipts(journal);
  if (receipts.some((r) => r.mode !== services.mode || r.binding?.jobId !== jobId)) throw new Error("Production journal belongs to a different job or mode.");
  const previousSheet=services.storyboardBeforeVoice?await readCheckpoint(path.join(directory,"storyboard-review.json"),StoryboardSheetSchema):null;
  const isolatedRevision=(operation:string)=>Boolean(previousSheet&&/^scene-\d+-(?:start|end)(?:-retry-\d+)?$/.test(operation)&&services.imageRevisions?.[Number(operation.split("-")[1])]);
  const independentDraft=(operation:string)=>services.videoWorkflow==="draft-first"?/^scene-\d+-draft(?:-retry-\d+)?$/.test(operation):services.videoWorkflow==="whimsical"&&/^scene-\d+-(?:draft|clip)(?:-retry-\d+)?$/.test(operation);
  if (receipts.some((r) => (r.state === "submitting" || r.state === "failed")&&!supersededImage(r.binding?.operation??"",services.imageRetries??{})&&!isolatedRevision(r.binding?.operation??"")&&!(r.state==="failed"&&independentDraft(r.binding?.operation??"")))) throw new Error("An earlier production request needs reconciliation. No new request was sent.");
  const events: FlowEvent[] = [], decisions: FlowDecision[] = [];
  const review = async (stage: FlowReview["stage"], scene: number | null, data: unknown, details: Partial<FlowReview> = {}) => {
    const request: FlowReview = { ...details, stage, scene, target: flowReviewTarget(services.mode, jobId, stage, data) };
    if (stage === "storyboard") await saveCheckpoint(path.join(directory, "storyboard-review.json"), { version: 1, target: request.target, panels: details.storyboard, retrospective: false }, assertOwned);
    await assertOwned();
    const saved = await services.review(request);
    const internal = services.reviewPolicy === "storyboard-first" && ["voice","direction","start","end"].includes(stage);
    const value = saved ?? (internal ? {id:`${request.target.slice(0,8)}-${request.target.slice(8,12)}-5${request.target.slice(13,16)}-a${request.target.slice(17,20)}-${request.target.slice(20,32)}`,target:request.target,decision:"approved" as const,mode:services.mode,source:"automatic-preparation" as const} : null);
    if (!value) throw new Pause({ status: "awaiting-review", phase: stage, review: request });
    const decision = Decision.parse(value);
    if (decision.target !== request.target || decision.mode !== services.mode) throw new Pause({ status: "awaiting-review", phase: stage, review: request });
    if (decision.decision !== "approved") throw new Pause({ status: "rejected", phase: stage, review: request });
    decisions.push(decision); events.push({ stage: `${decision.source==="automatic-preparation"?"prepare":"review"}-${stage}`, scene, fingerprint: request.target });
    return decision;
  };
  const transfer = { directory: path.join(directory, "transfers"), transport: services.assets, assertOwned };
  // Hosted URLs expire and get refreshed; request identity must follow the reviewed file, not its URL (live Clay 2026-10-23).
  const urlHashes = new Map<string, string>();
  const upload = async (file: string, hash: string, kind: "image/png" | "audio/wav") => {
    const result = await uploadReference({ ...transfer, file, sha256: hash, contentType: kind });
    urlHashes.set(result.url, hash);
    events.push({ stage: "transfer", fingerprint: hash, reused: result.reused }); return result.url;
  };
  const payloadIdentityOf = (payload: unknown) => sha256(JSON.stringify(payload, (_key, value) => typeof value === "string" && urlHashes.has(value) ? `sha256:${urlHashes.get(value)}` : value));
  const execute = async (plan: FlowPlan, op: GenerationOperation, urls: Record<string, string>, evidence: unknown) => {
    const attempt=(op.kind==="image"||/^scene-\d+-(draft|clip)$/.test(op.id))?services.imageRetries?.[op.id]??0:0;
    if(attempt)op={...op,id:`${op.id}-retry-${attempt}`,fingerprint:sha256(JSON.stringify({original:op.fingerprint,attempt}))};
    const payload = materializeRequest(op, urls), payloadIdentity = payloadIdentityOf(payload);
    // A semantic plan fingerprint alone cannot distinguish replaced normalized files or renewed
    // reviews: the identity carries the uploaded file hashes, so a refreshed hosted URL keeps it.
    const operation = { ...op, fingerprint: sha256(JSON.stringify({ mode: services.mode, operation: op.fingerprint, payload: payloadIdentity, evidence })) };
    // Receipts written before 2026-10-23 were keyed by the raw hosted URLs; a completed one for the same
    // operation id, model and transport is reused rather than refused (its scene or cast identity is in the id).
    const legacy = receipts.find(r => r.state === "complete" && r.binding?.operation === op.id && r.binding.model === op.model && r.binding.transport === op.transport && !r.binding.payloadIdentity && r.requestId && r.output);
    if (legacy?.requestId && legacy.output && !services.completedInputs) {
      events.push({ stage: `reuse-legacy-${op.id}`, scene: op.scene, fingerprint: legacy.fingerprint, reused: true, requestId: legacy.requestId });
      return { ...legacy, operation: { ...op, fingerprint: legacy.fingerprint }, output: legacy.output, requestId: legacy.requestId };
    }
    const reusable=receipts.find(r=>r.state==="complete"&&r.binding?.operation===op.id&&r.binding.model===op.model&&r.binding.transport===op.transport&&r.binding.payloadSha256===sha256(JSON.stringify(payload))&&services.completedInputs?.[op.id]===r.binding.payloadSha256);
    if(reusable?.requestId&&reusable.output){
      // Only byte-identical provider inputs can survive a renewed whole-board
      // approval. Changed scenes receive new explicit revision IDs and prices.
      events.push({stage:`reuse-completed-${op.id}`,scene:op.scene,fingerprint:reusable.fingerprint,reused:true,requestId:reusable.requestId});
      return {...reusable,operation:{...op,fingerprint:reusable.fingerprint},output:reusable.output,requestId:reusable.requestId};
    }
    if ((op.kind === "image" || op.kind === "video") && receipts.some(r => r.binding?.operation === op.id && r.fingerprint !== operation.fingerprint)) {
      if (op.kind === "image") throw new Error("This scene already has a saved image request from an earlier plan. Reuse its saved image or request an explicit image revision before continuing. No additional image was submitted.");
      throw new Error("This scene already has a saved animation request under a different review. Reuse that result in a new version; no duplicate animation was submitted.");
    }
    if(services.reuseOnly)throw new Error("This local correction cannot submit new media. The saved inputs need reconciliation before continuing.");
    const phasePlan: FlowPlan = { ...plan, operations: [operation], fingerprint: sha256(JSON.stringify({ version: 1, operation })) };
    await assertOwned(); const reservation = await services.authorize(phasePlan);
    if (!reservation) throw new Pause({ status: "awaiting-budget", phase: op.id, plan: phasePlan });
    if (reservation.approval.mode !== services.mode) throw new Error("Budget mode differs from production mode.");
    await reservation.budget.reserve({ jobId, plan: phasePlan.fingerprint, operations: [operation], quote: reservation.quote, approval: reservation.approval });
    const queue = services.queue(operation, payload);
    if (queue.mode !== services.mode) throw new Error("Queue mode differs from production mode.");
    const binding = RequestBinding.parse({ jobId, operation: operation.id, model: operation.model, transport: operation.transport, payloadSha256: sha256(JSON.stringify(payload)), payloadIdentity });
    if (!receipts.some(r=>r.fingerprint===operation.fingerprint&&r.state==="complete"))
      await saveCheckpoint(path.join(directory,"state.json"),{status:"pending",phase:op.id,events,paidGenerationAuthorized:services.mode==="live"},assertOwned);
    const result = await advanceRequest({ directory: journal, fingerprint: operation.fingerprint, binding, assertOwned,
      queue: budgetedQueue(queue, reservation.budget, reservation.approval.id, operation.fingerprint) });
    events.push({ stage: op.id, scene: op.scene, fingerprint: operation.fingerprint, requestId: result.requestId, reused: result.reused });
    if (result.state !== "complete" || !result.requestId || !result.output) throw new Pause({ status: "pending", phase: op.id });
    await assertOwned(); const cost = await services.cost(operation, result.requestId);
    if (!cost) {
      if (!services.allowPendingCost) throw new Pause({ status: "awaiting-cost", phase: op.id });
      events.push({stage:`cost-receipt-pending-${op.id}`,fingerprint:operation.fingerprint,requestId:result.requestId});
    } else {
      const settlement = await reservation.budget.settle(reservation.approval.id, operation.fingerprint, cost);
      if (settlement.overrun) throw new Error("Provider cost exceeded the approved amount. Production stopped.");
    }
    return { ...result, operation, output: result.output, requestId: result.requestId };
  };
  const receive = async (result: Awaited<ReturnType<typeof execute>>) => {
    const op = result.operation;
    if (op.kind === "alignment") throw new Error("Transcript is not a media file.");
    const asset = await downloadResult({ ...transfer, jobId, fingerprint: op.fingerprint, kind: op.kind === "voice" ? "audio" : op.kind === "video" ? "video" : "image",
      provider: op.transport === "higgsfield-mcp" ? "higgsfield" : "fal", url: result.output,
      ...(op.kind === "image" ? { expectedAspectRatio: op.input.aspect_ratio as ProductionParams["aspectRatio"] } : {}) });
    events.push({ stage: `receive-${op.id}`, scene: op.scene, fingerprint: op.fingerprint, reused: asset.reused }); return asset;
  };
  let outcome: FlowOutcome;
  try {
    const board = planConcept(input.script, input.recipe, input.params.aspectRatio, input.params.sceneDirections, input.params.sceneNarrations);
    const pristineShots = new Map(board.shots.map(shot => [shot.index, structuredClone(shot)]));
    applyImageRevisions(board, services.imageRevisions ?? {});
    // Local composition edits must not change the identity of saved image requests.
    // The storyboard review binds those edits separately before any animation.
    const imageDirections = new Map(board.shots.map(shot => [shot.index, structuredClone(shot)]));
    applyStoryboardEdits(board, [], services.storyboardEdits ?? {});
    const phrases = board.shots.map((s) => s.narration);
    let plan = generationPlan(input.script, input.params, board, placeholderTiming(phrases), input.references, undefined, services.videoModels);
    if (plan.operations.some((op) => op.gates.includes("correct-physical-direction"))) throw new Error(plan.blockers.filter((b) => b.startsWith("Scene ")).join(" "));
    if(plan.operations.some(op=>op.gates.includes("approved-character-sheet")))throw new Error(plan.blockers.filter(b=>b.includes("character sheet")).join(" "));
    const scriptDecision = await review("script", null, { script: input.script, voice: CAM_VOICE, format: input.params.aspectRatio });
    const media: Record<string, SceneMedia> = {}, referenceUrls: Record<string, string> = {};
    const panels: StoryboardPanel[] = [];
    const prepared: { shot: ConceptBoard["shots"][number]; parent: FlowDecision; urls: Record<string,string>; imported?: SceneMedia }[] = [];
    const storyboardFailures:Record<string,string>={},storyboardPending:number[]=[];
    const prepareImages = async () => {
      // Generate and inspect ALL keyframes before the first animation can run.
      for (const shot of board.shots) {
       let reworks=0;
       while(true){
       try {
        const imageShot = imageDirections.get(shot.index)!;
        const context = { jobId, shot: imageShot, params: input.params, references: input.references };
        const workflow = sceneWorkflow(context);
        const direction = await review("direction", shot.index, { shot: imageShot, references: input.references.map(({ id, sha256 }) => ({ id, sha256 })), format: input.params.aspectRatio });
        let imported = input.params.sceneMedia?.[shot.index];
        if (imported) {
          const target = importedVisualTarget(jobId, shot, input.params, input.references)!;
          if (visualReview(target, input.params.sceneReviews?.[shot.index]).status !== "approved") throw new Error("Imported preview scene is not approved.");
          const binding = input.params.sceneMediaWorkflow?.[shot.index], clip = workflow.stages.find((s) => s.stage === "clip")!;
          if (binding && (clip.status !== "approved" || clip.target !== binding)) throw new Error("Imported animation workflow changed.");
          const verified = await verifiedSceneMedia(jobId, imported);
          if (imported.kind === "image" && (!imported.quality || imported.quality.expectedAspectRatio !== input.params.aspectRatio)) {
            imported = { ...imported, quality: await inspectImageQuality(verified.bytes, input.params.aspectRatio) };
          }
          prepared.push({shot,parent:direction,urls:{},imported});
          panels.push({scene:shot.index,narration:shot.narration,meaning:shot.metaphor??"Explain how this image supports the narration before approving.",startScene:shot.scene,endScene:shot.endScene,motion:shot.motion,actionSeconds:shot.actionSeconds??shot.clipSeconds,visualMode:shot.visualMode,overlay:shot.overlay,strike:shot.strike,graphicLayers:shot.graphicLayers,treatment:shot.treatment,existing:imported});
          continue;
        }
        let parent = direction;
        const urls: Record<string, string> = {};
        const frames: { start?: SceneMedia; end?: SceneMedia } = {};
        const characterSheets: NonNullable<StoryboardPanel["characterSheets"]> = [];
        for(const person of [...referenceSheetPreparations(input.params,input.references,shot.references),...(shot.preparedCast?.characters??[])]){
          for(const key of shot.references)if(!referenceUrls[`reference:${key}`]){
            const ref=input.references.find(r=>r.id===key);if(!ref)throw new Error("Missing character style reference.");
            referenceUrls[`reference:${key}`]=await upload(ref.filePath,ref.sha256,"image/png");
          }
          const operation=plan.operations.find(op=>op.id===person.id);if(!operation)throw new Error("Character preparation is absent from the plan.");
          const result=await execute(plan,operation,{...referenceUrls,...urls},{character:person.id});
          const received=await receive(result);if(!received.media)throw new Error("Character preparation did not return an image.");
          const asset=received.media;
          characterSheets.push({id:person.id,role:person.role,media:asset});
          urls[`output:${person.id}`]=await upload(path.join(process.cwd(),"storage/imports",jobId,mediaFile(asset)),asset.sha256,"image/png");
        }

        for (const stage of ["start", "end"] as const) {
          const op = plan.operations.find((item) => item.id === `scene-${shot.index}-${stage}`);
          if (!op) continue;
          const existing = workflow.stages.find((s) => s.stage === stage)!;
          let asset: SceneMedia;
          if (existing.status === "approved" && existing.media) {
            const verified = await verifiedSceneMedia(jobId, existing.media);
            asset = verified.media;
            if (asset.kind === "image" && (!asset.quality || asset.quality.expectedAspectRatio !== input.params.aspectRatio)) {
              asset = { ...asset, quality: await inspectImageQuality(verified.bytes, input.params.aspectRatio) };
            }
            events.push({ stage: `reuse-${op.id}`, fingerprint: asset.sha256, reused: true });
          } else {
            for (const key of shot.references) if (!referenceUrls[`reference:${key}`]) {
              const ref = input.references.find((r) => r.id === key); if (!ref) throw new Error("Missing locked reference.");
              referenceUrls[`reference:${key}`] = await upload(ref.filePath, ref.sha256, "image/png");
            }
            const result = await execute(plan, op, { ...referenceUrls, ...urls }, { parent });
            const received = await receive(result); if (!received.media) throw new Error("No normalized visual."); asset = received.media;
          }
          parent = await review(stage, shot.index, { operation: op.fingerprint, media: asset, parent }, { media: asset });
          frames[stage] = asset;
          urls[`output:${op.id}`] = await upload(path.join(process.cwd(), "storage/imports", jobId, mediaFile(asset)), asset.sha256, "image/png");
        }
        prepared.push({shot,parent,urls,...(input.params.productionMethod==="whimsical-v1"&&shot.visualMode==="presenter-text"?{imported:frames.start}: {})});
        panels.push({scene:shot.index,narration:shot.narration,meaning:shot.metaphor??"Explain how this image supports the narration before approving.",startScene:shot.scene,endScene:shot.endScene,motion:shot.motion,actionSeconds:shot.actionSeconds??shot.clipSeconds,visualMode:shot.visualMode,overlay:shot.overlay,strike:shot.strike,graphicLayers:shot.graphicLayers,treatment:shot.treatment,...(characterSheets.length?{characterSheets}:{}),...frames});
        break;
       } catch(error){
        const previous=previousSheet?.panels.find(p=>p.scene===shot.index);
        if(!previous||!services.imageRevisions?.[shot.index])throw error;
        await assertOwned(); // Losing the job lock always aborts the whole worker.
        // A definitive provider refusal of a revised image is reworked by the director inside the same approved batch (Shimi, 2026-10-22): the client never sees it.
        if(error instanceof DefinitiveRequestFailure&&services.reworkRefusedImage&&reworks<2){
         const refused=(await requestReceipts(path.join(directory,"requests"))).find(r=>r.fingerprint===error.fingerprint);
         const base=`scene-${shot.index}-start`,attempt=services.imageRetries?.[base]??0,current=services.imageRevisions[shot.index];
         const reworked=await services.reworkRefusedImage({scene:shot.index,narration:shot.narration,revision:current,reason:refused?.failureReason??"refused by the provider",attempt});
         if(reworked){
          reworks++;
          services.imageRevisions={...services.imageRevisions,[shot.index]:reworked.revision};
          services.imageRetries={...(services.imageRetries??{}),[base]:reworked.attempt,[`scene-${shot.index}-end`]:reworked.attempt};
          const fresh=structuredClone(pristineShots.get(shot.index)!);applyImageRevisions({shots:[fresh]} as ConceptBoard,{[shot.index]:reworked.revision});
          for(const key of ["scene","imagePrompt","endScene","endImagePrompt","metaphor","visualMode","treatment","graphicLayers","overlay","preparedCast","motion","motionPrompt"] as const)(shot as unknown as Record<string,unknown>)[key]=(fresh as unknown as Record<string,unknown>)[key];
          imageDirections.set(shot.index,structuredClone(shot));
          events.push({stage:`rework-${base}`,scene:shot.index,fingerprint:error.fingerprint});
          continue;
         }
        }
        if(error instanceof Pause&&error.result.status==="pending")storyboardPending.push(shot.index);
        else if(error instanceof Pause)throw error;
        // A transient provider read (network, provider busy) is not a failure of the revision: the scene stays pending and the background worker reads it again (live Clay 2026-10-23, "The saved result could not be read yet." shown as a failed scene).
        else if(error instanceof RetryableReadError)storyboardPending.push(shot.index);
        else storyboardFailures[shot.index]=error instanceof Error?error.message:"Image update failed.";
        panels.push(previous); // Preserve the last complete pair, never mix old/new endpoints.
        break;
       }
       }
      }
    };
    let storyboardDecision: FlowDecision | undefined;
    if (services.storyboardBeforeVoice) {
      if (plan.operations.some(op => op.gates.includes("split-scene"))) throw new Pause({ status: "blocked-duration", phase: "split-scenes", plan });
      await prepareImages();
      applyStoryboardEdits(board, panels, services.storyboardEdits ?? {});
      if(Object.keys(storyboardFailures).length||storyboardPending.length){
       const target=flowReviewTarget(services.mode,jobId,"storyboard",storyboardReviewContent(panels,input.params.aspectRatio));
       await saveCheckpoint(path.join(directory,"storyboard-review.json"),{version:1,target,panels,retrospective:false},assertOwned);
       throw new Pause({status:storyboardPending.length?"pending":"awaiting-review",phase:"storyboard",storyboardFailures,storyboardPending,review:{stage:"storyboard",scene:null,target,storyboard:panels}});
      }
      // The image approval survives later voice alignment and model selection.
      // It still binds every image, direction, narration line and locked identity.
      storyboardDecision = await review("storyboard", null, storyboardReviewContent(panels, input.params.aspectRatio), { storyboard: panels, timing: placeholderTiming(phrases) });
    }
    const importedVoice = await selectedNarration(jobId, phrases, input.params);
    const recording = importedVoice ? null : await receive(await execute(plan, plan.operations[0], {}, { script: scriptDecision }));
    const audio = importedVoice?.audio ?? recording?.audio;
    if (!audio) throw new Error("No normalized voice recording.");
    const voiceFile = importedVoice?.file ?? path.join(recording!.directory, "narration.wav");
    let alignment = importedVoice?.alignment;
    if (importedVoice) events.push({ stage: "reuse-reviewed-recording", fingerprint: importedVoice.target, reused: true });
    else {
      const voiceUrl = await upload(voiceFile, audio.sha256, "audio/wav");
      const transcript = await execute(plan, plan.operations[1], { "output:voice": voiceUrl }, { audio: audio.sha256 });
      alignment = whisperAlignment(JSON.parse(transcript.output), { audioSha256: audio.sha256, scriptSha256: scriptHash(phrases), voiceId: CAM_VOICE.voiceId,
        requestId: transcript.requestId, source: services.mode === "simulation" ? "simulation-fixture" : "fal-whisper" });
    }
    if (!alignment) throw new Error("Missing voice alignment.");
    let timing: ConceptTiming;
    try { timing = alignVoice(phrases, audio, alignment, services.mode); }
    catch (error) {
      if (!(error instanceof TranscriptMismatchError) || importedVoice || services.mode !== "live" || !services.recoverAlignment) throw error;
      alignment = await services.recoverAlignment({ phrases, audio, original: alignment, file: voiceFile, directory, assertOwned });
      timing = alignVoice(phrases, audio, alignment, services.mode);
      events.push({ stage: "local-voice-alignment", fingerprint: alignmentHash(alignment) });
    }
    const voiceDecision = await review("voice", null, { script: scriptDecision, audio: audio.sha256, alignment: alignmentHash(alignment), voice: CAM_VOICE, ...(importedVoice ? { importedReview: importedVoice.target, decision: importedVoice.narration.reviews.at(-1)!.id } : {}) },
      { audio: { file: voiceFile, sha256: audio.sha256, duration: audio.duration }, timing });
    if (sha256(await readFile(voiceFile)) !== audio.sha256) throw new Error("Reviewed recording changed before scene generation.");
    plan = alignedGenerationPlan({ script: input.script, params: input.params, board, references: input.references, audio, alignment, videoModels: services.videoModels, mode: services.mode,
      approval: { approved: true, mode: services.mode, voiceId: CAM_VOICE.voiceId, scriptSha256: alignment.scriptSha256, audioSha256: audio.sha256, alignmentSha256: alignmentHash(alignment) } }).plan;
    if (importedVoice) plan = generationPlan(input.script, input.params, board, timing, input.references, importedVoice.evidence, services.videoModels);
    if (plan.operations.some((op) => op.gates.includes("split-scene"))) throw new Pause({ status: "blocked-duration", phase: "split-scenes", plan });
    if (!services.storyboardBeforeVoice) {
      await prepareImages();
      applyStoryboardEdits(board, panels, services.storyboardEdits ?? {});
      storyboardDecision = await review("storyboard", null, storyboardReviewContent(panels, input.params.aspectRatio), {storyboard:panels,audio:{file:voiceFile,sha256:audio.sha256,duration:audio.duration}});
    }
    if (!storyboardDecision) throw new Error("The complete storyboard needs approval before animation.");
    // Local feedback may switch a previously animated scene to typography.
    // Reuse its saved still for bookkeeping; textOnly masks its pixels in montage.
    for(const entry of prepared){
      if(input.params.productionMethod==="whimsical-v1" && entry.shot.visualMode==="presenter-text" && !entry.imported){
        entry.imported=panels.find(p=>p.scene===entry.shot.index)?.start;
        if(!entry.imported)throw new Error("The text scene needs its saved storyboard media.");
      }
    }
    const drafts = new Map<number, { op: GenerationOperation; result: Awaited<ReturnType<typeof execute>>; media: SceneMedia; kling: boolean }>();
    let filmDecision: FlowDecision | undefined;
    if ((services.videoWorkflow === "draft-first"||services.videoWorkflow === "whimsical")) {
      const draftMedia: Record<string, SceneMedia> = {};
      const sceneFailures:number[]=[];
      for (const {shot,parent,urls,imported} of prepared) {
        if (imported) { draftMedia[shot.index] = imported; continue; }
        try {
        const op=plan.operations.find(item=>item.id===`scene-${shot.index}-clip`)!;
          const kling = op.model === KLING_PRO;
          if(op.model!==HF_SEEDANCE && !kling)throw new Error("This model has no priced draft completion route. Request a new quote.");
          const draftOp: GenerationOperation = services.videoWorkflow==="whimsical"&&kling?op:{...op,id:draftOperationId(op.id),
            model:kling ? KLING_STANDARD : op.model,
            input:kling ? {...op.input} : {...op.input,draft:true},
            fingerprint:sha256(JSON.stringify({source:op.fingerprint,stage:kling ? "draft-720p" : "draft-480p"}))};
          const draftResult=await execute(plan,draftOp,{...referenceUrls,...urls},{parent,voice:voiceDecision,storyboard:storyboardDecision});
          const received=await receive(draftResult);
          if(!received.media || (!kling && (!draftResult.draftId || !draftResult.submittedAt)))throw new Error("Draft continuation evidence missing. No final generation submitted.");
          if(!received.media.duration||received.media.duration+1/30<Number(op.input.duration))throw new Error("Draft is shorter than the approved action.");
        drafts.set(shot.index, {op:draftOp,result:draftResult,media:received.media,kling});
        draftMedia[shot.index]=received.media;
        } catch(error){
          // Only a saved definitive rejection is independent. Unknown submission,
          // broken input, budget or transport errors must keep their own policy.
          if(!(error instanceof DefinitiveRequestFailure))throw error;
          sceneFailures.push(shot.index);
          events.push({stage:"draft-failed",scene:shot.index,fingerprint:error.fingerprint});
        }
      }
      if(sceneFailures.length)throw new Pause({status:"blocked-scenes",phase:"draft-failures",sceneFailures});
      // One film-wide gate binds all clips, the approved board, the recording and
      // the exact edited file. No finishing request is submitted before it.
      const content = { mode: services.mode, jobId, board, timing, aspectRatio: input.params.aspectRatio,
        voiceOrigin: importedVoice ? "reviewed-import" as const : "generated-bram" as const,
        voiceFile, audioSha256: audio.sha256, alignmentSha256: alignmentHash(alignment), media: draftMedia, reviews: [...decisions] };
      const packet = {...content, fingerprint:sha256(JSON.stringify(content))};
      await saveCheckpoint(path.join(directory,"state.json"), {status:"pending",phase:"render-draft-film",events,paidGenerationAuthorized:services.mode==="live"}, assertOwned);
      const previewCheckpoint=path.join(directory,"draft-film.json");
      const cached=await readCheckpoint(previewCheckpoint,z.object({packet:Hash,film:z.object({file:z.string(),sha256:Hash,duration:z.number().positive()})}));
      let film=cached?.packet===packet.fingerprint&&await readFile(cached.film.file).then(bytes=>sha256(bytes)===cached.film.sha256).catch(()=>false)?cached.film:null;
      if(!film){
        const preview = await renderProductionFlow(packet, path.join(directory,"draft-montage"), path.join(directory,"draft-checkpoints"), assertOwned);
        const file=path.join(directory,"draft-montage","draft.mp4");
        await downscalePreview(preview.output,file);await assertOwned();
        film={file,sha256:sha256(await readFile(file)),duration:preview.duration};
        await saveCheckpoint(previewCheckpoint,{packet:packet.fingerprint,film},assertOwned);
      }
      filmDecision = await review("draft-film",null,{packet:packet.fingerprint,film:film.sha256},{film});
    }
    for (const {shot,parent,urls,imported} of prepared) {
      if (imported) {
        if (!filmDecision) await review("clip", shot.index, { media: imported, direction:parent, voice:voiceDecision, timing:alignmentHash(alignment), storyboard:storyboardDecision }, {media:imported});
        media[shot.index]=imported; events.push({stage:`reuse-scene-${shot.index}`,fingerprint:imported.sha256,reused:true}); continue;
      }
      const op=plan.operations.find(item=>item.id===`scene-${shot.index}-clip`)!;
      const existing=sceneWorkflow({jobId,shot,params:input.params,references:input.references}).stages.find(s=>s.stage==="clip")!;
      let asset:SceneMedia;
      if(existing.status==="approved"&&existing.media){asset=(await verifiedSceneMedia(jobId,existing.media)).media;events.push({stage:`reuse-${op.id}`,fingerprint:asset.sha256,reused:true});}
      else {
        let finalOperation=op;
        let draftEvidence:unknown;
        if((services.videoWorkflow==="draft-first"||services.videoWorkflow==="whimsical")) {
          const draft=drafts.get(shot.index);
          if(!draft||!filmDecision)throw new Error("Approve the complete preview before finishing.");
          const {kling,result:draftResult,media:draftMedia,op:draftOp}=draft;
          // Existing submitted finals retain their original request identity. An
          // old single-scene approval alone never opens the new film-wide gate.
          let approved=filmDecision;
          if(receipts.some(r=>r.binding?.operation===op.id)){
            const target=flowReviewTarget(services.mode,jobId,"draft",{operation:draftOp.fingerprint,media:draftMedia,...(!kling?{draftId:draftResult.draftId}:{}),parent,voice:voiceDecision,storyboard:storyboardDecision});
            const legacy=await services.review({stage:"draft",scene:shot.index,target,media:draftMedia});
            if(legacy?.decision==="approved"&&legacy.target===target&&legacy.mode===services.mode)approved=legacy;
          }
          if(kling&&services.videoWorkflow==="whimsical"){
            media[shot.index]=draftMedia;events.push({stage:`reuse-${op.id}`,fingerprint:draftMedia.sha256,reused:true});continue;
          }
          if(kling) {
            draftEvidence={approved,route:"reviewed-draft-then-native-generation",media:draftMedia.sha256};
          } else {
            if(Date.now()-draftResult.submittedAt!>=7*24*3600_000&&!receipts.some(r=>r.binding?.operation===op.id))throw new Error("This draft has expired after seven days. Prepare a new version and budget; no automatic regeneration.");
            finalOperation={...op,input:{model:HF_SEEDANCE,draft_job_id:draftResult.draftId,resolution:"1080p",count:1},bindings:{}};
            draftEvidence={approved,draftId:draftResult.draftId,media:draftMedia.sha256};
          }
        }
        const received=await receive(await execute(plan,finalOperation,{...referenceUrls,...urls},{parent,voice:voiceDecision,storyboard:storyboardDecision,...(draftEvidence?{draft:draftEvidence}:{})}));
        if(!received.media)throw new Error("No normalized animation.");asset=received.media;
      }
      if(!asset.duration||asset.duration+1/30<Number(op.input.duration))throw new Error("Animation is shorter than the requested synchronized duration.");
      if (!filmDecision) await review("clip",shot.index,{operation:op.fingerprint,media:asset,parent,voice:voiceDecision,storyboard:storyboardDecision},{media:asset});
      media[shot.index]=asset;
    }
    const packet = { mode: services.mode, jobId, board, timing, aspectRatio: input.params.aspectRatio, voiceOrigin: importedVoice ? "reviewed-import" as const : "generated-bram" as const, voiceFile, audioSha256: audio.sha256,
      alignmentSha256: alignmentHash(alignment), media, reviews: decisions };
    outcome = { status: "ready-to-render", phase: "montage", events, paidGenerationAuthorized: services.mode === "live", plan,
      render: { ...packet, fingerprint: sha256(JSON.stringify(packet)) } };
  } catch (error) {
    if (!(error instanceof Pause)) throw error;
    outcome = { ...error.result, events, paidGenerationAuthorized: services.mode === "live" };
  }
  await saveCheckpoint(path.join(directory, "state.json"), outcome, assertOwned);
  return outcome;
}

/** The immutable recording remains intact; local pacing and mixing are derived
 * assets with their own timing and evidence, never a new voice generation. */
export async function renderProductionFlow(packet: RenderPacket, workspace: string, checkpoints: string, assertOwned: () => Promise<void>, finishing?: Finishing) {
  // Free finishing needs no live provider access; the packet and reviews below
  // still have to match the exact completed production.
  if (!["live", "simulation"].includes(packet.mode)) throw new Error("Invalid rendering mode.");
  await assertOwned();
  const { fingerprint, ...content } = packet;
  if (sha256(JSON.stringify(content)) !== fingerprint) throw new Error("Render packet changed.");
  const board = finishingBoard(packet.board, finishing);
  const voiceBytes = await readFile(packet.voiceFile);
  if (sha256(voiceBytes) !== packet.audioSha256) throw new Error("Reviewed voice changed before montage.");
  if (packet.board.shots.some((s) => !packet.media[s.index])) throw new Error("A scene has no approved media.");
  for (const decision of packet.reviews) if (Decision.parse(decision).mode !== packet.mode || decision.decision !== "approved") throw new Error("Invalid production review.");
  await mkdir(path.join(workspace, "assets"), { recursive: true });
  await writeFile(path.join(workspace, "assets/narration.wav"), voiceBytes);
  const audio = await prepareEditorialAudio(workspace, board, packet.timing, { musicLevel:finishing?.musicLevel, breaths: finishing?.breaths, minimumSceneSeconds: finishing?.minimumSceneSeconds });
  const timing = audio.timing;
  const durations = timing.phrases.map((p, i) => (timing.phrases[i + 1]?.start ?? audio.duration) - (i === 0 ? 0 : p.start));
  const visibleDurations = timing.phrases.map((p, i) => (timing.phrases[i + 1]?.start ?? audio.logoStart) - (i === 0 ? 0 : p.start));
  const staged = await stageSceneMedia(packet.jobId, packet.media, workspace, durations, finishing?.clips, board.shots.filter(s => s.endScene).map(s => s.index), visibleDurations);
  const composition = await writeMontage(workspace, board, timing, packet.aspectRatio, staged, { audio, endingVariant: finishing?.ending, captions:finishing?.captions,captionSize:finishing?.captionSize,captionCorrections:finishing?.captionCorrections });
  await writeFile(path.join(workspace,"editorial-timeline.json"),JSON.stringify(editorialTimeline(board,timing,{start:audio.logoStart,end:audio.duration}),null,2));
  await writeFile(path.join(workspace,"storyboard.json"),JSON.stringify(board));
  await writeFile(path.join(workspace,"timing.json"),JSON.stringify(timing));
  validateTiming(timing, composition.captions);
  for (const kind of ["srt", "vtt"] as const) await writeFile(path.join(workspace, `captions.${kind}`), subtitleFile(composition.captions, kind));
  const output = path.join(workspace, "preview.mp4");
  const rendering = await checkpointedRender({ project: workspace, output, checkpointDir: path.join(checkpoints, "render"), assertOwned,
    render: (file) => renderConcept(workspace, file) });
  const audioReport = await checkEditorialAudio(output, workspace, timing, [...timing.phrases.slice(1).map((p) => p.start), audio.logoStart]);
  await controls(output, workspace, [...composition.cues.map((s) => s.start), audio.logoStart], composition.width, composition.height, composition.duration, { requireAudibleVoice: true, estimatedTiming: timing.estimated, captions: composition.captions, denseFrames: true });
  await assertOwned();
  const proof = { mode: packet.mode, fingerprint, voiceSha256: packet.audioSha256, alignmentSha256: packet.alignmentSha256,
    duration: composition.duration, narrationDuration: timing.duration, brandEnding: composition.brandEnding, audioReport, editorialApproval: "pending-listening-and-picture-review", timingEstimated: timing.estimated, finalBramVoiceApproved: packet.mode === "live" && packet.voiceOrigin === "generated-bram", paidGenerationAuthorized: packet.mode === "live", media: packet.media, renderReused: rendering.reused,
    ...(finishing ? { finishing: { ...finishing, sourceFingerprint: fingerprint, boardSha256: sha256(JSON.stringify(board)), completedAt: new Date().toISOString(), newPaidRequests: 0 } } : {}) };
  await writeFile(path.join(workspace, "production-flow.json"), JSON.stringify(proof, null, 2));
  return { output, ...proof };
}
