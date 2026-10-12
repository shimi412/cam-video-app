/**
 * The video model library: one frozen recipe per model, with its style bible.
 * Single source of truth — the seed writes these into `templates.recipe`, the
 * director brain reads them to write storyboards, the Studio lists them.
 *
 * Validated by Shimon on 2026-08-20 for the test phase (5 recipes, tests in 9:16):
 *  cartoon-flat-vector, cartoon-ink-noir, cartoon-retro,
 *  whiteboard-vox-collage, whiteboard-marker.
 *
 * A new model = a new entry here + `pnpm db:seed`, never a development.
 */

export type Family = "cartoon" | "whiteboard";
export type AspectRatio = "9:16" | "16:9" | "1:1";
export type Tone = "serious" | "energetic" | "calm";

export type StyleBible = {
  /** Rendering technique and look, written as the opening of every image prompt. */
  artDirection: string;
  /** Fixed palette, repeated in every image prompt. */
  palette: string;
  /** Recurring characters and how the lie/antagonist is represented. Empty for non-character styles. */
  characters: string;
  /** Framing rules (independent of aspect ratio, which is appended at runtime). */
  composition: string;
  /** Camera and motion rules for the clip prompts (cartoon family only). */
  motion: string;
  /** Hard bans, appended to every prompt. */
  forbidden: string;
  /** Negative prompt for video models. */
  negativePrompt: string;
  /** Whether 1-2 handwritten keywords per shot are allowed inside the image. */
  handwrittenKeywords: boolean;
};

/** Montage engine settings for collage recipes (whiteboard family). */
export type CollageStyle = {
  /** CSS for the scene background layer (paper, board...). */
  backgroundCss: string;
  /** Marker ink for annotations (circles, arrows, underlines). */
  ink: string;
  /** Accent color for the lie (crosses, red strips). */
  accent: string;
  /** Handwritten keywords color. */
  handColor: string;
  /** Caption base / active colors. */
  captionBase: string;
  captionActive: string;
  /** Prefix prepended to every cut-out element prompt (isolated object, plain background). */
  cutoutPrompt: string;
};

export type Recipe = {
  slug: string;
  status: "active" | "archived";
  name: string;
  family: Family;
  description: string;
  bible: StyleBible;
  defaultTone: Tone;
  voiceId: string;
  /** Path under public/ of the validated test keyframe. */
  thumbnail: string;
  /** Present on collage-engine recipes (whiteboard family). */
  collage?: CollageStyle;
  /** Concept engine is exposed for free previews until its paid path is validated. */
  concept?: { version: 1; previewOnly: boolean };
};

const FORBIDDEN_COMMON =
  "No text, no letters, no numbers, no readable characters, no logos, no flags, no real people or real faces, no gore or blood, no caricature or stereotyped features of any group; the lie and its authors stay abstract, victims are never depicted in a demeaning way. Never depict children or minors in any form (no child silhouettes, no small figures standing for children), never a weapon or a threat aimed at a human figure: vulnerable people are suggested only by abstract non-human shapes (a small flame, a seed, a lamp, a sheltered circle).";

const NARRATOR =
  "Recurring narrator: a dignified person in their thirties, short dark hair, dark jacket, neutral calm face, no religious or ethnic markers; they observe, point, demonstrate, never shout. The lie is always an abstract entity: a spreading red stain, a faceless megaphone, a torn and re-glued page, scissors cutting a line out of context.";

