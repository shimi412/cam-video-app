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
  source: z.enum(["fal-whisper", "reviewed-word-timings", "simulation-fixture"]),
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

/** Match every token to the exact audio hash and script. Punctuation/case can
 * differ in the transcript; captions retain the original script verbatim.
 * A transcript is timing evidence, not proof the speaker is Bram or an approval.
 */
export function alignVoice(phrases: string[], audio: AudioAsset, value: unknown, mode: "simulation" | "live"): ConceptTiming {
  const alignment = AlignmentSchema.parse(value);
  if (alignment.audioSha256 !== audio.sha256 || alignment.scriptSha256 !== scriptHash(phrases)) throw new Error("Alignment belongs to a different recording or script.");
  if (mode === "live" && alignment.source === "simulation-fixture") throw new Error("Simulated timestamps cannot align a final voice.");
  const originals = phrases.flatMap((p) => p.trim().split(/\s+/));
  if (originals.length !== alignment.words.length) throw new Error("Transcript omits or adds words. Review the reading.");
  for (const [i, word] of alignment.words.entries()) {
    if (normalizedText(word.word) !== normalizedText(originals[i]) || !normalizedText(word.word)) throw new Error(`Transcript differs at word ${i + 1}. Review the reading.`);
    if (word.end <= word.start || word.end > audio.duration || (i > 0 && word.start < alignment.words[i - 1].end)) throw new Error("Word timestamps overlap or exceed the audio.");
  }
  const words = alignment.words.map((w, i) => ({ ...w, word: originals[i] }));
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
