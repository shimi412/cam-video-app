import type { ConceptTiming } from "./types";
import { estimatedSpeechSeconds, normalizedText } from "./text";

const round = (n: number) => Math.round(n * 1000) / 1000;
export function placeholderTiming(phrases: string[]): ConceptTiming {
  return measuredPhraseTiming(phrases, phrases.map(estimatedSpeechSeconds));
}

/** Scene boundaries follow measured audio. Word positions remain explicit estimates. */
export function measuredPhraseTiming(phrases: string[], durations: number[]): ConceptTiming {
  if (durations.length !== phrases.length || durations.some((d) => !Number.isFinite(d) || d <= 0)) throw new Error("Missing measured phrase durations");
  let cursor = 0.4;
  const words: ConceptTiming["words"] = [];
  const timedPhrases = phrases.map((text, i) => {
    const tokens = text.split(/\s+/);
    const duration = durations[i];
    const start = cursor;
    const weights = tokens.map((w) => normalizedText(w).length + 2);
    const total = weights.reduce((a, b) => a + b, 0);
    tokens.forEach((word, j) => {
      const end = cursor + duration * weights[j] / total;
      words.push({ word, start: round(cursor), end: round(end) });
      cursor = end;
    });
    const end = cursor;
    cursor += 0.35;
    return { phrase: i + 1, text, start: round(start), end: round(end) };
  });
  return { estimated: true, duration: round(cursor + 0.65), words, phrases: timedPhrases };
}

/** Parse real silence boundaries without assuming the file starts in speech. */
export function speechSegments(log: string, duration: number): [number, number][] {
  const events = [...log.matchAll(/silence_(start|end):\s*([\d.]+)/g)];
  const segments: [number, number][] = [];
  let start = 0;
  for (const event of events) {
    const at = Math.min(duration, Number(event[2]));
    if (event[1] === "start" && at > start + 0.01) segments.push([start, at]);
    if (event[1] === "start") start = duration;
    else start = at;
  }
  if (start < duration - 0.01) segments.push([start, duration]);
  return segments;
}

/** A cut is only legal inside measured silence, never in the middle of a spoken word. */
export function breathingCuts(timing: ConceptTiming, speech: [number, number][], pause = 0.35) {
  const gaps = speech.slice(0, -1).map((s, i) => [s[1], speech[i + 1][0]] as const).filter(([a, b]) => b - a >= 0.08);
  const used = new Set<number>();
  return timing.phrases.slice(1).flatMap((p, i) => {
    const previous = timing.phrases[i];
    const index = gaps.findIndex(([a, b], j) => !used.has(j) && a >= previous.end - 0.05 && b <= p.start + 0.05);
    if (index < 0) return [];
    used.add(index);
    return [{ at: round((gaps[index][0] + gaps[index][1]) / 2), seconds: pause }];
  });
}

export function shiftTiming(timing: ConceptTiming, cuts: { at: number; seconds: number }[]): ConceptTiming {
  const shift = (t: number) => round(t + cuts.filter((c) => c.at <= t).reduce((sum, c) => sum + c.seconds, 0));
  return { ...timing, duration: shift(timing.duration), words: timing.words.map((w) => ({ ...w, start: shift(w.start), end: shift(w.end) })), phrases: timing.phrases.map((p) => ({ ...p, start: shift(p.start), end: shift(p.end) })) };
}
