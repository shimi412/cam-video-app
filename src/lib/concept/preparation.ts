import type { ProductionParams } from "../brain";
import type { Recipe } from "../recipes";
import { planConcept } from "./storyboard";
import { placeholderTiming } from "./timing";
import { lockedAssets } from "./assets";

/** A reviewable, free preparation, never an approval to generate media. */
export async function prepareConcept(script: string, params: ProductionParams, recipe: Recipe) {
  const board = planConcept(script, recipe, params.aspectRatio);
  const timing = placeholderTiming(board.shots.map((shot) => shot.narration));
  const references = await lockedAssets();
  return {
    version: 1 as const,
    source: board.source,
    durationSeconds: timing.duration,
    canGenerate: false as const,
    voice: { status: "selection-required" as const, name: "Dylan", preview: "silent" as const,
      message: "Dylan is available in the existing film. The voice for a new script still needs to be selected and approved. This preview will be silent." },
    references: references.map(({ id, url, sha256 }) => ({ id, url, sha256 })),
    shots: board.shots.map((shot, i) => ({
      index: shot.index, narration: shot.narration, scene: shot.scene,
      references: shot.references, start: timing.phrases[i].start, end: timing.phrases[i].end,
      estimatedClipSeconds: shot.clipSeconds,
      editorialStatus: board.source === "offline-placeholder" ? "needs-staging" as const : "example-plan" as const,
    })),
  };
}
export type ConceptPreparation = Awaited<ReturnType<typeof prepareConcept>>;
