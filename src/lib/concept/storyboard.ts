import type { Recipe, AspectRatio } from "../recipes";
import { buildImagePrompt, buildMotionPrompt } from "../recipes";
import { BoardSchema, type ConceptBoard } from "./types";
import { conceptPhrases, estimatedSpeechSeconds, normalizedText } from "./text";
import eyal from "./eyal-phrases.json";

// The October beat sheet belongs to this exact script, never to an arbitrary new script.
const EYAL_SCENES = [
  "The locked clay narrator below a wide empty title area, looking up in surprise. Warm clay studio.",
  "The black clay monsters visibly manufacture a false effigy at a workbench; their hands remain on the clay. The narrator watches with concern.",
  "Close-up of the same workbench, monster hands shaping the effigy and placing red clay in its eyes. Keep the fabrication visibly in frame.",
  "The same fabrication workshop in a medieval setting. The locked adult narrator watches, wearing a simple medieval tunic.",
  "The narrator leaves the workshop and invites the viewer to follow. Empty space above for a title.",
  "The clay monsters carry a heavy old legal book together above their heads. Its pages have no readable writing.",
  "The monsters place the book on a table and cut paper strips out of it with oversized craft scissors. No people are threatened.",
  "The monsters stitch the torn strips together into a visibly distorted new book. The narrator watches the fabrication.",
  "The narrator closes his eyes. In the distant background, abstract clay flames suggest a painful historical memory; no victims or weapons.",
  "The same narrator remains still as the distant abstract fire fades. Reflective, somber expression.",
  "Close view of the concerned adult narrator; a small sheltered clay lamp symbolizes the people targeted by the lie. No children.",
  "The narrator points at a blank presentation board with the monsters and their stitched book, leaving space for a red cross added in code.",
  "A clay presentation board with the stitched book sits next to the narrator, ready to become a smartphone. Screen empty, no letters.",
  "The narrator faces the viewer, steady and determined, below a wide empty space for the closing message.",
];

export function assertNarrationPreserved(script: string, narrations: string[]): void {
  if (normalizedText(conceptPhrases(script).join(" ")) !== normalizedText(narrations.join(" "))) {
    throw new Error("Storyboard changed the script. Review is required.");
  }
}

/** Free planning uses the approved example or explicit neutral placeholders. No hidden LLM call. */
export function planConcept(script: string, recipe: Recipe, aspect: AspectRatio): ConceptBoard {
  const isExample = normalizedText(script) === normalizedText(eyal.join(" "));
  const phrases = isExample ? eyal : conceptPhrases(script);
  const board = BoardSchema.parse({ shots: phrases.map((narration, i) => ({
    narration,
    scene: isExample ? EYAL_SCENES[i] : "The locked clay narrator beside a closed book on a warm clay stage. Neutral planning placeholder; a director must stage this sentence before generation.",
    motion: isExample && i === 12 ? "Continuous single take. The board slowly reshapes into an empty smartphone screen. Reach the final shape before the clip ends." : "Continuous single take. Subtle breathing and one restrained gesture towards the scene's main object. Static camera, no zoom, no cuts.",
    references: isExample && i >= 1 && i <= 7 ? (i <= 3 ? ["narrator", "monster", "effigy"] : ["narrator", "monster"]) : ["narrator"],
    endScene: isExample && i === 12 ? "Same locked narrator, stage, light and camera; the presentation board is now a clay smartphone with a blank screen." : null,
    overlay: isExample ? ({ 0: "“THE TALMUD PERMITS PEDOPHILIA.”", 4: "HERE’S HOW THE LIE WORKS.", 11: "A FABRICATED CLAIM", 13: "EXPOSE IT." } as Record<number, string>)[i] ?? null : null,
    strike: isExample && i === 0,
  })) });
  assertNarrationPreserved(script, board.shots.map((s) => s.narration));
  return {
    source: isExample ? "validated-example" : "offline-placeholder",
    requiresReview: true,
    shots: board.shots.map((shot, index) => ({
      ...shot, index: index + 1,
      imagePrompt: buildImagePrompt(recipe, `Use the locked references only for identity and materials, not their standing pose or grey backdrop. Create this new scene: ${shot.scene}`, aspect),
      endImagePrompt: shot.endScene ? buildImagePrompt(recipe, `Preserve the start frame camera, light and identities. Target end state: ${shot.endScene}`, aspect) : null,
      motionPrompt: buildMotionPrompt(recipe, shot.motion),
      clipSeconds: Math.max(5, Math.ceil(estimatedSpeechSeconds(shot.narration) + 0.35)),
    })),
  };
}
