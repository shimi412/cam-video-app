import type { RenderPacket } from "./production-flow";
import type { SceneDirection } from "./types";
import type { Recipe } from "../recipes";
import type { ProductionParams } from "../brain";
import { generationPlan } from "./generation-plan";
import { planConcept } from "./storyboard";
import { sha256 } from "./checkpoints";
import { physicalDirectionIssues } from "./physical-direction";

/** A separate, quoteable repair proposal. It cannot reuse an old budget approval
 * or mutate the original production's provider journal. No provider calls. */
export function sceneRepairPlan(packet: RenderPacket, scene: number, direction: SceneDirection, recipe: Recipe, references: { id: string; url: string; sha256: string }[]) {
  if (sha256(JSON.stringify(Object.fromEntries(Object.entries(packet).filter(([key]) => key !== "fingerprint")))) !== packet.fingerprint) throw new Error("Original production packet changed.");
  if (!packet.board.shots.some((shot) => shot.index === scene)) throw new Error("Unknown scene to repair.");
  const issues = physicalDirectionIssues(direction); if (issues.length) throw new Error(issues.join(" "));
  const directions = Object.fromEntries(packet.board.shots.map(shot => [shot.index, shot.index === scene ? direction : {
    scene: shot.scene, motion: shot.motion, references: shot.references, endScene: shot.endScene, overlay: shot.overlay, strike: shot.strike,
  }]));
  const script = packet.board.shots.map(s => s.narration).join(" ");
  const board = planConcept(script, recipe, packet.aspectRatio, directions);
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
