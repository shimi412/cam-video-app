/**
 * Collage score: the director writes, per sentence, a sequence of visual
 * events anchored on words (the grammar validated with Shimon on 2026-08-20,
 * decomposed from Johnny Harris / Vox): every concrete noun gets its cut-out
 * the moment it is said, annotations are drawn live on key words, 1-3
 * handwritten keywords per sentence, 3-5 events per sentence, never more than
 * ~1.5 s without a visual change, elements reused across sentences.
 */
import { generateObject } from "ai";
import { z } from "zod";
import { normalizeWords, splitScript, type ProductionParams } from "../brain";
import { getAnthropicModel } from "../brain-llm";
import type { Recipe } from "../recipes";

export const SLOTS = ["top", "center", "left", "right", "top-left", "top-right"] as const;
export type Slot = (typeof SLOTS)[number];
export const SIZES = ["s", "m", "l"] as const;
export type Size = (typeof SIZES)[number];
export const ENTERS = ["stamp", "slide-left", "slide-right", "drop", "pop", "rise"] as const;
export type Enter = (typeof ENTERS)[number];
export const ANNOTATIONS = ["circle", "cross", "underline", "arrow"] as const;
export type Annotation = (typeof ANNOTATIONS)[number];

const EventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("cutout"),
    at: z.string().describe("The word of the narration that triggers the event (exact word, first occurrence after the previous event)."),
    key: z.string().describe("Element key from the elements library."),
    slot: z.enum(SLOTS),
    size: z.enum(SIZES),
    enter: z.enum(ENTERS),
    impact: z.boolean().optional().describe("True for a hard landing (camera shake)."),
  }),
  z.object({
    kind: z.literal("word"),
    at: z.string(),
    text: z.string().describe("1-3 words handwritten on screen, UPPERCASE, e.g. LIE, 1,500 YEARS."),
    near: z.string().optional().describe("Element key to write next to; omit for a free position."),
    slot: z.enum(SLOTS).optional(),
  }),
  z.object({
    kind: z.literal("annotate"),
    at: z.string(),
    type: z.enum(ANNOTATIONS),
    target: z.string().describe("Element key annotated."),
    from: z.string().optional().describe("For arrows: the source element key."),
  }),
]);

export const ScoreSchema = z.object({
  elements: z
    .array(
      z.object({
        key: z.string().describe("short-kebab-key, unique, reused across sentences when the same object returns"),
        prompt: z
          .string()
          .describe("What the single isolated object is (25-60 words): subject, view angle, distinctive details. No style words (style is fixed), no background, no text."),
      }),
    )
    .min(3)
    .max(40),
  shots: z
    .array(
      z.object({
        narration: z.string().describe("Verbatim segment of the script, in order, nothing added or removed. 5-14 words."),
        events: z.array(EventSchema).min(2).max(6),
      }),
    )
    .min(2),
});

export type ScoreEvent = z.infer<typeof EventSchema>;
export type ShotScore = { index: number; narration: string; events: ScoreEvent[] };
export type Score = {
  elements: Array<{ key: string; prompt: string }>;
  shots: ShotScore[];
  brain: "api" | "fallback";
};

