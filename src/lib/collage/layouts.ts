/**
 * Composition library for the collage engine.
 *
 * Principles measured on Vox / Johnny Harris collage frames (2026-08-20):
 * one hero per frame, large (60-80% of the content width), centered or on a
 * third; supporting elements smaller and aligned on the hero's edges; stacks
 * offset by a few percent and rotated 2-4°; series laid in a row at equal size;
 * constant margins, nothing touching the frame edge; handwritten words aligned
 * on the hero's top-left corner or centered above it.
 *
 * Every position is computed inside the SAFE CONTENT AREA of the format
 * (platform UI excluded, caption zone excluded), so nothing lands in a border.
 */
import type { AspectRatio } from "../recipes";

export type Box = { x: number; y: number; w: number; h: number; rotation: number };
export type Role = "hero" | "support1" | "support2" | "support3";

export type SafeZones = {
  W: number;
  H: number;
  /** Band reserved for handwritten keywords, above the content area. */
  wordBand: { x: number; y: number; w: number; h: number };
  /** Content area: where elements may live. */
  content: { x: number; y: number; w: number; h: number };
  /** Caption block area (inside the safe area, below the content). */
  caption: { x: number; y: number; w: number; h: number };
};

export function safeZones(aspect: AspectRatio): SafeZones {
  if (aspect === "16:9") {
    const W = 1920, H = 1080;
    return {
      W, H,
      wordBand: { x: W * 0.08, y: H * 0.08, w: W * 0.84, h: H * 0.12 },
      content: { x: W * 0.08, y: H * 0.21, w: W * 0.84, h: H * 0.52 },
      caption: { x: W * 0.16, y: H * 0.76, w: W * 0.68, h: H * 0.14 },
    };
  }
  if (aspect === "1:1") {
    const W = 1080, H = 1080;
    return {
      W, H,
      wordBand: { x: W * 0.07, y: H * 0.06, w: W * 0.86, h: H * 0.1 },
      content: { x: W * 0.07, y: H * 0.17, w: W * 0.86, h: H * 0.52 },
      caption: { x: W * 0.1, y: H * 0.72, w: W * 0.8, h: H * 0.18 },
    };
  }
  // 9:16: top ~12% and bottom ~22% are covered by platform UI (Reels/TikTok/Shorts).
  const W = 1080, H = 1920;
  return {
    W, H,
    wordBand: { x: W * 0.07, y: H * 0.125, w: W * 0.86, h: H * 0.075 },
    content: { x: W * 0.07, y: H * 0.205, w: W * 0.86, h: H * 0.43 },
    caption: { x: W * 0.09, y: H * 0.655, w: W * 0.82, h: H * 0.12 },
  };
}

export const LAYOUTS = [
  "hero-center",
  "hero-left-support-right",
  "hero-right-support-left",
  "stack-offset",
  "diptych",
  "document-annotated",
  "row-three",
  "hero-top-support-below",
  "diagonal",
  "series-pair",
] as const;
export type LayoutId = (typeof LAYOUTS)[number];

export const LAYOUT_DESCRIPTIONS: Record<LayoutId, string> = {
  "hero-center": "one large element centered; the strongest single image (1 hero, optional tiny prop)",
  "hero-left-support-right": "hero on the left two-thirds, one smaller support on the right aligned on the hero's middle (2 elements)",
  "hero-right-support-left": "mirror of the previous one (2 elements)",
  "stack-offset": "2-3 documents/cards stacked with small offsets and rotations, like a pile of evidence (2-3 elements)",
  "diptych": "two equal elements side by side, same size, aligned: comparison, before/after, cause/effect (2 elements)",
  "document-annotated": "one document/card nearly filling the width, to be annotated (circle, underline, arrow) while the camera pushes in (1 element)",
  "row-three": "three equal small elements in a row: a series, a list, repetition (3 elements)",
  "hero-top-support-below": "hero in the upper part, a smaller support under it, both centered (2 elements)",
  "diagonal": "hero centered, two small satellites on opposite corners of the content area: tension, attack, spread (3 elements)",
  "series-pair": "two medium elements side by side plus one small prop centered below (3 elements)",
};

type Rel = { cx: number; cy: number; w: number; rot: number };

