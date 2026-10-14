import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, rm, realpath } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { SceneMediaSchema, mediaFile, type SceneMedia } from "./preview-inputs";
import { ClipEditSchema, type ClipEdit } from "./finishing";
import type { MontageMedia } from "./montage";

const exec = promisify(execFile);
export const MAX_MEDIA_BYTES = 32 * 1024 * 1024;
const importsRoot = () => path.join(process.cwd(), "storage/imports");

/** Decode untrusted bytes, strip metadata/audio and persist a normalized local asset. */
export async function importSceneMedia(jobId: string, bytes: Buffer): Promise<SceneMedia> {
  if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) throw new Error("Choose an image or MP4 smaller than 32 MB.");
  const id = randomUUID(), dir = path.join(importsRoot(), jobId);
  await mkdir(dir, { recursive: true });
  const isMp4 = bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp";
  const isRaster = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    || (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP");
  if (!isMp4 && !isRaster) throw new Error("Use a still PNG, JPEG or WebP image, or an MP4 clip.");
  const kind = isMp4 ? "video" : "image";
  const output = path.join(dir, `${id}.${isMp4 ? "mp4" : "png"}`), input = path.join(dir, `${id}.upload`);
  try {
    let width: number, height: number, duration: number | undefined;
    if (!isMp4) {
      const source = sharp(bytes, { limitInputPixels: 24_000_000 });
      const meta = await source.metadata();
      if (!["png", "jpeg", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) > 1) throw new Error("Use a still PNG, JPEG or WebP image, or an MP4 clip.");
      const result = await source.rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).png().toFile(output);
      width = result.width; height = result.height;
    } else {
      await writeFile(input, bytes);
      const { stdout } = await exec("ffprobe", ["-v", "error", "-protocol_whitelist", "file", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", input], { timeout: 15_000 });
      const probe = JSON.parse(stdout) as { format: { duration: string }; streams: { codec_type: string; width?: number; height?: number }[] };
      const video = probe.streams.find((s) => s.codec_type === "video");
      duration = Number(probe.format.duration);
      if (!video?.width || !video.height || video.width * video.height > 8_500_000 || !Number.isFinite(duration) || duration < .2 || duration > 60) throw new Error("Use a video up to 4K, lasting 0.2 to 60 seconds.");
      await exec("ffmpeg", ["-y", "-loglevel", "error", "-protocol_whitelist", "file", "-i", input, "-map", "0:v:0", "-an", "-sn", "-dn", "-map_metadata", "-1", "-vf", "scale=1920:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=30", "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output], { timeout: 120_000, maxBuffer: 1024 * 1024 });
      const { stdout: normalized } = await exec("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,duration", "-of", "json", output], { timeout: 10_000 });
      const info = JSON.parse(normalized).streams[0];
      width = info.width; height = info.height; duration = Number(info.duration);
    }
    return SceneMediaSchema.parse({ id, kind, width, height, duration, sha256: createHash("sha256").update(await readFile(output)).digest("hex") });
  } catch (error) {
    await rm(output, { force: true });
    throw error;
  } finally { await rm(input, { force: true }); }
}

export async function verifiedSceneMedia(jobId: string, value: SceneMedia) {
  const media = SceneMediaSchema.parse(value);
  const base = await realpath(path.join(importsRoot(), jobId));
  const file = await realpath(path.join(base, mediaFile(media)));
  if (!file.startsWith(base + path.sep)) throw new Error("Imported media is outside this production.");
  const bytes = await readFile(file);
  if (createHash("sha256").update(bytes).digest("hex") !== media.sha256) throw new Error("An imported scene changed. Please import it again.");
  return { file, bytes, media };
}

export function fitSceneEdit(sourceDuration: number, seconds: number, stateChange: boolean, supplied?: ClipEdit) {
  const edit = ClipEditSchema.parse(supplied ?? {}), end = edit.mediaEnd ?? sourceDuration;
  if (!Number.isFinite(seconds) || seconds <= 0 || !end || end > sourceDuration + .001 || end <= edit.mediaStart) throw new Error("The selected clip range exceeds its source or visible interval.");
  if (stateChange) {
    if (!supplied) edit.playbackRate = Math.max(.5, Math.min(2, (end - edit.mediaStart) / seconds));
    if ((end - edit.mediaStart) / edit.playbackRate > seconds + 1 / 30) throw new Error("The full transformation cannot fit before the next scene or logo. Review the excerpt or pacing; its final state must not be cut off.");
  } else if (edit.playbackRate < .8 || edit.playbackRate > 1.25) throw new Error("Character acting must stay between 0.8× and 1.25× speed.");
  return { edit, end };
}

/** Hold through the signature, but finish the action before the logo hides it. */
export async function stageSceneMedia(jobId: string, media: Record<string, SceneMedia>, root: string, durations: number[], edits: Record<string, ClipEdit> = {}, stateChanges: number[] = [], visibleDurations: number[] = durations) {
  const result: Record<number, MontageMedia> = {};
  for (const [index, value] of Object.entries(media)) {
    const shot = Number(index);
    if (!Number.isInteger(shot) || shot < 1 || shot > durations.length) throw new Error("Imported media refers to an unknown scene.");
    const verified = await verifiedSceneMedia(jobId, value);
    const file = `assets/scene-${shot}.${value.kind === "image" ? "png" : "mp4"}`;
    const seconds = durations[shot - 1];
    const { edit, end } = value.kind === "video"
      ? fitSceneEdit(value.duration!, visibleDurations[shot - 1], stateChanges.includes(shot), edits[shot])
      : { edit: ClipEditSchema.parse(edits[shot] ?? {}), end: undefined };
    if (value.kind === "image") await writeFile(path.join(root, file), verified.bytes);
    else await exec("ffmpeg", ["-y", "-loglevel", "error", "-i", verified.file, "-an", "-vf", `trim=end=${end},setpts=PTS-STARTPTS,crop=trunc(iw/${edit.crop}/2)*2:trunc(ih/${edit.crop}/2)*2,tpad=stop_mode=clone:stop_duration=${seconds * edit.playbackRate + edit.mediaStart}`, "-t", String(seconds * edit.playbackRate + edit.mediaStart), "-r", "30", "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p", path.join(root, file)], { timeout: 120_000 });
    result[shot] = { kind: value.kind, file, sourceAspect: value.width / value.height, mediaStart: edit.mediaStart, playbackRate: edit.playbackRate, heldSeconds: value.kind === "video" ? Math.max(0, seconds - (end! - edit.mediaStart) / edit.playbackRate) : 0 };
  }
  return result;
}
