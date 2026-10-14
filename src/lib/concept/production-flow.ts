import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import type { ProductionParams } from "../brain";
import type { Recipe } from "../recipes";
import { assertTransportMode, type QueueRequest, type TransportMode } from "./provider-transports";
import { generationPlan, materializeRequest, type GenerationOperation } from "./generation-plan";
import { planConcept } from "./storyboard";
import { placeholderTiming } from "./timing";
import { Hash, saveCheckpoint, sha256 } from "./checkpoints";
import { advanceRequest, RequestBinding, requestReceipts } from "./request-journal";
import { budgetedQueue, type BudgetApproval, type BudgetQuote, type createBudget } from "./budget";
import { downloadResult, uploadReference, type AssetTransport } from "./media-transfers";
import { alignVoice, alignmentHash, scriptHash, whisperAlignment } from "./voice-alignment";
import { alignedGenerationPlan } from "./aligned-plan";
import { CAM_VOICE } from "./cam-voice";
import { sceneWorkflow } from "./scene-workflow";
import { importedVisualTarget, visualReview } from "./visual-review";
import { mediaFile, type SceneMedia } from "./preview-inputs";
import { stageSceneMedia, verifiedSceneMedia } from "./imported-media";
import type { ConceptBoard, ConceptTiming } from "./types";
import { writeMontage } from "./montage";
import { checkpointedRender } from "./render-checkpoint";
import { renderConcept } from "./render";
import { controls, validateTiming } from "./controls";
import { subtitleFile } from "./existing-run";
import { selectedNarration } from "./narration";

export type FlowPlan = ReturnType<typeof generationPlan>;
export type FlowReview = { stage: "script" | "voice" | "direction" | "start" | "end" | "clip"; scene: number | null; target: string;
  media?: SceneMedia; audio?: { file: string; sha256: string; duration: number }; timing?: ConceptTiming };
const Decision = z.object({ id: z.uuid(), target: Hash, decision: z.enum(["approved", "rejected"]), mode: z.enum(["simulation", "live"]) }).strict();
export type FlowDecision = z.infer<typeof Decision>;
type Reservation = { budget: ReturnType<typeof createBudget>; quote: BudgetQuote; approval: BudgetApproval };
export type FlowServices = {
  mode: TransportMode; assets: AssetTransport;
  allowPendingCost?: boolean; // Keep the approved reservation while a receipt is unavailable.
  queue: (operation: GenerationOperation, payload: Record<string, unknown>) => QueueRequest;
  authorize: (plan: FlowPlan) => Promise<Reservation | null>;
  cost: (operation: GenerationOperation, requestId: string) => Promise<{ unit: "usd" | "higgsfield-credit"; actual: number; evidence: string } | null>;
  review: (request: FlowReview) => Promise<FlowDecision | null>;
};
type Reference = { id: string; url: string; sha256: string; filePath: string };
export type FlowInput = { jobId: string; script: string; params: ProductionParams; recipe: Recipe; references: Reference[];
  directory: string; assertOwned: () => Promise<void>; services: FlowServices };
export type FlowEvent = { stage: string; scene?: number | null; fingerprint: string; reused?: boolean; requestId?: string };
export type RenderPacket = { mode: TransportMode; jobId: string; board: ConceptBoard; timing: ConceptTiming; aspectRatio: ProductionParams["aspectRatio"];
  voiceOrigin?: "generated-bram" | "reviewed-import"; voiceFile: string; audioSha256: string; alignmentSha256: string; media: Record<string, SceneMedia>; reviews: FlowDecision[]; fingerprint: string };
