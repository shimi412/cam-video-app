import type { CharacterReference } from "./character-sheet-policy";
import type { RenderPacket } from "./production-flow";
import type { SceneDirection } from "./types";
import type { Recipe } from "../recipes";
import type { ProductionParams } from "../brain";
import { generationPlan } from "./generation-plan";
import { planConcept } from "./storyboard";
import { sha256 } from "./checkpoints";
import { physicalDirectionIssues } from "./physical-direction";
import type { SceneMedia } from "./preview-inputs";

/** A separate, quoteable repair proposal. It cannot reuse an old budget approval
 * or mutate the original production's provider journal. No provider calls. */
export function sceneRepairPlan(packet: RenderPacket, scene: number, direction: SceneDirection, recipe: Recipe, references: CharacterReference[]) {
  if (sha256(JSON.stringify(Object.fromEntries(Object.entries(packet).filter(([key]) => key !== "fingerprint")))) !== packet.fingerprint) throw new Error("Original production packet changed.");
  if (!packet.board.shots.some((shot) => shot.index === scene)) throw new Error("Unknown scene to repair.");
  const issues = physicalDirectionIssues(direction); if (issues.length) throw new Error(issues.join(" "));
  const directions = Object.fromEntries(packet.board.shots.map(shot => [shot.index, shot.index === scene ? direction : {
    scene: shot.scene, motion: shot.motion, references: shot.references, endScene: shot.endScene, overlay: shot.overlay, strike: shot.strike,
    visualMode: shot.visualMode, metaphor: shot.metaphor, stateChange: shot.stateChange, actionSeconds: shot.actionSeconds, breathBefore: shot.breathBefore,
  }]));
  const script = packet.board.shots.map(s => s.narration).join(" ");
  const board = planConcept(script, recipe, packet.aspectRatio, directions, packet.board.shots.map(s=>s.narration));
  const sceneMedia = Object.fromEntries(Object.entries(packet.media).filter(([key]) => Number(key) !== scene));
  const plan = generationPlan(script, { aspectRatio: packet.aspectRatio, sceneMedia } as ProductionParams, board, packet.timing, references,
    { source: "reviewed", audioSha256: packet.audioSha256, alignmentSha256: packet.alignmentSha256 });
  const operations: typeof plan.operations = [];
  for (const original of plan.operations.filter(op => op.scene === scene)) {
    const { fingerprint: originalFingerprint, ...content } = original;
    const op = { ...content, dependsOn: content.dependsOn.filter(id => id !== "voice-alignment") };
    operations.push({ ...op, fingerprint: sha256(JSON.stringify({ originalFingerprint, op, source: packet.fingerprint,
      parents: op.dependsOn.map(id => operations.find(parent => parent.id === id)?.fingerprint) })) });
  }
  const fingerprint = sha256(JSON.stringify({ source: packet.fingerprint, scene, direction, operations }));
  return { ...plan, operations, fingerprint, sourceProduction: packet.jobId, sourceFingerprint: packet.fingerprint,
    reusedRecording: { audioSha256: packet.audioSha256, alignmentSha256: packet.alignmentSha256 },
    blockers: ["Approve this separate repair quote", "Review the new start and end images before animation", "Review the complete motion before selecting the montage excerpt"],
    repair: { scene, direction }, paidGenerationAuthorized: false as const };
}

export type ReviewedSceneRepair = { plan: ReturnType<typeof sceneRepairPlan>; media: Record<string, SceneMedia>;
  reviews: Record<string, { decision: "approved" | "rejected"; sha256: string; note: string; at: string; reviewer: string }> };

/** Build a new render packet from inspected replacements, preserving the
 * original production, recording, alignment and unchanged shots byte-for-byte. */
export function applyReviewedSceneRepairs(source: RenderPacket, repairs: ReviewedSceneRepair[], recipe: Recipe): RenderPacket {
  const { fingerprint, ...content } = source;
  if (sha256(JSON.stringify(content)) !== fingerprint) throw new Error("Source packet changed.");
  if (!repairs.length || new Set(repairs.map(r=>r.plan.repair.scene)).size !== repairs.length) throw new Error("Choose one reviewed replacement per scene.");
  const board = { ...source.board, shots: [...source.board.shots] };
  const media = { ...source.media }, reviews = [...source.reviews];
  for (const repair of repairs) {
    if (repair.plan.sourceFingerprint !== fingerprint || repair.plan.sourceProduction !== source.jobId || repair.plan.reusedRecording.audioSha256 !== source.audioSha256 || repair.plan.reusedRecording.alignmentSha256 !== source.alignmentSha256) throw new Error("Repair belongs to another production or recording.");
    const scene = repair.plan.repair.scene;
    for (const stage of ["start", "end", "clip"]) {
      const id = `scene-${scene}-${stage}`, asset = repair.media[id], decision = repair.reviews[id];
      if (!asset || !decision || decision.decision !== "approved" || decision.sha256 !== asset.sha256 || asset.kind !== (stage === "clip" ? "video" : "image")) throw new Error("Every endpoint and the complete motion need a matching visual review.");
      const target = sha256(JSON.stringify({source:fingerprint,plan:repair.plan.fingerprint,id,asset,decision}));
      const decisionId = `${target.slice(0,8)}-${target.slice(8,12)}-4${target.slice(13,16)}-8${target.slice(17,20)}-${target.slice(20,32)}`;
      reviews.push({id:decisionId,mode:source.mode,decision:"approved",target});
    }
    const replacement = planConcept(source.board.shots.map(s=>s.narration).join(" "), recipe, source.aspectRatio, { [scene]:repair.plan.repair.direction }, source.board.shots.map(s=>s.narration)).shots.find(s=>s.index===scene);
    if (!replacement || replacement.narration !== source.board.shots.find(s=>s.index===scene)?.narration) throw new Error("Repair changed narration.");
    board.shots = board.shots.map(s=>s.index===scene?replacement:s);
    media[scene] = repair.media[`scene-${scene}-clip`];
  }
  const packet = { ...content, board, media, reviews };
  return { ...packet, fingerprint:sha256(JSON.stringify(packet)) };
}
