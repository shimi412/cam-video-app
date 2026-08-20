/**
 * Framing brain: turns a pasted script + mode into resolved production
 * parameters. Deterministic part (zero API spend); the LLM framing in
 * brain-llm.ts plugs in behind the same output shape.
 */
import {
  DEFAULT_ASPECT_RATIO,
  DEFAULT_RECIPE_BY_FAMILY,
  getRecipe,
  type AspectRatio,
  type Family,
  type Tone,
} from "./recipes";

export type ProductionParams = {
  templateSlug: string;
  family: Family;
  tone: Tone;
  tier: "standard" | "premium";
  voiceId: string;
  language: "en";
  aspectRatio: AspectRatio;
  /** Estimated narration duration (the real one comes from the generated voice). */
  durationSeconds: number;
  /** Estimated number of shots; the storyboard may adjust slightly. */
  shotCount: number;
  /** Nominal clip length sent to video models (5 or 10 s). */
  shotSeconds: number;
  wordCount: number;
  characterCount: number;
};

export type Overrides = Partial<
  Pick<ProductionParams, "templateSlug" | "tone" | "tier" | "voiceId" | "aspectRatio">
>;

export type ScriptAnalysis = {
  wordCount: number;
  durationSeconds: number;
  educationalScore: number;
  suggestedFamily: Family;
  suggestedTemplate: string;
  reason: string;
};

const NARRATION_WPM = 150;
/** ~11 words per shot ≈ 4.4 s of narration: fits a 5 s clip, keeps social rhythm. */
const WORDS_PER_SHOT = 11;
export const SHOT_SECONDS = 5;

export function analyzeScript(script: string): ScriptAnalysis {
  const words = script.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const durationSeconds = Math.max(10, Math.round((wordCount / NARRATION_WPM) * 60));

  // Educational markers push toward Whiteboard; narrative markers toward Cartoon.
  const text = script.toLowerCase();
  const eduMarkers = [
    "how", "why", "explain", "fact", "data", "number", "percent", "%",
    "history", "define", "means", "statistic", "study", "report", "according to",
  ];
  const eduHits = eduMarkers.filter((m) => text.includes(m)).length;
  const digitDensity = (script.match(/\d/g)?.length ?? 0) / Math.max(wordCount, 1);
  const educationalScore = eduHits + digitDensity * 50;

  const suggestedFamily: Family = educationalScore >= 4 ? "whiteboard" : "cartoon";
  const suggestedTemplate = DEFAULT_RECIPE_BY_FAMILY[suggestedFamily];
  const reason =
    suggestedFamily === "whiteboard"
      ? "The script is explanatory (facts, figures, definitions): a Whiteboard model fits an educational tone best."
      : "The script is narrative-driven: a Cartoon model with a narrator carries it best.";

  return { wordCount, durationSeconds, educationalScore, suggestedFamily, suggestedTemplate, reason };
}

export function resolveParams(
  script: string,
  mode: "auto" | "manual",
  overrides?: Overrides,
): { analysis: ScriptAnalysis; params: ProductionParams } {
  const analysis = analyzeScript(script);
  const requested = overrides?.templateSlug && getRecipe(overrides.templateSlug) ? overrides.templateSlug : undefined;
  const templateSlug = requested ?? analysis.suggestedTemplate;
  const recipe = getRecipe(templateSlug)!;

  const shotCount = Math.min(24, Math.max(3, Math.ceil(analysis.wordCount / WORDS_PER_SHOT)));

  return {
    analysis,
    params: {
      templateSlug,
      family: recipe.family,
      tone: overrides?.tone ?? recipe.defaultTone,
      tier: overrides?.tier ?? "standard",
      voiceId: overrides?.voiceId ?? recipe.voiceId,
      language: "en",
      aspectRatio: overrides?.aspectRatio ?? DEFAULT_ASPECT_RATIO,
      durationSeconds: analysis.durationSeconds,
      shotCount,
      shotSeconds: SHOT_SECONDS,
      wordCount: analysis.wordCount,
      characterCount: script.length,
    },
  };
}

/** Splits the script into one narration segment per shot (deterministic fallback). */
export function splitScript(script: string, shotCount: number): string[] {
  const sentences = script
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  if (sentences.length <= shotCount) return sentences;
  const perShot = Math.ceil(sentences.length / shotCount);
  const segments: string[] = [];
  for (let i = 0; i < sentences.length; i += perShot) {
    segments.push(sentences.slice(i, i + perShot).join(" "));
  }
  return segments;
}

/** Normalizes text for "same words" comparisons (storyboard narration vs script). */
export function normalizeWords(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim();
}
