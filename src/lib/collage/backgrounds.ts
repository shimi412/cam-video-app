/**
 * Background plates for the collage engine: generated paper pieces placed
 * BEHIND the composition, covering only part of the frame, to vary the scenes
 * (Shimon, 2026-08-20). One plate type + one placement per sentence, chosen by
 * the director, anti-repetition enforced by the composer.
 */
import type { SafeZones } from "./layouts";

export const PLATE_TYPES = [
  "kraft-torn",
  "newspaper-clipping",
  "map-fragment",
  "halftone-teal",
  "grid-paper",
  "ink-wash",
  "tape-strips",
  "red-field",
] as const;
export type PlateType = (typeof PLATE_TYPES)[number];

export const PLATE_PROMPTS: Record<PlateType, string> = {
  "kraft-torn": "A large piece of aged kraft paper with torn irregular edges on all sides, warm tan, subtle fibers, slightly wrinkled.",
  "newspaper-clipping": "A torn rectangular old newspaper clipping, yellowed, with columns of blurred illegible print and a faint halftone photo area, torn edges.",
  "map-fragment": "A torn fragment of an antique engraved map, sepia, coastlines and hatching, no readable names, torn edges.",
  "halftone-teal": "A rectangular block of muted teal blue halftone dots on paper, torn edge on one side, like a torn poster piece.",
  "grid-paper": "A torn piece of vintage ledger graph paper, faint blue grid lines, cream paper, torn edges.",
  "ink-wash": "A large irregular grey ink wash blot with soft feathered edges, watercolor texture, no shape meaning.",
  "tape-strips": "Three pieces of semi-transparent beige masking tape, different lengths, slightly crumpled, arranged loosely.",
  "red-field": "A rectangular block of vermilion red paper with halftone texture and one torn diagonal edge.",
};

export const PLATE_STYLE_PREFIX =
  "Paper collage background plate, documentary explainer style, flat, no shadow, isolated on a plain pure white background, nothing else in the frame, no text, no letters, no people.";

export const PLATE_PLACEMENTS = [
  "behind-hero",
  "top-left-quadrant",
  "right-half",
  "diagonal-band",
  "bottom-strip",
  "top-band",
  "left-half",
] as const;
export type PlatePlacement = (typeof PLATE_PLACEMENTS)[number];

export type PlateBox = { x: number; y: number; w: number; h: number; rotation: number; opacity: number };

/** Pixel box of a plate placement; plates may bleed outside the content area (they are background), never beyond the frame by more than 6%. */
export function placePlate(placement: PlatePlacement, zones: SafeZones, hero?: { x: number; y: number; w: number; h: number }): PlateBox {
  const { W, H, content: c } = zones;
  switch (placement) {
    case "behind-hero": {
      const hx = hero?.x ?? c.x + c.w * 0.2, hy = hero?.y ?? c.y + c.h * 0.2, hw = hero?.w ?? c.w * 0.6, hh = hero?.h ?? c.h * 0.6;
      const w = hw * 1.35, h = hh * 1.35;
      return { x: hx + hw / 2 - w / 2, y: hy + hh / 2 - h / 2, w, h, rotation: -5, opacity: 0.9 };
    }
    case "top-left-quadrant":
      return { x: -W * 0.04, y: c.y - H * 0.05, w: W * 0.62, h: c.h * 0.62, rotation: -3, opacity: 0.9 };
    case "right-half":
      return { x: W * 0.48, y: c.y - H * 0.04, w: W * 0.58, h: c.h * 1.12, rotation: 2, opacity: 0.9 };
    case "left-half":
      return { x: -W * 0.06, y: c.y - H * 0.04, w: W * 0.58, h: c.h * 1.12, rotation: -2, opacity: 0.9 };
    case "diagonal-band":
      return { x: -W * 0.1, y: c.y + c.h * 0.25, w: W * 1.2, h: c.h * 0.5, rotation: -12, opacity: 0.85 };
    case "bottom-strip":
      return { x: -W * 0.03, y: c.y + c.h * 0.62, w: W * 1.06, h: c.h * 0.48, rotation: 1.5, opacity: 0.9 };
    case "top-band":
      return { x: -W * 0.03, y: zones.wordBand.y - H * 0.03, w: W * 1.06, h: c.h * 0.45, rotation: -1.5, opacity: 0.9 };
  }
}
