import { z } from "zod";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { ProductionParams } from "../brain";
import { Hash, sha256 } from "./checkpoints";
import { normalizeAudio, type AudioAsset } from "./media-transfers";
import { alignVoice, AlignmentSchema, alignmentHash, scriptHash } from "./voice-alignment";
import { CAM_VOICE } from "./cam-voice";
import { VisualDecisionSchema, visualReview } from "./visual-review";

export const NarrationSchema = z.object({
  id: z.uuid(), audio: z.object({ kind: z.literal("audio"), file: z.literal("narration.wav"), sha256: Hash, sourceSha256: Hash, duration: z.number().positive() }).strict(),
  speaker: z.enum(["bram", "test", "other"]), sourceNote: z.string().trim().min(1).max(500),
  alignment: AlignmentSchema.optional(), reviews: z.array(VisualDecisionSchema).max(500),
}).strict();
export type Narration = z.infer<typeof NarrationSchema>;
export const WordTimings = z.object({ audioSha256: Hash, scriptSha256: Hash,
  words: z.array(z.object({ word: z.string().trim().min(1).max(200), start: z.number().nonnegative(), end: z.number().positive() }).strict()).min(1).max(3000),
}).strict();
export function narrationDirectory(jobId: string, id: string) {
  return path.join(process.cwd(), "storage/narration", z.uuid().parse(jobId), z.uuid().parse(id));
}
export async function importNarration(jobId: string, bytes: Buffer, speaker: Narration["speaker"], sourceNote: string): Promise<Narration> {
  const id = randomUUID(), directory = narrationDirectory(jobId, id);
  await mkdir(directory, { recursive: true });
  try { return NarrationSchema.parse({ id, speaker, sourceNote, audio: await normalizeAudio(bytes, directory), reviews: [] }); }
  catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}
export async function verifyNarration(jobId: string, value: Narration) {
  const narration = NarrationSchema.parse(value), file = path.join(narrationDirectory(jobId, narration.id), "narration.wav");
  if (sha256(await readFile(file)) !== narration.audio.sha256) throw new Error("The imported recording is missing or changed. Import it again.");
  return { file, narration };
}
export function narrationTarget(jobId: string, phrases: string[], value: Narration) {
  const narration = NarrationSchema.parse(value);
  return sha256(JSON.stringify({ version: 1, jobId, script: scriptHash(phrases), id: narration.id, audio: narration.audio,
    speaker: narration.speaker, sourceNote: narration.sourceNote, alignment: narration.alignment ? alignmentHash(narration.alignment) : null }));
}
export function withWordTimings(narration: Narration, phrases: string[], input: unknown): Narration {
  const parsed = WordTimings.parse(input);
  const alignment = AlignmentSchema.parse({ version: 1, ...parsed, voiceId: CAM_VOICE.voiceId,
    requestId: `local-import:${narration.id}`, source: "reviewed-word-timings" });
  alignVoice(phrases, narration.audio, alignment, "simulation");
  return { ...narration, alignment };
}
export function reviewNarration(jobId: string, phrases: string[], narration: Narration, action: { target: string; decision: "approved" | "rejected"; note: string; listened: boolean; checkedWords: boolean }) {
  const target = narrationTarget(jobId, phrases, narration);
  if (action.target !== target) throw new Error("The recording or timings changed. Reload before reviewing.");
  if (action.decision === "approved") {
    if (!action.listened || !action.checkedWords || !narration.alignment) throw new Error("Listen to the recording and check all word timings before approving.");
    alignVoice(phrases, narration.audio, narration.alignment, "simulation");
  } else if (!action.note.trim()) throw new Error("Add a reason for rejecting the recording.");
  const previous = narration.reviews.at(-1);
  if (previous?.target === target && previous.decision === action.decision && previous.note === action.note) return narration;
  if (narration.reviews.length >= 500) throw new Error("Voice review history is full.");
  return { ...narration, reviews: [...narration.reviews, { id: randomUUID(), target, decision: action.decision, note: action.note, reviewedAt: new Date().toISOString() }] };
}
export async function selectedNarration(jobId: string, phrases: string[], params: ProductionParams) {
  if (!params.useImportedNarration) return null;
  if (!params.narration?.alignment) throw new Error("Import and review the recording and word timings first.");
  const verified = await verifyNarration(jobId, params.narration), narration = verified.narration;
  const target = narrationTarget(jobId, phrases, narration);
  if (visualReview(target, narration.reviews).status !== "approved") throw new Error("The selected recording needs review again.");
  const timing = alignVoice(phrases, narration.audio, narration.alignment, "simulation");
  return { ...verified, timing, target, alignment: narration.alignment!, audio: narration.audio as AudioAsset,
    evidence: { audioSha256: narration.audio.sha256, alignmentSha256: alignmentHash(narration.alignment!), source: "reviewed" as const } };
}
export async function narrationView(jobId: string, phrases: string[], params: ProductionParams) {
  if (!params.narration) return null;
  const narration = NarrationSchema.parse(params.narration), target = narrationTarget(jobId, phrases, narration);
  let issue: string | null = null;
  try { await verifyNarration(jobId, narration); if (narration.alignment) alignVoice(phrases, narration.audio, narration.alignment, "simulation"); }
  catch { issue = "The recording or its timings no longer match. Replace the file or timings before using it."; }
  const review = visualReview(target, narration.reviews);
  return { id: narration.id, audioSha256: narration.audio.sha256, scriptSha256: scriptHash(phrases), duration: narration.audio.duration,
    speaker: narration.speaker, sourceNote: narration.sourceNote, url: `/api/media/narration/${jobId}/${narration.id}/narration.wav`,
    review, target, issue, canUse: !issue && Boolean(narration.alignment) && review.status === "approved", selected: Boolean(params.useImportedNarration),
    words: phrases.flatMap((p) => p.trim().split(/\s+/)).map((word, i) => ({ word, start: narration.alignment?.words[i]?.start ?? null, end: narration.alignment?.words[i]?.end ?? null })),
    hasTiming: Boolean(narration.alignment), history: narration.reviews,
    identityVerified: false as const, paidGenerationAuthorized: false as const };
}
