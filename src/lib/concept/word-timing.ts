import type { ConceptTiming } from "./types";

/** Repair zero-width words in imported silence-guided timing, without moving phrase boundaries.
 * The shared span is divided by token length. This is an estimate, not forced alignment.
 */
export function repairCollapsedWords(input: ConceptTiming["words"]) {
  const words = input.map((word) => ({ ...word }));
  const repairs: { index: number; word: string; oldStart: number; newStart: number }[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (word.start !== word.end) continue;
    const previous = words[i - 1];
    if (!previous || previous.end !== word.end || previous.end - previous.start < .06) throw new Error("Collapsed word cannot be repaired within its preceding spoken span.");
    const weight = (text: string) => Math.max(1, text.replace(/[^\p{L}\p{N}]/gu, "").length);
    const nextStart = Math.round((previous.start + (word.end - previous.start) * weight(previous.word) / (weight(previous.word) + weight(word.word))) * 1000) / 1000;
    repairs.push({ index: i, word: word.word, oldStart: word.start, newStart: nextStart });
    word.start = nextStart;
    previous.end = nextStart;
  }
  return { words, repairs };
}
