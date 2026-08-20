/**
 * Mock providers: default in local development (MOCK_MODE=true).
 * They write real placeholder files to storage/ and report realistic
 * simulated costs, so the whole app (jobs, credits, margin, montage)
 * runs for real with zero API spend.
 *
 * Placeholder clips and audio are rendered with the local ffmpeg when
 * available (free, CPU only); otherwise a stub file is written.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ImageGenProvider,
  VideoGenProvider,
  TtsProvider,
  MediaResult,
} from "./types";

const exec = promisify(execFile);
const STORAGE = path.join(process.cwd(), "storage");

// Simulated real costs, aligned with the fiche projet research of 2026-08-19.
const COSTS = {
  imageUsd: 0.13, // Nano Banana 2K, per image
  videoStandardUsdPerSec: 0.1, // Wan 2.5 720p
  videoPremiumUsdPerSec: 0.15, // Veo/Kling class
  ttsUsdPerMinute: 0.1,
};

async function ensureDir(sub: string): Promise<string> {
  const dir = path.join(STORAGE, sub);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function ffmpeg(args: string[]): Promise<boolean> {
  try {
    await exec("ffmpeg", ["-y", "-loglevel", "error", ...args]);
    return true;
  } catch {
    return false;
  }
}

/** Deterministic pastel color derived from the prompt, so shots are tellable apart. */
function promptColor(prompt: string): string {
  let hash = 0;
  for (const c of prompt) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const palette = ["334155", "3b4a6b", "44403c", "3f3f46", "1e3a5f", "4a3728", "2d4a3e", "4c1d95"];
  return palette[hash % palette.length];
}

export const mockImage: ImageGenProvider = {
  async generateImage({ prompt, aspectRatio }): Promise<MediaResult> {
    const dir = await ensureDir("images");
    const filePath = path.join(dir, `${randomUUID()}.png`);
    const [w, h] =
      aspectRatio === "16:9" ? [1280, 720] : aspectRatio === "9:16" ? [720, 1280] : [1024, 1024];
    // PNG (not SVG) so ffmpeg can assemble keyframes into placeholder clips.
    const ok = await ffmpeg([
      "-f", "lavfi",
      "-i", `color=c=0x${promptColor(prompt)}:s=${w}x${h}`,
      "-frames:v", "1",
      filePath,
    ]);
    if (!ok) await writeFile(filePath, `mock keyframe: ${prompt}`, "utf8");
    return {
      filePath,
      realCostUsd: COSTS.imageUsd,
      provider: "mock",
      model: "mock-nano-banana",
      meta: { prompt, aspectRatio },
    };
  },
};

export const mockVideo: VideoGenProvider = {
  async generateClip({ prompt, keyframePath, durationSeconds, tier }): Promise<MediaResult> {
    const dir = await ensureDir("clips");
    const filePath = path.join(dir, `${randomUUID()}.mp4`);
    // Slow zoom on the keyframe: image-to-video stand-in, uniform codec for concat.
    const ok = await ffmpeg([
      "-loop", "1",
      "-i", keyframePath,
      "-t", String(durationSeconds),
      "-vf",
      `scale=1280:720,zoompan=z='min(zoom+0.0015,1.2)':d=${durationSeconds * 25}:s=1280x720:fps=25`,
      "-pix_fmt", "yuv420p",
      "-c:v", "libx264",
      filePath,
    ]);
    if (!ok) await writeFile(filePath, `mock clip: ${prompt}`, "utf8");
    const perSec =
      tier === "premium" ? COSTS.videoPremiumUsdPerSec : COSTS.videoStandardUsdPerSec;
    return {
      filePath,
      realCostUsd: Number((durationSeconds * perSec).toFixed(4)),
      provider: "mock",
      model: tier === "premium" ? "mock-veo" : "mock-wan-2.5-720p",
      meta: { prompt, durationSeconds, tier },
    };
  },
};

export const mockTts: TtsProvider = {
  async synthesize({ text, voiceId }): Promise<MediaResult> {
    const dir = await ensureDir("voice");
    // WAV: no codec dependency in ffmpeg builds, converted to AAC at montage.
    const filePath = path.join(dir, `${randomUUID()}.wav`);
    // ~15 characters per second of narrated speech.
    const seconds = Math.max(1, Math.round(text.length / 15));
    const ok = await ffmpeg([
      "-f", "lavfi",
      "-i", `sine=frequency=220:duration=${seconds}`,
      "-af", "volume=0.15",
      filePath,
    ]);
    if (!ok) await writeFile(filePath, `mock voice: ${text.slice(0, 100)}`, "utf8");
    return {
      filePath,
      realCostUsd: Number(((seconds / 60) * COSTS.ttsUsdPerMinute).toFixed(4)),
      provider: "mock",
      model: `mock-tts/${voiceId}`,
      meta: { characters: text.length, seconds },
    };
  },
};
