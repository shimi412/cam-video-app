import { createHash } from "node:crypto";
import type { ProductionParams } from "../brain";
import type { CharacterReference } from "./character-sheet-policy";

/** Semantic Starts prepare missing catalogue sheets as part of the image budget.
 * Existing approved sheets and legacy paid graphs remain immutable. The resulting
 * bytes are approved with the storyboard, never marked approved in the catalogue. */
export function referenceSheetPreparations(params: ProductionParams, references: CharacterReference[], used: string[]) {
  if (params.editorialPlan?.version !== "semantic-ideas-v1") return [];
  return references.filter(ref => used.includes(ref.id) && !ref.characterSheet).map(ref => ({
    reference: ref.id,
    id: `cast-${createHash("sha256").update(`reference-sheet-v1:${ref.id}:${ref.sha256}`).digest("hex").slice(0,16)}-1`,
    role: ref.id,
    prompt: `Create a character sheet of the EXACT character in the supplied reference. Preserve its face, silhouette, proportions, colors, wardrobe and handcrafted clay material. Do not invent a replacement identity. Three equal panels in one horizontal image: full-body front view, full-body rear view, close-up of the same face. One consistent character across all views, soft neutral studio lighting, plain gray background. No lettering, labels, props, added characters or scene layout. The sheet is an identity reference, not a storyboard composition.`,
  }));
}
