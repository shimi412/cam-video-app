/**
 * Runway as a VIDEO-ONLY provider — VIDEO_PROVIDER=runway.
 *
 * Why a partial provider: Runway's API has no TTS, no background removal and no
 * word-level transcription, so it cannot replace a whole ProviderSet. It only
 * overrides the `video` slot; images, voice, cut-outs and timestamps stay on fal.
 *
 * What Runway actually is today (checked 2026-09-22): a router in front of
 * several engines, billed in credits at $0.01 each, and not just their own
 * Gen-4.5. Credits per second of generated video, from their pricing page:
 *   wan3          480p  5   | 720p 10 | 1080p 20
 *   gen4.5        any   12
 *   veo3.1        no audio 20 | with audio 40
 *   seedance2_5   480p 20  | 720p 30 | 1080p 68
 *   seedance2     480p/720p 36 | 1080p 40
 * Some models add a one-off credit for the first-frame image (see MODELS).
 *
 * Reference: https://docs.dev.runwayml.com/guides/pricing/
 *
 * Rule of the house: this file is the only place that talks to Runway.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { MediaResult, VideoGenProvider } from "./types";
import { assertLiveMedia } from "./mode";

const STORAGE = path.join(process.cwd(), "storage");
const API_BASE = "https://api.dev.runwayml.com/v1";
const API_VERSION = "2024-11-06";

/** Runway bills in credits; one credit is $0.01 in the developer portal. */
export const CREDIT_USD = 0.01;

export type RunwayModelKey =
  | "wan3-480p"
  | "wan3-720p"
  | "wan3-1080p"
  | "gen4.5"
  | "veo3.1-silent"
  | "veo3.1-audio"
  | "seedance2_5-480p"
  | "seedance2_5-720p"
  | "seedance2_5-1080p";

type ModelSpec = {
  /** Model id sent in the request body. */
  model: string;
  /** Credits per second of generated video. */
  creditsPerSecond: number;
  /** One-off credits for the image-to-video start frame, when the model charges one. */
  firstFrameCredits: number;
  /** Default output resolution, sent as `ratio` (the API takes a resolution, not "16:9"). */
  resolution: { "16:9": string; "9:16": string; "1:1": string };
  label: string;
};

const RES = {
  "480p": { "16:9": "854:480", "9:16": "480:854", "1:1": "480:480" },
  "720p": { "16:9": "1280:720", "9:16": "720:1280", "1:1": "960:960" },
  "1080p": { "16:9": "1920:1080", "9:16": "1080:1920", "1:1": "1440:1440" },
} as const;

export const MODELS: Record<RunwayModelKey, ModelSpec> = {
  "wan3-480p": { model: "wan3", creditsPerSecond: 5, firstFrameCredits: 0, resolution: RES["480p"], label: "WAN3 480p" },
  "wan3-720p": { model: "wan3", creditsPerSecond: 10, firstFrameCredits: 0, resolution: RES["720p"], label: "WAN3 720p" },
  "wan3-1080p": { model: "wan3", creditsPerSecond: 20, firstFrameCredits: 0, resolution: RES["1080p"], label: "WAN3 1080p" },
  "gen4.5": { model: "gen4.5", creditsPerSecond: 12, firstFrameCredits: 0, resolution: RES["720p"], label: "Gen-4.5" },
  "veo3.1-silent": { model: "veo3.1", creditsPerSecond: 20, firstFrameCredits: 0, resolution: RES["720p"], label: "Veo 3.1 (no audio)" },
  "veo3.1-audio": { model: "veo3.1", creditsPerSecond: 40, firstFrameCredits: 0, resolution: RES["720p"], label: "Veo 3.1 (native audio)" },
  "seedance2_5-480p": { model: "seedance2_5", creditsPerSecond: 20, firstFrameCredits: 0, resolution: RES["480p"], label: "Seedance 2.5 480p" },
  "seedance2_5-720p": { model: "seedance2_5", creditsPerSecond: 30, firstFrameCredits: 0, resolution: RES["720p"], label: "Seedance 2.5 720p" },
  "seedance2_5-1080p": { model: "seedance2_5", creditsPerSecond: 68, firstFrameCredits: 0, resolution: RES["1080p"], label: "Seedance 2.5 1080p" },
};

function modelKey(env: string | undefined, fallback: RunwayModelKey): RunwayModelKey {
  if (env && env in MODELS) return env as RunwayModelKey;
  if (env) throw new Error(`Unknown Runway model "${env}" — pick one of: ${Object.keys(MODELS).join(", ")}`);
  return fallback;
}

