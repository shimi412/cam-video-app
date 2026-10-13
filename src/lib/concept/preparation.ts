import type { ProductionParams } from "../brain";
import type { Recipe } from "../recipes";
import { planConcept } from "./storyboard";
import { placeholderTiming } from "./timing";
import { lockedAssets } from "./assets";
import { LOCAL_VOICES, sceneMediaUrl, type PreviewVoice } from "./preview-inputs";
import type { ConceptTiming } from "./types";

/** A reviewable, free preparation, never an approval to generate media. */
export async function prepareConcept(script: string, params: ProductionParams, recipe: Recipe, jobId?: string, measuredTiming?: ConceptTiming) {
  const board = planConcept(script, recipe, params.aspectRatio);
  const timing = measuredTiming ?? placeholderTiming(board.shots.map((shot) => shot.narration));
  const references = await lockedAssets();
  const preview: PreviewVoice = params.previewVoice ?? "silent";
  return {
    version: 1 as const,
    source: board.source,
    durationSeconds: timing.duration,
    measuredScenes: Boolean(measuredTiming),
    canGenerate: false as const,
    voice: { status: "selection-required" as const, name: preview === "silent" ? "Dylan" : LOCAL_VOICES[preview].name, preview,
      message: preview === "silent" ? "Dylan is available in the existing film. The voice for a new script still needs to be selected and approved. This preview will be silent."
        : `${LOCAL_VOICES[preview].name} is a free Mac test voice. The final CAM voice still needs approval. Scene lengths follow the recorded phrases; subtitle word positions are approximate.` },
    references: references.map(({ id, url, sha256 }) => ({ id, url, sha256 })),
    shots: board.shots.map((shot, i) => ({
      index: shot.index, narration: shot.narration, scene: shot.scene,
      references: shot.references, start: timing.phrases[i].start, end: timing.phrases[i].end,
      estimatedClipSeconds: shot.clipSeconds,
      media: jobId && params.sceneMedia?.[shot.index] ? { ...params.sceneMedia[shot.index], url: sceneMediaUrl(jobId, params.sceneMedia[shot.index]) } : null,
      editorialStatus: board.source === "offline-placeholder" ? "needs-staging" as const : "example-plan" as const,
    })),
  };
}
export type ConceptPreparation = Awaited<ReturnType<typeof prepareConcept>>;
