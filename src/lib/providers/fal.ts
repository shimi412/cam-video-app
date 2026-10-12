/**
 * Real media providers on fal.ai (Bina account) — PROVIDER_MODE=fal.
 *
 * Endpoints and prices verified on fal.ai on 2026-08-20:
 *  - Keyframes: fal-ai/nano-banana-pro (text-to-image) and
 *    fal-ai/nano-banana-pro/edit (with reference images) — $0.15/image in 1K/2K.
 *  - Clips standard: fal-ai/wan-25-preview/image-to-video — $0.05/s 480p,
 *    $0.10/s 720p, $0.15/s 1080p; duration 5 or 10 s.
 *  - Clips premium: fal-ai/kling-video/v2.5-turbo/pro/image-to-video —
 *    $0.35 per 5 s, +$0.07 per extra second; duration 5 or 10 s.
 *  - Voice-over: fal-ai/minimax/speech-02-hd — $0.10 per 1000 characters.
 *  - Cut-outs: fal-ai/nano-banana-pro 1K ($0.15) + fal-ai/bria/background/remove ($0.018).
 *  - Word timestamps: fal-ai/whisper (chunk_level word), ~free.
 *
 * Rule of the house: this file is the only place that talks to fal.ai.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fal } from "@fal-ai/client";
import { assertLiveMedia } from "./mode";
import type {
  CutoutProvider,
  ImageGenProvider,
  MediaResult,
  TranscribeProvider,
  TtsProvider,
  VideoGenProvider,
  WordTiming,
} from "./types";

const STORAGE = path.join(process.cwd(), "storage");

export const FAL_MODELS = {
  image: "fal-ai/nano-banana-pro",
  imageEdit: "fal-ai/nano-banana-pro/edit",
  videoStandard: "fal-ai/wan-25-preview/image-to-video",
  videoPremium: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
  tts: "fal-ai/minimax/speech-02-hd",
  removeBackground: "fal-ai/bria/background/remove",
  whisper: "fal-ai/whisper",
} as const;

/** Real prices (USD) used for metering; keep in sync with the header comment. */
export const FAL_PRICES = {
  imageUsd: 0.15,
  wanUsdPerSec: { "480p": 0.05, "720p": 0.1, "1080p": 0.15 } as Record<string, number>,
  klingBaseUsd: 0.35,
  klingExtraUsdPerSec: 0.07,
  ttsUsdPer1000Chars: 0.1,
  removeBackgroundUsd: 0.018,
  whisperUsd: 0, // billed per compute second, negligible; tracked as 0
};

/** Wan resolution for the standard tier (720p = devis hypothesis). */
const WAN_RESOLUTION = (process.env.FAL_WAN_RESOLUTION ?? "720p") as "480p" | "720p" | "1080p";

/** App voice ids → MiniMax predefined voice ids. */
const VOICE_MAP: Record<string, string> = {
  "narrator-en-1": "Deep_Voice_Man",
  "narrator-en-2": "Wise_Woman",
  "narrator-en-3": "Friendly_Person",
};

let configured = false;
function ensureClient() {
  assertLiveMedia();
  if (configured) return;
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("PROVIDER_MODE=fal needs FAL_KEY in .env");
  fal.config({ credentials: key });
  configured = true;
}

/** fal.subscribe with the validation detail surfaced in the error message (shown in Admin). */
async function subscribe(
  endpoint: string,
  input: Record<string, unknown>,
): Promise<{ data: unknown; requestId: string }> {
  try {
    const res = await fal.subscribe(endpoint, { input });
    return { data: res.data, requestId: res.requestId };
  } catch (err) {
    const e = err as { status?: number; body?: unknown; message?: string };
    const detail = e.body ? JSON.stringify(e.body).slice(0, 500) : e.message;
    throw new Error(`fal ${endpoint} failed (${e.status ?? "?"}): ${detail}`);
  }
}

