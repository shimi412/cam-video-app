import type { ProductionParams } from "../brain";
import { getActiveRecipe } from "../recipes";
import { CAM_VOICE } from "./cam-voice";
import { prepareConcept } from "./preparation";

/** Read-only projection: unconfirmed drafts follow the current voice selection.
 * A completed/running result keeps its original preparation and provenance.
 */
export async function currentDraft(job: { id: string; status: string; script: string; params: unknown }) {
  const params = job.params as ProductionParams & { preparation?: unknown; draft?: Record<string, unknown> };
  const recipe = getActiveRecipe(params.templateSlug);
  if (job.status !== "estimated" || params.previewSource === "existing" || !recipe?.concept) return { preparation: params.preparation ?? null, draft: params.draft };
  const preparation = await prepareConcept(job.script, params, recipe, job.id);
  const draft = params.draft;
  const estimate = draft?.estimate as Record<string, unknown> | undefined;
  const lines = Array.isArray(estimate?.lines) ? estimate.lines.map((line) => ({ ...line,
    label: line.label === "Planning, transcription & rendering allowance" ? "Planning & rendering allowance" : line.label })) : estimate?.lines;
  return {
    preparation,
    draft: draft ? { ...draft, estimate: estimate ? { ...estimate, lines, unpriced: [`${CAM_VOICE.name} voice · quote required`, "Voice synchronization · quote required"] } : estimate } : undefined,
  };
}
