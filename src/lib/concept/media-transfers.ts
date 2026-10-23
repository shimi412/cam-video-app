import { readFile, mkdir, writeFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { z } from "zod";
import { assertTransportMode, providerOutputUrl, type TransportMode } from "./provider-transports";
import { Hash, sha256, readCheckpoint, saveCheckpoint } from "./checkpoints";
import { importSceneMedia, verifiedSceneMedia, MAX_MEDIA_BYTES } from "./imported-media";
import { SceneMediaSchema } from "./preview-inputs";
import { inspectImageQuality } from "./image-quality";
import type { ImageAspectRatio } from "./image-quality-types";

export type AssetTransport = {
  mode: TransportMode;
  upload: (bytes: Buffer, name: string, contentType: string) => Promise<{ url: string; expiresAt: number }>;
  download: (url: string, provider: "fal" | "higgsfield") => Promise<Response>;
};
const Context = z.object({ mode: z.enum(["simulation", "live"]), fingerprint: Hash });
const Upload = Context.extend({ sha256: Hash, state: z.enum(["uploading", "not-started", "complete"]), url: z.string().optional(), expiresAt: z.number().optional() });
/** An explicit initiation rejection proves no file bytes were sent. Only this
 * failure can be resumed; lost responses and interrupted PUTs remain ambiguous. */
export class UploadNotStartedError extends Error {}
const Audio = z.object({ kind: z.literal("audio"), file: z.literal("narration.wav"), sha256: Hash, sourceSha256: Hash, duration: z.number().positive() });
const Download = Context.extend({ jobId: z.uuid(), kind: z.enum(["image", "video", "audio"]), provider: z.enum(["fal", "higgsfield"]), sourceSha256: Hash, sourceFile: z.literal("source-image").optional(), media: SceneMediaSchema.optional(), audio: Audio.optional() });
export type AudioAsset = z.infer<typeof Audio>;
type TransferContext = { directory: string; transport: AssetTransport; assertOwned: () => Promise<void> };

/** Upload only the exact reviewed bytes. Interrupted/expired transfers stop for
 * reconciliation; no guessing new URLs or silently uploading changed files.
 */
export async function uploadReference(input: TransferContext & { file: string; sha256: string; contentType: "image/png" | "audio/wav"; now?: number }) {
  assertTransportMode(input.transport.mode);
  const hash = Hash.parse(input.sha256), bytes = await readFile(input.file);
  if (bytes.length > 64 * 1024 * 1024 || sha256(bytes) !== hash) throw new Error("Reference bytes changed or exceed the upload limit.");
  const key = sha256(JSON.stringify({ mode: input.transport.mode, hash, contentType: input.contentType }));
  const file = path.join(input.directory, "uploads", `${key}.json`), now = input.now ?? Date.now();
  const previous = await readCheckpoint(file, Upload);
  if (previous) {
    if (previous.mode !== input.transport.mode || previous.fingerprint !== key || previous.sha256 !== hash) throw new Error("Upload receipt mismatch.");
    if (previous.state === "uploading") throw new Error("Upload outcome unknown. Reconcile the original upload.");
    if (previous.state === "complete") {
      // A hosted URL expires after about a day (fal). The bytes are the exact reviewed file, hash-verified
      // above, so they are simply uploaded again; the client never sees this (live Clay 2026-10-23, a
      // storyboard revision resumed the next morning stopped on "Uploaded reference expired").
      if (previous.expiresAt && previous.expiresAt > now + 60_000) return { url: providerOutputUrl(previous.url, "fal", input.transport.mode), sha256: hash, reused: true };
    }
  }
  await saveCheckpoint(file, { mode: input.transport.mode, fingerprint: key, sha256: hash, state: "uploading" }, input.assertOwned);
  await input.assertOwned();
  let result: Awaited<ReturnType<AssetTransport["upload"]>>;
  try { result = await input.transport.upload(bytes, `${hash}.${input.contentType === "image/png" ? "png" : "wav"}`, input.contentType); }
  catch (error) {
    if (error instanceof UploadNotStartedError) await saveCheckpoint(file, { mode: input.transport.mode, fingerprint: key, sha256: hash, state: "not-started" }, input.assertOwned);
    throw error;
  }
  const url = providerOutputUrl(result.url, "fal", input.transport.mode);
  if (!Number.isFinite(result.expiresAt) || result.expiresAt <= now + 60_000) throw new Error("Upload returned an expired URL.");
  await saveCheckpoint(file, { mode: input.transport.mode, fingerprint: key, sha256: hash, state: "complete", url, expiresAt: result.expiresAt }, input.assertOwned);
  return { url, sha256: hash, reused: false };
}

export async function boundedMedia(response: Response, limit: number) {
  if (!response.ok || response.redirected) throw new Error("Media download failed or redirected.");
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) { await response.body?.cancel(); throw new Error("Media exceeds the size limit."); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty media response.");
  let bytes = 0; const parts: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new Error("Media exceeds the size limit."); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!bytes) throw new Error("Empty media response.");
  return Buffer.concat(parts);
}

