/**
 * Director brain: writes the storyboard, shot by shot, from the script and the
 * recipe's style bible. This is where the quality of the final video is
 * decided: the script stays verbatim, the visuals are staged like a director.
 *
 * Output per shot: the exact narration segment, a scene description (what is
 * in the frame), a motion description (what moves, how the camera behaves),
 * and optional handwritten keywords for recipes that allow them.
 */
import { z } from "zod";
import { normalizeWords, splitScript, type ProductionParams } from "./brain";
import { requestBrainObject } from "./providers/brain";
import type { Recipe } from "./recipes";

export type Shot = {
  index: number;
  narration: string;
  scene: string;
  motion: string;
  handwrittenKeywords?: string[];
};

export type Storyboard = {
  shots: Shot[];
  characterNotes: string;
  brain: "api" | "fallback";
};

const StoryboardSchema = z.object({
  characterNotes: z
    .string()
    .describe("Fixed description of the recurring character(s) and recurring props, repeated implicitly in every shot. Empty string if the recipe has no recurring character."),
  shots: z
    .array(
      z.object({
        narration: z.string().describe("Verbatim segment of the script, in order, nothing added or removed."),
        scene: z
          .string()
          .describe("What is in the frame: staging, subject, visual metaphor, foreground/background. Concrete and filmable. 40-90 words. No style words (the style is fixed by the bible), no text in the image."),
        motion: z
          .string()
          .describe("What moves during the shot and how the camera behaves. One sentence. For whiteboard recipes: how the elements should be revealed by the montage."),
        handwrittenKeywords: z
          .array(z.string())
          .max(2)
          .optional()
          .describe("Only for recipes that allow handwritten keywords: 1-2 single words to write in marker. Otherwise omit."),
      }),
    )
    .min(2),
});

function systemPrompt(recipe: Recipe, params: ProductionParams): string {
  const b = recipe.bible;
  return `You are the director of short social videos for a non-profit that debunks disinformation and antisemitic tropes. You turn a script into a storyboard for the "${recipe.name}" video model. You never change the script: the narration must be reproduced verbatim, in order, split into shots.

STYLE BIBLE (fixed, you stage inside it):
- Art direction: ${b.artDirection}
- Palette: ${b.palette}
- Characters and how the lie is represented: ${b.characters || "No recurring character."}
- Composition: ${b.composition}
${b.motion ? `- Motion: ${b.motion}` : "- Motion: elements are revealed by the montage (slide in, draw on, lift); no generative video."}
- Hard bans: ${b.forbidden}
${b.handwrittenKeywords ? "- Handwritten keywords: allowed, 1-2 single words per shot, only when they carry the idea." : "- No handwritten words: never suggest writing in the image."}

DIRECTING RULES:
- One idea per shot. Use a concrete visual metaphor only if it makes the narration immediately clearer. When the connection is forced or abstract, stage the recurring presenter with space above for locally composed keywords. Never depict an accusation as true or stereotype a group. Never force an analogy for every sentence.
- Target ${params.shotCount} shots (between ${Math.max(2, params.shotCount - 2)} and ${params.shotCount + 2}). Each narration segment is 5 to 12 words (hard maximum 13) so that it lasts 2 to 4.5 seconds when spoken; split long sentences at natural breaths. Short segments are better than long ones.
- The first shot is the hook: the strongest, most intriguing image.
- Keep visual continuity: same character design, same recurring props, the stain/lie motif evolves shot after shot instead of being reinvented.
- Tone: ${params.tone}. Format: ${params.aspectRatio}.
- Scenes and motions are written in English for an image model: concrete nouns, spatial positions, light, no abstract adjectives, no style words, no text in the image.

SAFETY FOR IMAGE MODELS (a refused prompt breaks the shot):
- Scene descriptions never contain the words child, children, kid, minor, baby, nor any sexual, medical or anatomical term, nor blood, corpse, weapon, kill, murder, massacre, nor the name of any ethnic or religious group.
- No human figure is ever harmed, threatened, attacked or targeted in the image. Threat and harm are shown only against abstract shapes (a flame, a seed, a lamp, a sheltered circle, an old page).
- The narration keeps the script's words; only the image is abstracted.`;
}

function fallbackStoryboard(script: string, params: ProductionParams): Storyboard {
  const segments = splitScript(script, params.shotCount);
  return {
    brain: "fallback",
    characterNotes: "",
    shots: segments.map((narration, index) => ({
      index,
      narration,
      scene: `A single clear visual metaphor illustrating: "${narration.replace(/[.!?]\s*$/, "")}".`,
      motion: "Slow push-in, one element moving gently.",
    })),
  };
}

const SanitizedSchema = z.object({ scene: z.string() });

/**
 * Rewrites a scene refused by the image model's content checker: removes any
 * human figure, any sensitive word, keeps the recurring motif and the idea.
 */
export async function sanitizeScene(scene: string, recipe: Recipe): Promise<string | null> {
  try {
    const object = await requestBrainObject({
      schema: SanitizedSchema,
      system: `You rewrite scene descriptions for an image model whose content checker refused them. Keep the idea and the recurring motif (${recipe.bible.characters || "the lie as an abstract red stain"}), remove every human or child figure, every threat aimed at a figure, every sensitive word (children, sexual, blood, weapon, kill, ethnic or religious names). Use only abstract objects: old pages, books, scissors, stains, shapes, light. 40-80 words, concrete and filmable, no style words, no text in the image.`,
      prompt: `Refused scene:
"""
${scene}
"""
Rewrite it.`,
      maxRetries: 1,
    });
    return object?.scene.trim() ?? null;
  } catch (err) {
    console.error("[director] sanitizeScene failed:", err);
    return null;
  }
}

export async function directStoryboard(
  script: string,
  recipe: Recipe,
  params: ProductionParams,
): Promise<Storyboard> {

  try {
    const object = await requestBrainObject({
      schema: StoryboardSchema,
      system: systemPrompt(recipe, params),
      prompt: `SCRIPT (reproduce verbatim across the shots):\n"""\n${script}\n"""`,
      maxRetries: 2,
    });

    if (!object) return fallbackStoryboard(script, params);

    let shots: Shot[] = object.shots.map((s, index) => ({
      index,
      narration: s.narration.trim(),
      scene: s.scene.trim(),
      motion: s.motion.trim(),
      handwrittenKeywords: recipe.bible.handwrittenKeywords ? s.handwrittenKeywords : undefined,
    }));

    // The voice-over must say exactly the script: if the LLM drifted, keep its
    // scenes but re-cut the narration deterministically into the same count.
    const joined = normalizeWords(shots.map((s) => s.narration).join(" "));
    if (joined !== normalizeWords(script)) {
      const segments = splitScript(script, shots.length);
      shots = segments.map((narration, index) => ({
        ...(shots[Math.min(index, shots.length - 1)] ?? shots[0]),
        index,
        narration,
      }));
    }

    return { shots, characterNotes: object.characterNotes.trim(), brain: "api" };
  } catch (err) {
    console.error("[director] storyboard failed, using fallback:", err);
    return fallbackStoryboard(script, params);
  }
}
