import type { AspectRatio } from "../recipes";

/** CAM images are native compositions. Empty typography space is part of the
 * photographed set, never a square plate enlarged with artificial bands. */
export function camFrameComposition(aspect: AspectRatio, graphics = false) {
  const canvas = aspect === "9:16" ? "Native vertical 9:16 composition" : aspect === "16:9" ? "Native horizontal 16:9 composition" : "Native square 1:1 composition";
  return `${canvas}, one continuous scene fills the complete canvas from edge to edge. Compose the set and perspective for this format from the outset. Never embed a square image, character-sheet panel, inset portrait, border, letterbox, duplicated edge, blurred extension, padded top or bottom, or horizontal background seam. Background depth and lighting continue naturally through the whole frame. ${graphics ? "The upper 38 percent stays visually quiet for local graphics, with the same continuous set and light; it is not a separate blank band. Keep the face and main gesture in the middle region, clear of that graphic area and the bottom caption margin." : "Use the full scene for meaningful action, setting and perspective; keep only the bottom 15 percent clear of essential faces and actions for captions."}`;
}
