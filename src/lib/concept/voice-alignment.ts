import { readFileSync } from "node:fs";
import { z } from "zod";
import { Hash, sha256 } from "./checkpoints";
import { CAM_VOICE } from "./cam-voice";
import { normalizedText } from "./text";
import type { ConceptTiming } from "./types";
import type { AudioAsset } from "./media-transfers";

const Word = z.object({ text: z.string().min(1), timestamp: z.tuple([z.number().nonnegative(), z.number().positive()]) });
const Whisper = z.object({ text: z.string().min(1), chunks: z.array(Word).min(1) });
export const AlignmentSchema = z.object({
  version: z.literal(1), audioSha256: Hash, scriptSha256: Hash,
  voiceId: z.literal(CAM_VOICE.voiceId), requestId: z.string().min(1),
  source: z.enum(["fal-whisper", "local-whisper", "reviewed-word-timings", "simulation-fixture"]),
  words: z.array(z.object({ word: z.string().min(1), start: z.number().nonnegative(), end: z.number().positive() })).min(1),
});
export type VoiceAlignment = z.infer<typeof AlignmentSchema>;
export const alignmentHash = (alignment: VoiceAlignment) => sha256(JSON.stringify(AlignmentSchema.parse(alignment)));
export const scriptHash = (phrases: string[]) => sha256(JSON.stringify(phrases));

/** Adapt word-level Whisper output. Sentence/segment chunks cannot masquerade
 * as word timing. There is no guessed interpolation or dropped transcript word.
 */
export function whisperAlignment(result: unknown, context: Omit<VoiceAlignment, "version" | "words">): VoiceAlignment {
  const data = Whisper.parse(result);
  if (normalizedText(data.text) !== normalizedText(data.chunks.map((c) => c.text).join(" "))) throw new Error("Transcript text and word chunks disagree.");
  for (const chunk of data.chunks) if (chunk.text.trim().split(/\s+/).length !== 1) throw new Error("Word-level timestamps are required.");
  return AlignmentSchema.parse({ version: 1, ...context, words: data.chunks.map((c) => ({ word: c.text.trim(), start: c.timestamp[0], end: c.timestamp[1] })) });
}

// Explicit spelling equivalents only. Never use fuzzy matching for spoken words.
const spokenToken = (word:string) => {
  const token=normalizedText(word);
  if (token === "long standing") return "longstanding";
  if (token === "anti semitic") return "antisemitic";
  return token === "defence" ? "defense" : token;
};
export class TranscriptMismatchError extends Error {}

/** Join only explicit hyphen continuations, never arbitrary neighboring words.
 * Keep the measured outer boundaries. Validate raw timestamps before joining.
 */
function compoundWords(words: VoiceAlignment["words"]) {
  const joined: VoiceAlignment["words"] = [];
  for (const word of words) {
    const previous = joined.at(-1);
    if (previous && /^[-‐‑]\p{L}/u.test(word.word)) {
      previous.word += word.word.replace(/^[-‐‑]/u, "-");
      previous.end = word.end;
    } else joined.push({ ...word });
  }
  return joined;
}

/** A script word the recogniser split into adjacent tokens whose letters, concatenated, equal that word
 * exactly ("Gaza" + "lighting." for "Gazalighting", live Clay 2026-10-23) is one word: its timing spans the
 * tokens. This is a letter-for-letter equality, never a fuzzy match; any other difference still stops. */
let dictionary: Set<string> | null | undefined;
/** The system word list (macOS and Linux ship /usr/share/dict/words). A script word found in it ("nowhere")
 * is never assembled from neighbours ("now" + "here"); without a word list no join happens at all. */
