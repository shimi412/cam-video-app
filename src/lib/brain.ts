/**
 * Framing brain: turns a pasted script + mode into resolved production
 * parameters. In mock mode this is deterministic (zero API spend).
 * Chantier "real chat": Claude Sonnet 5 via the AI SDK plugs in behind
 * the same output shape.
 */

export type ProductionParams = {
  templateSlug: "cartoon" | "whiteboard";
  tone: "serious" | "energetic" | "calm";
  tier: "standard" | "premium";
  voiceId: string;
  language: "en";
  durationSeconds: number;
  shotSeconds: number;
  shotCount: number;
  aspectRatio: "16:9";
};

export type ScriptAnalysis = {
  wordCount: number;
  durationSeconds: number;
  educationalScore: number;
  suggestedTemplate: "cartoon" | "whiteboard";
  reason: string;
};

const NARRATION_WPM = 150;
const SHOT_SECONDS = 5;

export function analyzeScript(script: string): ScriptAnalysis {
  const words = script.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const durationSeconds = Math.max(15, Math.round((wordCount / NARRATION_WPM) * 60));

  // Educational markers push toward Whiteboard; narrative markers toward Cartoon.
  const text = script.toLowerCase();
  const eduMarkers = [
    "how", "why", "explain", "fact", "data", "number", "percent", "%",
    "history", "define", "means", "statistic", "study", "report", "according to",
  ];
  const eduHits = eduMarkers.filter((m) => text.includes(m)).length;
  const digitDensity = (script.match(/\d/g)?.length ?? 0) / Math.max(wordCount, 1);
  const educationalScore = eduHits + digitDensity * 50;

  const suggestedTemplate = educationalScore >= 4 ? "whiteboard" : "cartoon";
  const reason =
    suggestedTemplate === "whiteboard"
      ? "The script is explanatory (facts, figures, definitions): the Whiteboard model fits an educational tone best."
      : "The script is narrative-driven: the Cartoon model with characters carries it best.";

  return { wordCount, durationSeconds, educationalScore, suggestedTemplate, reason };
}

export function resolveParams(
  script: string,
  mode: "auto" | "manual",
  overrides?: Partial<Pick<ProductionParams, "templateSlug" | "tone" | "tier" | "voiceId">>,
): { analysis: ScriptAnalysis; params: ProductionParams } {
  const analysis = analyzeScript(script);
  const templateSlug =
    mode === "manual" && overrides?.templateSlug
      ? overrides.templateSlug
      : analysis.suggestedTemplate;

  const durationSeconds = Math.min(analysis.durationSeconds, 90);
  const shotCount = Math.max(3, Math.ceil(durationSeconds / SHOT_SECONDS));

  return {
    analysis,
    params: {
      templateSlug,
      tone: overrides?.tone ?? (templateSlug === "whiteboard" ? "calm" : "energetic"),
      tier: overrides?.tier ?? "standard",
      voiceId: overrides?.voiceId ?? "narrator-en-1",
      language: "en",
      durationSeconds,
      shotSeconds: SHOT_SECONDS,
      shotCount,
      aspectRatio: "16:9",
    },
  };
}

/** Splits the script into one narration segment per shot, for storyboard + TTS. */
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