/** Which engine each tier maps to; both overridable without touching the code. */
export function tierModel(tier: "standard" | "premium"): RunwayModelKey {
  return tier === "premium"
    ? modelKey(process.env.RUNWAY_VIDEO_PREMIUM, "seedance2_5-720p")
    : modelKey(process.env.RUNWAY_VIDEO_STANDARD, "wan3-720p");
}

/** What a clip of this length costs us in USD, before any margin. */
export function clipCostUsd(key: RunwayModelKey, seconds: number): number {
  const spec = MODELS[key];
  const credits = spec.creditsPerSecond * seconds + spec.firstFrameCredits;
  return Number((credits * CREDIT_USD).toFixed(4));
}

function apiKey(): string {
  const key = process.env.RUNWAYML_API_SECRET;
  if (!key) throw new Error("VIDEO_PROVIDER=runway needs RUNWAYML_API_SECRET in .env");
  return key;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey()}`,
    "X-Runway-Version": API_VERSION,
    "Content-Type": "application/json",
  };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: headers() });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    throw new Error(`runway ${init?.method ?? "GET"} ${url} failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as T;
}

/**
 * Runway takes the start frame as a URL or a data URI; we have no public bucket
 * in local mode, so we inline it. Their data-URI ceiling is around 5 MB encoded,
 * so oversized keyframes are re-encoded to JPEG once before giving up.
 */
const DATA_URI_MAX_BYTES = 4_500_000;

async function keyframeDataUri(filePath: string): Promise<string> {
  const raw = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  if (Buffer.byteLength(raw.toString("base64")) <= DATA_URI_MAX_BYTES) {
    return `data:${mime};base64,${raw.toString("base64")}`;
  }
  const shrunk = await sharp(raw).resize({ width: 1920, withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  const encoded = shrunk.toString("base64");
  if (Buffer.byteLength(encoded) > DATA_URI_MAX_BYTES) {
    throw new Error(`runway: keyframe still too large after re-encoding (${filePath})`);
  }
  return `data:image/jpeg;base64,${encoded}`;
}

type TaskCreated = { id: string };
type TaskStatus = {
  id: string;
  status: "PENDING" | "THROTTLED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  output?: string[];
  failure?: string;
  failureCode?: string;
};

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 12 * 60 * 1000;

async function waitForOutput(taskId: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const task = await request<TaskStatus>(`${API_BASE}/tasks/${taskId}`);
    if (task.status === "SUCCEEDED") {
      const url = task.output?.[0];
      if (!url) throw new Error(`runway task ${taskId} succeeded with no output`);
      return url;
    }
    if (task.status === "FAILED" || task.status === "CANCELLED") {
      throw new Error(`runway task ${taskId} ${task.status}: ${task.failureCode ?? ""} ${task.failure ?? ""}`.trim());
    }
    if (Date.now() > deadline) throw new Error(`runway task ${taskId} still ${task.status} after 12 min`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

async function download(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`runway download failed (${res.status}): ${url}`);
  const dir = path.join(STORAGE, "clips");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${randomUUID()}.mp4`);
  await writeFile(filePath, Buffer.from(await res.arrayBuffer()));
  return filePath;
}

/** Engines accept whole seconds; we keep the 5 / 10 convention of the fal provider. */
function clampDuration(seconds: number): number {
  return seconds > 5 ? 10 : 5;
}

export const runwayVideo: VideoGenProvider = {
  async generateClip({ prompt, keyframePath, durationSeconds, tier, aspectRatio }): Promise<MediaResult> {
    assertLiveMedia();
    apiKey(); // fail fast on a missing credential, before uploading anything
    const key = tierModel(tier);
    const spec = MODELS[key];
    const seconds = clampDuration(durationSeconds);
    const ratio = spec.resolution[aspectRatio ?? "16:9"];

    const created = await request<TaskCreated>(`${API_BASE}/image_to_video`, {
      method: "POST",
      body: JSON.stringify({
        model: spec.model,
        promptImage: await keyframeDataUri(keyframePath),
        promptText: prompt,
        ratio,
        duration: seconds,
      }),
    });
    const url = await waitForOutput(created.id);

    return {
      filePath: await download(url),
      realCostUsd: clipCostUsd(key, seconds),
      provider: "runway",
      model: `${spec.model} (${spec.label}, ${seconds}s)`,
      meta: { prompt, taskId: created.id, sourceUrl: url, durationSeconds: seconds, ratio, tier },
    };
  },
};