export const RECIPES: Recipe[] = [
  {
    slug: "cam-clay",
    status: "active",
    name: "CAM · Clay",
    family: "cartoon",
    description: "A tactile clay world with a recurring narrator. Free planning preview with placeholder visuals and silent audio; final production is being prepared.",
    bible: {
      artDirection: "Handcrafted realistic clay miniature world, visible fingerprints and soft modeling-clay texture, warm studio lighting, restrained stop-motion character acting.",
      palette: "Warm cream #FFF4DC, deep brown #3B2416, mustard #F2B632 and red #E5392B reserved for misinformation and its rejection.",
      characters: "Use the locked narrator and black clay monster reference sheets. Preserve identity, materials and clothing. Monsters visibly manufacture the falsehood; any effigy is only shown as their fabrication, never alone.",
      composition: "One clear action per shot. Adult narrator in the middle area, room above for headlines. Reserve the lower caption band; no faces or important objects in it.",
      motion: "Restrained character action, continuous single shot. No cuts, no last-frame surprise, keep the final action readable before the end. No generated dialogue or music.",
      forbidden: "No children, real faces, weapons aimed at people, gore, logos, letters, numbers or generated text. No isolated ethnic caricature: only the explicitly contextualized fabricated effigy at the monsters' workbench.",
      negativePrompt: "text, letters, watermark, logo, children, real faces, weapons, flicker, extra limbs, abrupt cuts",
      handwrittenKeywords: false,
    },
    defaultTone: "serious",
    voiceId: "dylan-pending-verification",
    thumbnail: "/recipes/cam-clay/narrator.png",
    concept: { version: 1, previewOnly: true },
  },
  {
    slug: "cartoon-flat-vector",
    status: "archived",
    name: "Cartoon · Flat vector",
    family: "cartoon",
    description:
      "Modern flat-vector explainer: bold geometric shapes, no outlines, crisp and legible on a phone. The most 'social explainer' of the three cartoon looks.",
    bible: {
      artDirection:
        "Flat vector explainer illustration, bold geometric shapes, no outlines, minimal gradients, crisp edges, modern motion-design look.",
      palette: "Strict palette: deep indigo background, electric amber for what is true or enlightening, coral red for the lie and the threat, soft cream for characters and light.",
      characters: NARRATOR,
      composition:
        "One idea per shot. Subject centered, generous negative space, the lower third of the frame left empty for subtitles. Concrete visual metaphors, never literal depictions of the accusation.",
      motion:
        "Slow camera only: gentle push-in or lateral drift. One animated element per shot (the stain spreads, the strip is cut, the page tears). Characters almost still. No fast motion, no cuts, no transitions inside the clip.",
      forbidden: FORBIDDEN_COMMON,
      negativePrompt: "text, letters, watermark, logo, photorealistic, 3d render, blur, distortion, extra limbs, fast motion, flicker",
      handwrittenKeywords: false,
    },
    defaultTone: "serious",
    voiceId: "narrator-en-1",
    thumbnail: "/recipes/cartoon-flat-vector.jpg",
  },
  {
    slug: "cartoon-ink-noir",
    status: "archived",
    name: "Cartoon · Ink noir",
    family: "cartoon",
    description:
      "Graphic-novel ink and wash: expressive black brush lines, grey washes, heavy blacks, a single red accent. Grave and investigative, for the hardest subjects.",
    bible: {
      artDirection:
        "Graphic-novel ink and wash illustration, expressive black brush lines, grey ink washes, high contrast, heavy blacks, visible brush texture, serious investigative mood like a political graphic novel.",
      palette: "Strict palette: black ink, grey washes, paper white, and a single red accent reserved for the lie and the stain. No other color.",
      characters: NARRATOR,
      composition:
        "One idea per shot. Strong diagonals, dramatic framing, subject in the upper two thirds, the lower third of the frame left as a calm wash with no detail for subtitles. No comic-panel borders.",
      motion:
        "Slow camera only: push-in or slow tilt. One animated element per shot (ink bleeds, a page lifts, the stain creeps). Characters almost still. No fast motion, no cuts.",
      forbidden: FORBIDDEN_COMMON + " No handwriting on pages (pages show abstract grey wash, never writing).",
      negativePrompt: "text, handwriting, letters, watermark, logo, photorealistic, color except red, blur, extra limbs, fast motion, flicker",
      handwrittenKeywords: false,
    },
    defaultTone: "serious",
    voiceId: "narrator-en-1",
    thumbnail: "/recipes/cartoon-ink-noir.jpg",
  },
  {
    slug: "cartoon-retro",
    status: "archived",
    name: "Cartoon · Retro mid-century",
    family: "cartoon",
    description:
      "1950s UPA-style limited animation: angular stylized shapes, print grain, off-register color blocks. The most recognizable and elegant signature.",
    bible: {
      artDirection:
        "Mid-century modern limited-animation cartoon style (1950s UPA look), angular stylized shapes, textured print grain, slightly off-register color blocks, elegant and graphic.",
      palette: "Strict palette: mustard yellow, charcoal, cream, and one tomato red for the lie and the stain.",
      characters: NARRATOR,
      composition:
        "One idea per shot. Flat graphic staging, subject in the upper two thirds, the lower third of the frame as a plain cream band left empty for subtitles.",
      motion:
        "Limited-animation feel: slow camera drift, one element moving per shot in a few simple steps (the stain blooms, the scissors close, the page slides). Characters hold poses. No fast motion, no cuts.",
      forbidden: FORBIDDEN_COMMON,
      negativePrompt: "text, letters, watermark, logo, photorealistic, 3d, blur, extra limbs, fast motion, flicker",
      handwrittenKeywords: false,
    },
    defaultTone: "serious",
    voiceId: "narrator-en-1",
    thumbnail: "/recipes/cartoon-retro.jpg",
  },
  {
    slug: "whiteboard-vox-collage",
    status: "archived",
    name: "Whiteboard · Vox collage",
    family: "whiteboard",
    description:
      "Documentary paper collage on cream paper: engraved archival cut-outs, halftone, torn edges, hand-drawn marker annotations. The mechanics of a lie taken apart piece by piece. Animated by the montage, not by a video model.",
    bible: {
      artDirection:
        "Paper cut-out collage explainer, documentary style, on a cream textured paper background: engraved-style illustrations (old engraving look, halftone dots), torn paper edges, soft real-paper drop shadows, hand-drawn black marker annotations (circles, arrows, underlines) pointing at what the narration explains.",
      palette: "Strict palette: cream paper, black ink, one vermilion red accent for the lie and alerts, muted teal blue for what is true. Everything else in paper greys.",
      characters:
        "No recurring narrator. Hands in engraving style may hold objects (scissors, a magnifying glass, a torn strip). The lie is an abstract element: red ink splash, torn strip, scribble.",
      composition:
        "A central cut-out subject, two or three satellite elements, one marker annotation per shot, wide margins, the lower third of the frame left empty for subtitles. Elements are designed to be animated later by the montage (they slide in, lift, overlap).",
      motion: "",
      forbidden:
        FORBIDDEN_COMMON + " Any archival page or newspaper scrap shows blurred illegible print only, never readable words.",
      negativePrompt: "",
      handwrittenKeywords: false,
    },
    defaultTone: "calm",
    voiceId: "narrator-en-1",
    thumbnail: "/recipes/whiteboard-vox-collage.jpg",
    collage: {
      backgroundCss:
        "background-color:#f3ead8;background-image:radial-gradient(circle at 20% 30%, rgba(120,90,40,0.06) 0, transparent 40%),radial-gradient(circle at 80% 70%, rgba(120,90,40,0.05) 0, transparent 45%),repeating-linear-gradient(0deg, rgba(0,0,0,0.012) 0 2px, transparent 2px 4px);",
      ink: "#1a1a1a",
      accent: "#d83b1f",
      handColor: "#d83b1f",
      captionBase: "#8a8178",
      captionActive: "#141414",
      cutoutPrompt:
        "Paper cut-out collage element, documentary explainer style: engraved-style illustration with halftone dots, torn paper edges, flat, no shadow. One isolated object centered on a plain pure white background, nothing else in the frame, no text, no letters, no people faces.",
    },
  },
  {
    slug: "whiteboard-marker",
    status: "archived",
    name: "Whiteboard · Marker board",
    family: "whiteboard",
    description:
      "A real dry-erase board: hand-drawn black marker illustrations, a few red and blue strokes, a hand holding the marker, smudges. One or two handwritten keywords per shot are allowed; sentences and subtitles stay in the packaging.",
    bible: {
      artDirection:
        "Real whiteboard explainer: a clean white dry-erase board filling the frame, hand-drawn illustrations in black marker with slightly uneven strokes, a few strokes of red and blue marker, simple iconographic drawings, small marker smudges, a human hand holding a black marker entering from a lower corner, flat photographic lighting of a real board.",
      palette: "Black marker, red marker for the lie and alerts, blue marker for what is true, white board.",
      characters:
        "No recurring narrator; the drawing hand is the only human presence. The lie is a red scribbled blot or a crossed-out shape.",
      composition:
        "Simple iconographic drawings in the upper two thirds, one arrow or circle linking them, the lower third of the board left blank for subtitles.",
      motion: "",
      forbidden:
        "No real people or faces, no logos, no flags, no gore, no caricature or stereotyped features of any group. Never draw children or minors, never a weapon or threat aimed at a human figure: vulnerable people are suggested by abstract shapes (a small flame, a seed, a sheltered circle). No sentences: at most the one or two keywords specified for the shot, handwritten in marker capitals.",
      negativePrompt: "",
      handwrittenKeywords: true,
    },
    defaultTone: "calm",
    voiceId: "narrator-en-1",
    thumbnail: "/recipes/whiteboard-marker.jpg",
    collage: {
      backgroundCss:
        "background-color:#f7f7f5;background-image:radial-gradient(circle at 50% 40%, rgba(255,255,255,0.9) 0, transparent 60%),radial-gradient(circle at 10% 90%, rgba(0,0,0,0.05) 0, transparent 40%),radial-gradient(circle at 90% 10%, rgba(0,0,0,0.04) 0, transparent 40%);",
      ink: "#151515",
      accent: "#d7262a",
      handColor: "#d7262a",
      captionBase: "#8a8a8a",
      captionActive: "#111111",
      cutoutPrompt:
        "Hand-drawn black dry-erase marker illustration with slightly uneven strokes and a few red or blue marker accents, simple iconographic drawing, flat. One isolated drawing centered on a plain pure white background, nothing else in the frame, no text, no letters, no people faces.",
    },
  },
];

