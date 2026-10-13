import type { ProductionParams } from "../brain";
import type { Recipe } from "../recipes";
import { planConcept } from "./storyboard";
import { placeholderTiming } from "./timing";
import { lockedAssets } from "./assets";
import { LOCAL_VOICES, sceneMediaUrl, type PreviewVoice } from "./preview-inputs";
import type { ConceptTiming } from "./types";
import { camVoiceReference } from "./cam-voice";
import { generationPlan } from "./generation-plan";
import { DEMO_SCRIPT } from "./existing";
import { normalizedText } from "./text";

/** A reviewable, free preparation, never an approval to generate media. */
export async function prepareConcept(script: string, params: ProductionParams, recipe: Recipe, jobId?: string, measuredTiming?: ConceptTiming) {
  const board = planConcept(script, recipe, params.aspectRatio, params.sceneDirections);
  const timing = measuredTiming ?? placeholderTiming(board.shots.map((shot) => shot.narration));
  const references = await lockedAssets();
  const preview: PreviewVoice = params.previewVoice ?? "silent";
  const plan = generationPlan(script, params, board, timing, references);
  return {
    version: 1 as const,
    source: board.source,
    durationSeconds: timing.duration,
    measuredScenes: Boolean(measuredTiming),
    canGenerate: false as const,
    voice: { status: "identity-verified" as const, name: preview === "silent" ? "Dylan" : LOCAL_VOICES[preview].name, preview,
      cam: await camVoiceReference(),
      message: preview === "silent" ? "Dylan's exact preset has been identified. A new reading still needs a paid generation and review. This free preview will be silent."
        : `${LOCAL_VOICES[preview].name} is a free Mac test voice. Dylan is the CAM reference voice; a new reading still needs generation and review. Scene lengths follow the test voice; subtitle word positions are approximate.` },
    generation: { fingerprint: plan.fingerprint, operations: plan.operations.length, images: plan.operations.filter((op) => op.kind === "image").length,
      clips: plan.operations.filter((op) => op.kind === "video").length, reusedScenes: plan.reusedScenes.length, blockers: plan.blockers,
      downloadUrl: jobId ? `/api/jobs/${jobId}/generation-plan` : null },
    references: references.map(({ id, url, sha256 }) => ({ id, url, sha256 })),
    shots: board.shots.map((shot, i) => ({
      index: shot.index, narration: shot.narration, scene: shot.scene, motion: shot.motion,
      endScene: shot.endScene, overlay: shot.overlay, strike: shot.strike,
      references: shot.references, start: timing.phrases[i].start, end: timing.phrases[i].end,
      estimatedClipSeconds: shot.clipSeconds,
      media: jobId && params.sceneMedia?.[shot.index] ? { ...params.sceneMedia[shot.index], url: sceneMediaUrl(jobId, params.sceneMedia[shot.index]) } : null,
      editorialStatus: params.sceneDirections?.[shot.index] ? "edited-draft" as const : normalizedText(script) === normalizedText(DEMO_SCRIPT) ? "example-plan" as const : "suggested-draft" as const,
    })),
  };
}
export type ConceptPreparation = Awaited<ReturnType<typeof prepareConcept>>;