/** Relative placements (fractions of the content area: center x/y, width) per layout and role. */
const PLACEMENTS: Record<LayoutId, Partial<Record<Role, Rel>>> = {
  "hero-center": {
    hero: { cx: 0.5, cy: 0.5, w: 0.72, rot: -2 },
    support1: { cx: 0.84, cy: 0.86, w: 0.22, rot: 6 },
  },
  "hero-left-support-right": {
    hero: { cx: 0.34, cy: 0.5, w: 0.6, rot: -3 },
    support1: { cx: 0.8, cy: 0.48, w: 0.32, rot: 4 },
  },
  "hero-right-support-left": {
    hero: { cx: 0.66, cy: 0.5, w: 0.6, rot: 3 },
    support1: { cx: 0.2, cy: 0.48, w: 0.32, rot: -4 },
  },
  "stack-offset": {
    hero: { cx: 0.5, cy: 0.52, w: 0.62, rot: -2 },
    support1: { cx: 0.56, cy: 0.44, w: 0.6, rot: 4 },
    support2: { cx: 0.44, cy: 0.6, w: 0.58, rot: -7 },
  },
  diptych: {
    hero: { cx: 0.27, cy: 0.5, w: 0.44, rot: -2 },
    support1: { cx: 0.73, cy: 0.5, w: 0.44, rot: 2 },
  },
  "document-annotated": {
    hero: { cx: 0.5, cy: 0.5, w: 0.86, rot: -1.5 },
  },
  "row-three": {
    hero: { cx: 0.18, cy: 0.5, w: 0.3, rot: -2 },
    support1: { cx: 0.5, cy: 0.5, w: 0.3, rot: 1 },
    support2: { cx: 0.82, cy: 0.5, w: 0.3, rot: -1 },
  },
  "hero-top-support-below": {
    hero: { cx: 0.5, cy: 0.34, w: 0.62, rot: -2 },
    support1: { cx: 0.5, cy: 0.82, w: 0.34, rot: 3 },
  },
  diagonal: {
    hero: { cx: 0.5, cy: 0.5, w: 0.56, rot: -3 },
    support1: { cx: 0.14, cy: 0.14, w: 0.24, rot: -8 },
    support2: { cx: 0.86, cy: 0.86, w: 0.24, rot: 8 },
  },
  "series-pair": {
    hero: { cx: 0.3, cy: 0.38, w: 0.42, rot: -2 },
    support1: { cx: 0.7, cy: 0.38, w: 0.42, rot: 2 },
    support2: { cx: 0.5, cy: 0.84, w: 0.24, rot: 0 },
  },
};

/** Number of element roles a layout uses (hero first). */
export function layoutRoles(layout: LayoutId): Role[] {
  return (Object.keys(PLACEMENTS[layout]) as Role[]).filter((r) => PLACEMENTS[layout][r]);
}

/**
 * Computes the pixel box of a role in a layout, inside the content area.
 * `ratio` = element width / height (trimmed cut-out); the box keeps that aspect.
 */
export function placeRole(layout: LayoutId, role: Role, zones: SafeZones, ratio = 1): Box | undefined {
  const rel = PLACEMENTS[layout][role];
  if (!rel) return undefined;
  const c = zones.content;
  const r = Math.max(0.35, Math.min(2.8, ratio || 1));
  // Width is a fraction of the content width; tall elements are capped by the content height.
  let w = rel.w * c.w;
  let h = w / r;
  const maxH = c.h * (role === "hero" ? 0.92 : 0.6);
  if (h > maxH) { h = maxH; w = h * r; }
  const cx = c.x + rel.cx * c.w;
  const cy = c.y + rel.cy * c.h;
  // Keep the box inside the content area.
  const x = Math.max(c.x, Math.min(c.x + c.w - w, cx - w / 2));
  const y = Math.max(c.y, Math.min(c.y + c.h - h, cy - h / 2));
  return { x, y, w, h, rotation: rel.rot };
}

/**
 * Where a handwritten word goes: in the word band above the content, aligned on the
 * hero's left edge (hero layouts) or centered (symmetric layouts). A second word of the
 * same sentence goes to the opposite side of the band, never overlapping.
 */
export function wordAnchor(layout: LayoutId, hero: Box, zones: SafeZones, fontPx: number, index: number): { x: number; y: number; align: "left" | "center" | "right" } {
  const b = zones.wordBand;
  const y = b.y + Math.max(0, (b.h - fontPx) / 2);
  const symmetric = layout === "document-annotated" || layout === "row-three" || layout === "diptych" || layout === "series-pair" || layout === "hero-center" || layout === "hero-top-support-below";
  if (index === 0) {
    if (symmetric) return { x: b.x + b.w / 2, y, align: "center" };
    const left = hero.x < zones.W / 2;
    return left ? { x: Math.max(b.x, hero.x), y, align: "left" } : { x: Math.min(b.x + b.w, hero.x + hero.w), y, align: "right" };
  }
  // Second word: opposite side, slightly lower so it reads as a separate note.
  const left = hero.x >= zones.W / 2;
  return left ? { x: b.x, y: y + fontPx * 0.55, align: "left" } : { x: b.x + b.w, y: y + fontPx * 0.55, align: "right" };
}