export const DEFAULT_RECIPE_BY_FAMILY: Record<Family, string> = {
  cartoon: "cartoon-flat-vector",
  whiteboard: "whiteboard-vox-collage",
};

export const DEFAULT_ASPECT_RATIO: AspectRatio = "9:16";

export function getRecipe(slug: string): Recipe | undefined {
  return RECIPES.find((r) => r.slug === slug);
}

/** Archived recipes remain readable for historical jobs and explicit offline tests. */
export function activeRecipes(): Recipe[] {
  return RECIPES.filter((recipe) => recipe.status === "active");
}

export function getActiveRecipe(slug: string): Recipe | undefined {
  return activeRecipes().find((recipe) => recipe.slug === slug);
}

export class RecipeUnavailableError extends Error {
  constructor() {
    super("Video production is temporarily unavailable while the new CAM styles are prepared.");
    this.name = "RecipeUnavailableError";
  }
}

export function recipeSlugs(): string[] {
  return RECIPES.map((r) => r.slug);
}

/** Pixel canvas used by the montage per aspect ratio (720p class, matches Wan 720p output). */
export function canvasFor(aspectRatio: AspectRatio): { width: number; height: number } {
  if (aspectRatio === "16:9") return { width: 1280, height: 720 };
  if (aspectRatio === "1:1") return { width: 720, height: 720 };
  return { width: 720, height: 1280 };
}