async function download(url: string, subDir: string, fallbackExt: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fal download failed (${res.status}): ${url}`);
  const ext = path.extname(new URL(url).pathname) || fallbackExt;
  const dir = path.join(STORAGE, subDir);
  await mkdir(dir, { recursive: true });
  // Generated output is runtime storage, not a build-time file dependency.
  const filePath = path.join(/* turbopackIgnore: true */ dir, `${randomUUID()}${ext}`);
  await writeFile(filePath, Buffer.from(await res.arrayBuffer()));
  return filePath;
}

/** Uploads a local file to fal storage and returns its public URL. */
async function uploadLocal(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const type =
    ext === ".png" ? "image/png"
    : ext === ".webp" ? "image/webp"
    : ext === ".mp4" ? "video/mp4"
    : ext === ".mp3" ? "audio/mpeg"
    : ext === ".wav" ? "audio/wav"
    : "image/jpeg";
  const file = new File([buffer], path.basename(filePath), { type });
  return fal.storage.upload(file);
}

/** Video models only accept 5 or 10 s. */
function clampDuration(seconds: number): "5" | "10" {
  return seconds > 5 ? "10" : "5";
}

type ImageOutput = { images: Array<{ url: string }>; description?: string };
type VideoOutput = { video: { url: string }; seed?: number; actual_prompt?: string };
type TtsOutput = { audio: { url: string }; duration_ms?: number };

export const falImage: ImageGenProvider = {
  async generateImage({ prompt, aspectRatio, referencePath }): Promise<MediaResult> {
    ensureClient();
    const common = {
      prompt,
      aspect_ratio: aspectRatio,
      resolution: "2K",
      // JPEG: Wan rejects PNG with alpha as a start frame.
      output_format: "jpeg",
      num_images: 1,
    };
    let endpoint: string = FAL_MODELS.image;
    let input: Record<string, unknown> = common;
    if (referencePath) {
      endpoint = FAL_MODELS.imageEdit;
      input = { ...common, image_urls: [await uploadLocal(referencePath)] };
    }
    const { data, requestId } = await subscribe(endpoint, input);
    const url = (data as ImageOutput).images?.[0]?.url;
    if (!url) throw new Error(`fal ${endpoint}: no image returned`);
    return {
      filePath: await download(url, "images", ".jpg"),
      realCostUsd: FAL_PRICES.imageUsd,
      provider: "fal",
      model: endpoint,
      meta: { prompt, requestId, sourceUrl: url, resolution: "2K", reference: Boolean(referencePath) },
    };
  },
};

export const falVideo: VideoGenProvider = {
  async generateClip({ prompt, keyframePath, durationSeconds, tier }): Promise<MediaResult> {
    ensureClient();
    const imageUrl = await uploadLocal(keyframePath);
    const duration = clampDuration(durationSeconds);
    const seconds = Number(duration);

    if (tier === "premium") {
      const { data, requestId } = await subscribe(FAL_MODELS.videoPremium, {
        prompt,
        image_url: imageUrl,
        duration,
        negative_prompt: "blur, distort, low quality, text, watermark, extra limbs",
        cfg_scale: 0.5,
      });
      const url = (data as VideoOutput).video?.url;
      if (!url) throw new Error("fal kling: no video returned");
      const cost = FAL_PRICES.klingBaseUsd + Math.max(0, seconds - 5) * FAL_PRICES.klingExtraUsdPerSec;
      return {
        filePath: await download(url, "clips", ".mp4"),
        realCostUsd: Number(cost.toFixed(4)),
        provider: "fal",
        model: `${FAL_MODELS.videoPremium} (${duration}s)`,
        meta: { prompt, requestId, sourceUrl: url, durationSeconds: seconds },
      };
    }

    const { data, requestId } = await subscribe(FAL_MODELS.videoStandard, {
      prompt,
      image_url: imageUrl,
      duration,
      resolution: WAN_RESOLUTION,
      negative_prompt: "low resolution, error, worst quality, low quality, defects, text, watermark",
      // Our storyboard already writes director-grade motion prompts.
      enable_prompt_expansion: false,
    });
    const out = data as VideoOutput;
    const url = out.video?.url;
    if (!url) throw new Error("fal wan: no video returned");
    const perSec = FAL_PRICES.wanUsdPerSec[WAN_RESOLUTION] ?? FAL_PRICES.wanUsdPerSec["720p"];
    return {
      filePath: await download(url, "clips", ".mp4"),
      realCostUsd: Number((seconds * perSec).toFixed(4)),
      provider: "fal",
      model: `${FAL_MODELS.videoStandard} (${WAN_RESOLUTION}, ${duration}s)`,
      meta: { prompt, requestId, sourceUrl: url, durationSeconds: seconds, seed: out.seed },
    };
  },
};

export const falTts: TtsProvider = {
  async synthesize({ text, voiceId, language }): Promise<MediaResult> {
    ensureClient();
    const languageBoost = language === "fr" ? "French" : language === "he" ? "Hebrew" : "English";
    const { data, requestId } = await subscribe(FAL_MODELS.tts, {
      text,
      voice_setting: {
        voice_id: VOICE_MAP[voiceId] ?? VOICE_MAP["narrator-en-1"],
        speed: 1,
        vol: 1,
        pitch: 0,
        english_normalization: language === "en",
      },
      // Numeric enums (strings are rejected with a 422).
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 },
      language_boost: languageBoost,
      output_format: "url",
    });
    const out = data as TtsOutput;
    const url = out.audio?.url;
    if (!url) throw new Error("fal minimax tts: no audio returned");
    return {
      filePath: await download(url, "voice", ".mp3"),
      realCostUsd: Number(((text.length / 1000) * FAL_PRICES.ttsUsdPer1000Chars).toFixed(4)),
      provider: "fal",
      model: FAL_MODELS.tts,
      meta: { requestId, sourceUrl: url, characters: text.length, durationMs: out.duration_ms, voice: VOICE_MAP[voiceId] },
    };
  },
};

export const falCutout: CutoutProvider = {
  async generateCutout({ prompt }): Promise<MediaResult> {
    ensureClient();
    const gen = await subscribe(FAL_MODELS.image, {
      prompt,
      aspect_ratio: "1:1",
      resolution: "1K",
      output_format: "png",
      num_images: 1,
    });
    const rawUrl = (gen.data as ImageOutput).images?.[0]?.url;
    if (!rawUrl) throw new Error("fal nano-banana-pro: no image returned for cut-out");
    const cut = await subscribe(FAL_MODELS.removeBackground, { image_url: rawUrl });
    const url = (cut.data as { image?: { url: string } }).image?.url;
    if (!url) throw new Error("fal bria: no cut-out returned");
    return {
      filePath: await download(url, "cutouts", ".png"),
      realCostUsd: Number((FAL_PRICES.imageUsd + FAL_PRICES.removeBackgroundUsd).toFixed(4)),
      provider: "fal",
      model: `${FAL_MODELS.image} + ${FAL_MODELS.removeBackground}`,
      meta: { prompt, requestId: gen.requestId, sourceUrl: url, rawUrl },
    };
  },
};

type WhisperOutput = { text: string; chunks?: Array<{ text: string; timestamp: [number, number] }> };

export const falTranscribe: TranscribeProvider = {
  async transcribe({ audioPath, language }) {
    ensureClient();
    const audioUrl = await uploadLocal(audioPath);
    const { data } = await subscribe(FAL_MODELS.whisper, {
      audio_url: audioUrl,
      task: "transcribe",
      language,
      chunk_level: "word",
    });
    const out = data as WhisperOutput;
    const words: WordTiming[] = (out.chunks ?? [])
      .map((c) => ({ word: c.text.trim(), start: c.timestamp?.[0] ?? 0, end: c.timestamp?.[1] ?? 0 }))
      .filter((w) => w.word.length > 0);
    return { words, realCostUsd: FAL_PRICES.whisperUsd, provider: "fal", model: FAL_MODELS.whisper };
  },
};