function systemPrompt(recipe: Recipe, params: ProductionParams): string {
  const b = recipe.bible;
  return `You are the director and motion designer of short social videos for a non-profit that debunks disinformation and antisemitic tropes. You turn a script into a COLLAGE SCORE for the "${recipe.name}" video model: the narration is reproduced verbatim, split into sentences (shots), and each shot is a sequence of visual events anchored on the words of the narration. The montage engine places cut-out elements on a paper/board background, draws marker annotations live, writes handwritten keywords, and moves the camera.

STYLE BIBLE (fixed):
- Art direction: ${b.artDirection}
- Palette: ${b.palette}
- Characters and how the lie is represented: ${b.characters}
- Hard bans: ${b.forbidden}

THE GRAMMAR (observed in the best collage explainers):
- Every concrete noun or claim in the narration gets a visual "evidence" element the moment it is said (a book, a torn page, a social post card, scissors, an old newspaper, a map, a timeline, a megaphone, a magnifying glass, a stamp, a seal...). Abstract ideas get a metaphor object.
- 3 to 5 events per sentence. The first event is a cut-out and fires on the FIRST word of the sentence. Never more than 1.5 s without a new event: a sentence of 12 words has 4-5 events.
- Annotations and handwritten words only target elements placed earlier IN THE SAME sentence (each sentence starts on a clean board; re-place a returning element with a new cutout event before annotating it).
- Annotations are drawn live on key words: circle the thing named, cross the lie, underline a number, arrow from cause to effect.
- 1 to 3 handwritten keywords per sentence, UPPERCASE, short (LIE, TALMUD, 1,500 YEARS, BLOOD LIBEL, EXPOSE IT), placed near the element they qualify.
- Reuse elements: define each object once in the elements library and call it again by key when it returns (the book, the red strip, the post card come back through the video). 12-25 elements for a 60 s video.
- Layout: slots are "top" (wide, upper area), "center", "left", "right" (middle band), "top-left", "top-right". Each sentence starts on a clean board, so plan 2-4 cut-outs per sentence in distinct slots (never two cut-outs in the same slot in one sentence). Size "l" for the hero element, "m" for supporting, "s" for small props.
- Entrances: "stamp" (hard stamp from above, default for cards/documents), "slide-left" / "slide-right" (objects entering from the sides), "drop" (falls and lands, mark impact:true for a shake), "pop" (appears with a bounce, for small props and reactions), "rise" (comes up from below).
- The lie is always shown as an abstract red element (torn red strip, red stamp, red scribble, red ink), never as a depiction of the accusation, never as people. Never depict children or minors, never a threat aimed at a human figure. The vulnerable are abstract shapes (a small flame, a seed, a sheltered circle).
- Elements prompts describe one isolated object only, no background, no text, no people faces; archival things (newspapers, documents) have blurred illegible print.

OUTPUT: the elements library (key + object description) and the shots (verbatim narration + events). Target ${params.shotCount} shots (±3), each 5 to 14 words. Tone: ${params.tone}. Format: ${params.aspectRatio}.`;
}

function fallbackScore(script: string, params: ProductionParams): Score {
  const segments = splitScript(script, params.shotCount);
  return {
    brain: "fallback",
    elements: [
      { key: "book", prompt: "A thick ancient closed legal book with an ornate cover, three-quarter view" },
      { key: "red-strip", prompt: "A long torn strip of red paper with jagged edges, slightly diagonal" },
      { key: "post-card", prompt: "A blank social media post card: rounded rectangle, round avatar placeholder, three blurred grey text lines, small heart and share icons" },
    ],
    shots: segments.map((narration, index) => {
      const words = narration.split(/\s+/);
      return {
        index,
        narration,
        events: [
          { kind: "cutout", at: words[0], key: index % 2 === 0 ? "book" : "post-card", slot: "center", size: "l", enter: "stamp" },
          { kind: "cutout", at: words[Math.floor(words.length / 2)] ?? words[0], key: "red-strip", slot: "right", size: "m", enter: "drop", impact: true },
          { kind: "annotate", at: words[words.length - 1], type: "cross", target: index % 2 === 0 ? "book" : "post-card" },
        ],
      };
    }),
  };
}

export async function directScore(script: string, recipe: Recipe, params: ProductionParams): Promise<Score> {
  const model = getAnthropicModel();
  if (!model) return fallbackScore(script, params);
  try {
    const { object } = await generateObject({
      model: await model(),
      schema: ScoreSchema,
      system: systemPrompt(recipe, params),
      prompt: `SCRIPT (reproduce verbatim across the shots):\n"""\n${script}\n"""`,
      maxRetries: 2,
    });
    let shots: ShotScore[] = object.shots.map((s, index) => ({ index, narration: s.narration.trim(), events: s.events }));
    // The voice must say exactly the script: if the LLM drifted, re-cut the narration into the same count.
    const joined = normalizeWords(shots.map((s) => s.narration).join(" "));
    if (joined !== normalizeWords(script)) {
      const segments = splitScript(script, shots.length);
      shots = segments.map((narration, index) => ({ ...(shots[Math.min(index, shots.length - 1)] ?? shots[0]), index, narration }));
    }
    // Drop events that reference unknown elements.
    const keys = new Set(object.elements.map((e) => e.key));
    for (const s of shots) {
      s.events = s.events.filter((e) =>
        e.kind === "cutout" ? keys.has(e.key) : e.kind === "annotate" ? keys.has(e.target) && (!e.from || keys.has(e.from)) : true,
      );
    }
    return { elements: object.elements, shots, brain: "api" };
  } catch (err) {
    console.error("[score] collage score failed, using fallback:", err);
    return fallbackScore(script, params);
  }
}
