import type { Recipe, AspectRatio } from "../recipes";
import { buildImagePrompt, buildMotionPrompt } from "../recipes";
import { BoardSchema, type ConceptBoard, type SceneDirection } from "./types";
import { suggestDirection } from "./direction";
import { conceptPhrases, estimatedSpeechSeconds, normalizedText } from "./text";
import eyal from "./eyal-phrases.json";
import { changesState } from "./physical-direction";
import { aspectComposition } from "../recipes";
import { validatePresenterText } from "./presenter-text";

function clayImage(scene: string, refs: SceneDirection["references"], aspect: AspectRatio) {
  const characters = refs.map((ref) => ref === "narrator" ? "The exact locked adult narrator: cap, striped shirt, suspenders and brown trousers, never overalls."
    : ref === "monster" ? "The exact locked black clay fabricators." : "The locked effigy is visibly being fabricated, never shown as a real identity.").join(" ");
  return `A single full-frame shot, not a storyboard. Reference sheets specify exact identity and materials only, never their standing pose or grey backdrop. ${characters} ${scene} Premium handcrafted plasticine stop-motion, real miniature set, matte clay with fingerprints, shallow depth of field. Photographed on a real stop-motion set, not CGI. Warm cream, deep brown and mustard; red only for misinformation and rejection. ${aspectComposition(aspect)} No text, letters, numbers or logos anywhere. No new characters, children, gore or weapons aimed at people.`;
}

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

/** Free editorial suggestions. Review is mandatory; no hidden LLM or media call. */
export function planConcept(script: string, recipe: Recipe, aspect: AspectRatio, directions: Record<string, SceneDirection> = {}): ConceptBoard {
  const isExample = normalizedText(script) === normalizedText(eyal.join(" "));
  const phrases = isExample ? eyal : conceptPhrases(script);
  if (Object.keys(directions).some((key) => !/^[1-9]\d*$/.test(key) || Number(key) > phrases.length)) throw new Error("Unknown scene direction.");
  const board = BoardSchema.parse({ shots: phrases.map((narration, i) => ({
    ...(directions[i + 1] ?? (!isExample ? suggestDirection(narration) : {
      scene: EYAL_SCENES[i],
      motion: i === 12 ? "Continuous single take. The board slowly reshapes into an empty smartphone screen. Reach the final shape before the clip ends." : "Continuous single take. Subtle breathing and one restrained gesture towards the scene's main object. Static camera, no zoom, no cuts.",
      references: i >= 1 && i <= 7 ? (i <= 3 ? ["narrator", "monster", "effigy"] : ["narrator", "monster"]) : ["narrator"],
      endScene: i === 12 ? "Same locked narrator, stage, light and camera; the presentation board is now a clay smartphone with a blank screen." : null,
      overlay: ({ 0: "“THE TALMUD PERMITS PEDOPHILIA.”", 4: "HERE’S HOW THE LIE WORKS.", 11: "A FABRICATED CLAIM", 13: "EXPOSE IT." } as Record<number, string>)[i] ?? null,
      strike: i === 0,
    })),
    // Directions can never replace narration, including persisted legacy input.
    narration,
  })) });
  assertNarrationPreserved(script, board.shots.map((s) => s.narration));
  board.shots.forEach(shot => validatePresenterText(shot, shot.narration));
  return {
    source: Object.keys(directions).length ? "edited-draft" : isExample ? "validated-example" : "offline-draft",
    requiresReview: true,
    shots: board.shots.map((shot, index) => ({
      ...shot, index: index + 1,
      imagePrompt: recipe.slug === "cam-clay" ? clayImage(`${shot.scene}${shot.visualMode === "presenter-text" ? " Keep the presenter and all gestures below the upper 38 percent of the frame. The upper area is a quiet, uncluttered warm background reserved for typography added later; do not draw lettering or a text panel." : ""}`, shot.references, aspect) : buildImagePrompt(recipe, shot.scene, aspect),
      endImagePrompt: shot.endScene ? (recipe.slug === "cam-clay" ? clayImage(`Preserve the start camera and lighting. Final state: ${shot.endScene}`, shot.references, aspect) : buildImagePrompt(recipe, shot.endScene, aspect)) : null,
      motionPrompt: recipe.slug === "cam-clay" ? `Handcrafted plasticine stop-motion animation, animated on twos with subtle clay boil. ${shot.motion} Keep the exact locked design${shot.references.includes("narrator") ? ", cap always on, striped shirt, suspenders and brown trousers" : ""}. No new objects, text, logos, cuts, dialogue or music. Continuous single take. Complete the action with a readable final hold.` : buildMotionPrompt(recipe, shot.motion),
      clipSeconds: Math.max(changesState(shot) ? 4 : 3, Math.ceil(shot.actionSeconds ?? Math.max(5, estimatedSpeechSeconds(shot.narration) + .35))),
    })),
  };
}