function knownWord(word: string) {
  if (dictionary === undefined) { try { dictionary = new Set(readFileSync("/usr/share/dict/words", "utf8").split("\n").map((w: string) => w.toLowerCase())); } catch { dictionary = null; } }
  return dictionary ? dictionary.has(word) : true;
}
export function joinSplitScriptWords(words: VoiceAlignment["words"], originals: string[]) {
  const letters = (w: string) => spokenToken(w).replace(/\s+/g, "");
  const joined: VoiceAlignment["words"] = [];
  let i = 0;
  for (const original of originals) {
    const word = words[i]; if (!word) break;
    if (letters(word.word) === letters(original) || knownWord(letters(original))) { joined.push({ ...word }); i += 1; continue; }
    let merged = "", end = i;
    while (end < words.length && end - i < 4 && letters(original).startsWith(merged + letters(words[end].word))) { merged += letters(words[end].word); end += 1; if (merged === letters(original)) break; }
    if (merged === letters(original) && end - i > 1) { joined.push({ word: original, start: words[i].start, end: words[end - 1].end }); i = end; }
    else { joined.push({ ...word }); i += 1; }
  }
  return [...joined, ...words.slice(i).map((w) => ({ ...w }))];
}

/** Match every token to the exact audio hash and script. Punctuation/case can
 * differ in the transcript; captions retain the original script verbatim.
 * A transcript is timing evidence, not proof the speaker is Bram or an approval.
 */
export function alignVoice(phrases: string[], audio: AudioAsset, value: unknown, mode: "simulation" | "live"): ConceptTiming {
  const alignment = AlignmentSchema.parse(value);
  if (alignment.audioSha256 !== audio.sha256 || alignment.scriptSha256 !== scriptHash(phrases)) throw new Error("Alignment belongs to a different recording or script.");
  if (mode === "live" && alignment.source === "simulation-fixture") throw new Error("Simulated timestamps cannot align a final voice.");
  const originals = phrases.flatMap((p) => p.trim().split(/\s+/));
  for (const [i, word] of alignment.words.entries()) {
    if (word.end < word.start || word.end > audio.duration || (i > 0 && word.start < alignment.words[i - 1].end)) throw new Error("Word timestamps overlap or exceed the audio.");
  }
  const measured = joinSplitScriptWords(compoundWords(alignment.words), originals);
  if (originals.length !== measured.length) throw new TranscriptMismatchError("Transcript omits or adds words. Review the reading.");
  for (const [i, word] of measured.entries()) {
    if (spokenToken(word.word) !== spokenToken(originals[i]) || !normalizedText(word.word)) throw new TranscriptMismatchError(`Transcript differs at word ${i + 1}. Review the reading.`);
  }
  // Whisper can return an instantaneous anchor for a short interior word.
  // Preserve that evidence verbatim; never invent a duration or drop the word.
  let phraseOffset = 0;
  for (const phrase of phrases) {
    const count = phrase.trim().split(/\s+/).length;
    const group = measured.slice(phraseOffset, phraseOffset + count);
    for (let i = 0; i < group.length; i++) {
      if (group[i].start !== group[i].end) continue;
      if (!["fal-whisper", "local-whisper"].includes(alignment.source) || i === 0 || i === group.length - 1 || group[i-1].start === group[i-1].end || group[i+1].start === group[i+1].end)
        throw new Error("An isolated word timestamp needs a surrounding spoken phrase.");
    }
    phraseOffset += count;
  }
  const words = measured.map((w, i) => ({ ...w, word: originals[i] }));
  let offset = 0;
  const timed = phrases.map((text, i) => {
    const count = text.trim().split(/\s+/).length;
    const start = words[offset].start, end = words[offset + count - 1].end;
    offset += count;
    return { phrase: i + 1, text, start, end };
  });
  return { duration: audio.duration, estimated: alignment.source === "simulation-fixture", words, phrases: timed };
}

export type VoiceApproval = { audioSha256: string; alignmentSha256: string; scriptSha256: string; voiceId: string; mode: "simulation" | "live"; approved: boolean };
export function approveAlignedVoice(phrases: string[], audio: AudioAsset, alignment: VoiceAlignment, approval: VoiceApproval, mode: "simulation" | "live") {
  const timing = alignVoice(phrases, audio, alignment, mode);
  if (!approval.approved || approval.mode !== mode || approval.voiceId !== CAM_VOICE.voiceId || approval.audioSha256 !== audio.sha256 || approval.scriptSha256 !== scriptHash(phrases) || approval.alignmentSha256 !== alignmentHash(alignment)) throw new Error("Voice approval does not cover this recording and alignment.");
  return timing;
}
