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

export const mockImage: ImageGenProvider = {
  async generateImage({ prompt, aspectRatio }): Promise<MediaResult> {
    const dir = await ensureDir("images");
    const filePath = path.join(dir, `${randomUUID()}.svg`);
    const [w, h] =
      aspectRatio === "16:9" ? [1920, 1080] : aspectRatio === "9:16" ? [1080, 1920] : [1080, 1080];
    const label = prompt.slice(0, 80).replace(/[<>&]/g, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#1e293b"/>
  <text x="50%" y="48%" fill="#e2e8f0" font-family="sans-serif" font-size="42" text-anchor="middle">MOCK KEYFRAME</text>
  <text x="50%" y="55%" fill="#94a3b8" font-family="sans-serif" font-size="26" text-anchor="middle">${label}</text>
</svg>`;
    await writeFile(filePath, svg, "utf8");
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
  async generateClip({ prompt, durationSeconds, tier }): Promise<MediaResult> {
    const dir = await ensureDir("clips");
    const filePath = path.join(dir, `${randomUUID()}.mp4`);
    const ok = await ffmpeg([
      "-f", "lavfi",
      "-i", `color=c=0x334155:s=1280x720:d=${durationSeconds}`,
      "-pix_fmt", "yuv420p",
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
    const filePath = path.join(dir, `${randomUUID()}.mp3`);
    // ~15 characters per second of narrated speech.
    const seconds = Math.max(1, Math.round(text.length / 15));
    const ok = await ffmpeg([
      "-f", "lavfi",
      "-i", `sine=frequency=220:duration=${seconds}`,
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