export function aspectComposition(aspectRatio: AspectRatio): string {
  if (aspectRatio === "16:9") return "Horizontal 16:9 composition, subject in the upper two thirds, lower third left empty.";
  if (aspectRatio === "1:1") return "Square 1:1 composition, subject in the upper two thirds, lower third left empty.";
  return "Vertical 9:16 composition, subject centered in the upper two thirds, lower third of the frame left empty for subtitles.";
}

/** Composes the final image prompt: bible + scene + aspect + bans. */
export function buildImagePrompt(
  recipe: Recipe,
  scene: string,
  aspectRatio: AspectRatio,
  handwrittenKeywords?: string[],
): string {
  const b = recipe.bible;
  const keywords =
    b.handwrittenKeywords && handwrittenKeywords && handwrittenKeywords.length > 0
      ? ` The only writing on the board: the word(s) "${handwrittenKeywords.slice(0, 2).join('" and "')}" handwritten in red marker capitals.`
      : "";
  return [b.artDirection, b.palette, b.characters, scene + keywords, b.composition, aspectComposition(aspectRatio), b.forbidden]
    .filter(Boolean)
    .join(" ");
}

/** Scene used when a shot is refused twice by the image model's content checker. */
export function safeFallbackScene(recipe: Recipe): string {
  return recipe.family === "cartoon"
    ? "The recurring motif alone, no human figure: an old closed book on a plain surface, a red ink stain spreading from under its cover, soft directional light, calm and still."
    : "The recurring motif alone, no human figure: an engraved old book cut-out on the paper background, a vermilion ink stain spreading from its edge, one marker arrow pointing at the stain.";
}

/** Composes the motion prompt for image-to-video (cartoon family). */
export function buildMotionPrompt(recipe: Recipe, motion: string): string {
  return [motion, recipe.bible.motion, "Keep the exact style, palette and character design of the start frame."].filter(Boolean).join(" ");
}