export type FlowOutcome = { status: "awaiting-review" | "rejected" | "awaiting-budget" | "awaiting-cost" | "pending" | "blocked-duration" | "ready-to-render";
  phase: string; events: FlowEvent[]; review?: FlowReview; plan?: FlowPlan; render?: RenderPacket; paidGenerationAuthorized: boolean };
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
  if (receipts.some((r) => r.state === "submitting" || r.state === "failed")) throw new Error("An earlier production request needs reconciliation. No new request was sent.");
  const events: FlowEvent[] = [], decisions: FlowDecision[] = [];
  const review = async (stage: FlowReview["stage"], scene: number | null, data: unknown, details: Partial<FlowReview> = {}) => {
    const request: FlowReview = { ...details, stage, scene, target: flowReviewTarget(services.mode, jobId, stage, data) };
    await assertOwned(); const value = await services.review(request);
    if (!value) throw new Pause({ status: "awaiting-review", phase: stage, review: request });
    const decision = Decision.parse(value);
    if (decision.target !== request.target || decision.mode !== services.mode) throw new Pause({ status: "awaiting-review", phase: stage, review: request });
    if (decision.decision !== "approved") throw new Pause({ status: "rejected", phase: stage, review: request });
    decisions.push(decision); events.push({ stage: `review-${stage}`, scene, fingerprint: request.target });
    return decision;
  };
  const transfer = { directory: path.join(directory, "transfers"), transport: services.assets, assertOwned };
  const upload = async (file: string, hash: string, kind: "image/png" | "audio/wav") => {
    const result = await uploadReference({ ...transfer, file, sha256: hash, contentType: kind });
    events.push({ stage: "transfer", fingerprint: hash, reused: result.reused }); return result.url;
  };
  const execute = async (plan: FlowPlan, op: GenerationOperation, urls: Record<string, string>, evidence: unknown) => {
    const payload = materializeRequest(op, urls);
    // A semantic plan fingerprint alone cannot distinguish replaced normalized
    // files, renewed reviews or changed hosted URLs in the submitted payload.
    const operation = { ...op, fingerprint: sha256(JSON.stringify({ mode: services.mode, operation: op.fingerprint, payload, evidence })) };
    const phasePlan: FlowPlan = { ...plan, operations: [operation], fingerprint: sha256(JSON.stringify({ version: 1, operation })) };
    await assertOwned(); const reservation = await services.authorize(phasePlan);
    if (!reservation) throw new Pause({ status: "awaiting-budget", phase: op.id, plan: phasePlan });
    if (reservation.approval.mode !== services.mode) throw new Error("Budget mode differs from production mode.");
    await reservation.budget.reserve({ jobId, plan: phasePlan.fingerprint, operations: [operation], quote: reservation.quote, approval: reservation.approval });
    const queue = services.queue(operation, payload);
    if (queue.mode !== services.mode) throw new Error("Queue mode differs from production mode.");
    const binding = RequestBinding.parse({ jobId, operation: operation.id, model: operation.model, transport: operation.transport, payloadSha256: sha256(JSON.stringify(payload)) });
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
      provider: op.kind === "voice" ? "higgsfield" : "fal", url: result.output });
    events.push({ stage: `receive-${op.id}`, scene: op.scene, fingerprint: op.fingerprint, reused: asset.reused }); return asset;
  };
  let outcome: FlowOutcome;
  try {
    const board = planConcept(input.script, input.recipe, input.params.aspectRatio, input.params.sceneDirections);
    const phrases = board.shots.map((s) => s.narration);
    let plan = generationPlan(input.script, input.params, board, placeholderTiming(phrases), input.references);
    const scriptDecision = await review("script", null, { script: input.script, voice: CAM_VOICE, format: input.params.aspectRatio });
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
    const timing = alignVoice(phrases, audio, alignment, services.mode);
    const voiceDecision = await review("voice", null, { script: scriptDecision, audio: audio.sha256, alignment: alignmentHash(alignment), voice: CAM_VOICE, ...(importedVoice ? { importedReview: importedVoice.target, decision: importedVoice.narration.reviews.at(-1)!.id } : {}) },
      { audio: { file: voiceFile, sha256: audio.sha256, duration: audio.duration }, timing });
    if (sha256(await readFile(voiceFile)) !== audio.sha256) throw new Error("Reviewed recording changed before scene generation.");
    plan = alignedGenerationPlan({ script: input.script, params: input.params, board, references: input.references, audio, alignment, mode: services.mode,
      approval: { approved: true, mode: services.mode, voiceId: CAM_VOICE.voiceId, scriptSha256: alignment.scriptSha256, audioSha256: audio.sha256, alignmentSha256: alignmentHash(alignment) } }).plan;
    if (importedVoice) plan = generationPlan(input.script, input.params, board, timing, input.references, importedVoice.evidence);
    if (plan.operations.some((op) => op.gates.includes("split-scene"))) throw new Pause({ status: "blocked-duration", phase: "split-scenes", plan });
    const media: Record<string, SceneMedia> = {}, referenceUrls: Record<string, string> = {};
    for (const shot of board.shots) {
      const context = { jobId, shot, params: input.params, references: input.references };
      const workflow = sceneWorkflow(context);
      const direction = await review("direction", shot.index, { shot, references: input.references.map(({ id, sha256 }) => ({ id, sha256 })), format: input.params.aspectRatio });
      const imported = input.params.sceneMedia?.[shot.index];
      if (imported) {
        const target = importedVisualTarget(jobId, shot, input.params, input.references)!;
        if (visualReview(target, input.params.sceneReviews?.[shot.index]).status !== "approved") throw new Error("Imported preview scene is not approved.");
        const binding = input.params.sceneMediaWorkflow?.[shot.index], clip = workflow.stages.find((s) => s.stage === "clip")!;
        if (binding && (clip.status !== "approved" || clip.target !== binding)) throw new Error("Imported animation workflow changed.");
        await verifiedSceneMedia(jobId, imported);
        await review("clip", shot.index, { media: imported, direction, voice: voiceDecision, timing: alignmentHash(alignment) }, { media: imported });
        media[shot.index] = imported; events.push({ stage: `reuse-scene-${shot.index}`, fingerprint: imported.sha256, reused: true }); continue;
      }
      let parent = direction;
      const urls: Record<string, string> = {};
      for (const stage of ["start", "end", "clip"] as const) {
        const op = plan.operations.find((item) => item.id === `scene-${shot.index}-${stage}`);
        if (!op) continue;
        const existing = workflow.stages.find((s) => s.stage === stage)!;
        let asset: SceneMedia;
        if (existing.status === "approved" && existing.media) {
          asset = (await verifiedSceneMedia(jobId, existing.media)).media;
          events.push({ stage: `reuse-${op.id}`, fingerprint: asset.sha256, reused: true });
        } else {
          for (const key of shot.references) if (!referenceUrls[`reference:${key}`]) {
            const ref = input.references.find((r) => r.id === key); if (!ref) throw new Error("Missing locked reference.");
            referenceUrls[`reference:${key}`] = await upload(ref.filePath, ref.sha256, "image/png");
          }
          const result = await execute(plan, op, { ...referenceUrls, ...urls }, { parent, ...(stage === "clip" ? { voice: voiceDecision } : {}) });
          const received = await receive(result); if (!received.media) throw new Error("No normalized visual."); asset = received.media;
        }
        if (stage === "clip" && (!asset.duration || asset.duration + 1 / 30 < Number(op.input.duration))) throw new Error("Animation is shorter than the requested synchronized duration.");
        parent = await review(stage, shot.index, { operation: op.fingerprint, media: asset, parent, ...(stage === "clip" ? { voice: voiceDecision } : {}) }, { media: asset });
        if (stage === "clip") media[shot.index] = asset;
        else urls[`output:${op.id}`] = await upload(path.join(process.cwd(), "storage/imports", jobId, mediaFile(asset)), asset.sha256, "image/png");
      }
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

/** Render only a complete, reviewed packet. The voice is copied unchanged;
 * word timings and scene intervals come from that exact recording. */
export async function renderProductionFlow(packet: RenderPacket, workspace: string, checkpoints: string, assertOwned: () => Promise<void>) {
  assertTransportMode(packet.mode); await assertOwned();
  const { fingerprint, ...content } = packet;
  if (sha256(JSON.stringify(content)) !== fingerprint) throw new Error("Render packet changed.");
  const voiceBytes = await readFile(packet.voiceFile);
  if (sha256(voiceBytes) !== packet.audioSha256) throw new Error("Reviewed voice changed before montage.");
  if (packet.board.shots.some((s) => !packet.media[s.index])) throw new Error("A scene has no approved media.");
  for (const decision of packet.reviews) if (Decision.parse(decision).mode !== packet.mode || decision.decision !== "approved") throw new Error("Invalid production review.");
  await mkdir(path.join(workspace, "assets"), { recursive: true });
  await writeFile(path.join(workspace, "assets/narration.wav"), voiceBytes);
  const durations = packet.timing.phrases.map((p, i) => (packet.timing.phrases[i + 1]?.start ?? packet.timing.duration) - (i === 0 ? 0 : p.start));
  const staged = await stageSceneMedia(packet.jobId, packet.media, workspace, durations);
  const composition = await writeMontage(workspace, packet.board, packet.timing, packet.aspectRatio, staged);
  await writeFile(path.join(workspace,"storyboard.json"),JSON.stringify(packet.board));
  await writeFile(path.join(workspace,"timing.json"),JSON.stringify(packet.timing));
  validateTiming(packet.timing, composition.captions);
  for (const kind of ["srt", "vtt"] as const) await writeFile(path.join(workspace, `captions.${kind}`), subtitleFile(composition.captions, kind));
  const output = path.join(workspace, "preview.mp4");
  const rendering = await checkpointedRender({ project: workspace, output, checkpointDir: path.join(checkpoints, "render"), assertOwned,
    render: (file) => renderConcept(workspace, file) });
  await controls(output, workspace, composition.cues.map((s) => s.start), composition.width, composition.height, packet.timing.duration, { requireAudibleVoice: true, captions: composition.captions });
  await assertOwned();
  const proof = { mode: packet.mode, fingerprint, voiceSha256: packet.audioSha256, alignmentSha256: packet.alignmentSha256,
    duration: packet.timing.duration, timingEstimated: packet.timing.estimated, finalBramVoiceApproved: packet.mode === "live" && packet.voiceOrigin === "generated-bram", paidGenerationAuthorized: packet.mode === "live", media: packet.media, renderReused: rendering.reused };
  await writeFile(path.join(workspace, "production-flow.json"), JSON.stringify(proof, null, 2));
  return { output, ...proof };
}