const exec = promisify(execFile);
export async function normalizeAudio(bytes: Buffer, directory: string): Promise<AudioAsset> {
  if (!bytes.length || bytes.length > 64 * 1024 * 1024) throw new Error("Use an audio file under 64 MB.");
  const temporary = path.join(directory, `${randomUUID()}.upload`), output = path.join(directory, `${randomUUID()}.wav`);
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    const { stdout } = await exec("ffprobe", ["-v", "error", "-protocol_whitelist", "file", "-format_whitelist", "wav,mp3,flac,ogg,mov,aac,aiff", "-show_entries", "format=duration:stream=codec_type,channels", "-of", "json", temporary], { timeout: 15_000 });
    const probe = z.object({ format: z.object({ duration: z.string() }), streams: z.array(z.object({ codec_type: z.string(), channels: z.number().optional() })).length(1) }).parse(JSON.parse(stdout));
    const duration = Number(probe.format.duration);
    if (probe.streams[0].codec_type !== "audio" || !probe.streams[0].channels || probe.streams[0].channels > 2 || !Number.isFinite(duration) || duration < .2 || duration > 600) throw new Error("Use a mono/stereo voice recording lasting 0.2 to 600 seconds.");
    await exec("ffmpeg", ["-y", "-loglevel", "error", "-protocol_whitelist", "file", "-format_whitelist", "wav,mp3,flac,ogg,mov,aac,aiff", "-i", temporary, "-map", "0:a:0", "-map_metadata", "-1", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", output], { timeout: 60_000 });
    const { stdout: measured } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", output], { timeout: 10_000 });
    const seconds = Number(measured.trim());
    if (!Number.isFinite(seconds) || Math.abs(seconds - duration) > .1) throw new Error("Voice duration changed during normalization.");
    const { stderr } = await exec("ffmpeg", ["-hide_banner", "-i", output, "-af", "volumedetect", "-f", "null", "-"], { timeout: 30_000 });
    const mean = Number(stderr.match(/mean_volume: ([\d.-]+) dB/)?.[1]);
    if (!Number.isFinite(mean) || mean < -45) throw new Error("Voice recording is silent or inaudible.");
    const asset: AudioAsset = { kind: "audio", file: "narration.wav", sha256: sha256(await readFile(output)), sourceSha256: sha256(bytes), duration: seconds };
    await rename(output, path.join(directory, "narration.wav"));
    return asset;
  } finally { await rm(temporary, { force: true }); await rm(output, { force: true }); }
}

/** Copy provider results into verified local storage before building a montage.
 * The caller supplies an acknowledged output URL and holds the job lock.
 * Downloads may be retried; they never re-submit generation requests.
 */
export async function downloadResult(input: TransferContext & { jobId: string; fingerprint: string; kind: "image" | "video" | "audio"; provider: "fal" | "higgsfield"; url: string; expectedAspectRatio?: ImageAspectRatio }) {
  assertTransportMode(input.transport.mode); z.uuid().parse(input.jobId); Hash.parse(input.fingerprint);
  const directory = path.join(input.directory, "downloads", input.fingerprint), receiptFile = path.join(directory, "receipt.json");
  const old = await readCheckpoint(receiptFile, Download);
  if (old) {
    if (old.mode !== input.transport.mode || old.jobId !== input.jobId || old.fingerprint !== input.fingerprint || old.kind !== input.kind || old.provider !== input.provider) throw new Error("Media receipt mismatch.");
    if (old.media) {
      const verified = await verifiedSceneMedia(input.jobId, old.media);
      const original = old.sourceFile ? await readFile(path.join(directory, old.sourceFile)) : undefined;
      if (original && sha256(original) !== old.sourceSha256) throw new Error("Original downloaded image changed. Restore the original file.");
      if (old.media.kind === "image" && (!old.media.quality || old.media.quality.expectedAspectRatio !== input.expectedAspectRatio)) {
        old.media.quality = await inspectImageQuality(original ?? verified.bytes, input.expectedAspectRatio);
        await saveCheckpoint(receiptFile, old, input.assertOwned);
      }
    }
    else if (old.audio) {
      if (sha256(await readFile(path.join(directory, "narration.wav"))) !== old.audio.sha256) throw new Error("Downloaded voice changed. Restore the original file.");
    } else throw new Error("Incomplete media receipt.");
    return { ...old, directory, reused: true };
  }
  const url = providerOutputUrl(input.url, input.provider, input.transport.mode);
  await input.assertOwned();
  const bytes = await boundedMedia(await input.transport.download(url, input.provider), input.kind === "audio" ? 64 * 1024 * 1024 : MAX_MEDIA_BYTES);
  await input.assertOwned(); await mkdir(directory, { recursive: true });
  // Retain the provider's exact image as evidence alongside the normalized
  // display asset. Quality warnings never repair or crop its composition.
  if (input.kind === "image") await writeFile(path.join(directory, "source-image"), bytes);
  const result = input.kind === "audio" ? { audio: await normalizeAudio(bytes, directory) } : { media: await importSceneMedia(input.jobId, bytes, { expectedAspectRatio: input.expectedAspectRatio }) };
  if (result.media && result.media.kind !== input.kind) throw new Error("Provider returned the wrong media type.");
  const receipt = Download.parse({ mode: input.transport.mode, jobId: input.jobId, fingerprint: input.fingerprint, kind: input.kind, provider: input.provider, sourceSha256: sha256(bytes), ...(input.kind === "image" ? { sourceFile: "source-image" } : {}), ...result });
  await saveCheckpoint(receiptFile, receipt, input.assertOwned);
  return { ...receipt, directory, reused: false };
}
