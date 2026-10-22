import type { CharacterReference } from "./character-sheet-policy";
import type { VideoModels } from "./model-selection";
import type { ProductionParams } from "../brain";
import type { ConceptBoard } from "./types";
import { generationPlan } from "./generation-plan";
import { alignmentHash, approveAlignedVoice, type VoiceAlignment, type VoiceApproval } from "./voice-alignment";
import type { AudioAsset } from "./media-transfers";

/** Rebuild clip lengths only after the recording + transcript pair is reviewed.
 * New audio/timing hashes invalidate animation quotes and approvals, even when
 * two readings happen to have the same rounded duration. No speed-up or truncation.
 */
export function alignedGenerationPlan(input: { script: string; params: ProductionParams; board: ConceptBoard; references: CharacterReference[];
  videoModels?: VideoModels; audio: AudioAsset; alignment: VoiceAlignment; approval: VoiceApproval; mode: "simulation" | "live" }) {
  const timing = approveAlignedVoice(input.board.shots.map((s) => s.narration), input.audio, input.alignment, input.approval, input.mode);
  const plan = generationPlan(input.script, input.params, input.board, timing, input.references, {
    audioSha256: input.audio.sha256, alignmentSha256: alignmentHash(input.alignment), source: input.mode === "simulation" ? "simulation" : "reviewed",
  }, input.videoModels);
  return { timing, plan };
}
