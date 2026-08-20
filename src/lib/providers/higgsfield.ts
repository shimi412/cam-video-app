/**
 * Higgsfield provider — TEMPORARY testing backend, never shipped to the client.
 * Talks to the Higgsfield MCP server (https://mcp.higgsfield.ai/mcp) through
 * mcp-remote, which handles OAuth on Shimon's account. Real media comes out of
 * the pipeline while fal.ai is not wired yet.
 *
 * Budget rule (Shimon, 2026-08-20): stay on the economical models so the real
 * cost per video stays inside the devis targets — Seedance 2.5 720p without
 * audio for BOTH tiers, Nano Banana for keyframes, Seed Audio for voice.
 * Metering keeps reporting fal-equivalent USD costs so the client-price
 * simulation stays coherent; actual Higgsfield credits go in meta.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  ImageGenProvider,
  VideoGenProvider,
  TtsProvider,
  MediaResult,
} from "./types";

const STORAGE = path.join(process.cwd(), "storage");
const MCP_URL = "https://mcp.higgsfield.ai/mcp";

const MODELS = {
  image: "nano_banana_pro",
  video: "seedance_2_5", // both tiers during Higgsfield testing (budget rule)
  audio: "seed_audio",
};

// App voice ids → Higgsfield preset voices (from list_voices).
const VOICE_MAP: Record<string, string> = {
  "narrator-en-1": "e2a2d2e6-9ed2-59cd-82af-feaa27f8a678", // Grady, male
  "narrator-en-2": "731b4ffe-e95e-59f4-8c00-81608936091f", // Ainsley, female
};

// Fal-equivalent costs so the economics simulation stays aligned with the devis.
const FAL_EQUIVALENT = {
  imageUsd: 0.13,
  videoUsdPerSec: 0.1,
  ttsUsdPerMinute: 0.1,
};

type McpGlobal = { __higgsfieldClient?: Promise<Client> };
const globalRef = globalThis as unknown as McpGlobal;

async function getClient(): Promise<Client> {
  if (!globalRef.__higgsfieldClient) {
    globalRef.__higgsfieldClient = (async () => {
      const client = new Client({ name: "cam-video-app", version: "0.1.0" });
      const transport = new StdioClientTransport({
        command: "npx",
        args: ["-y", "mcp-remote@latest", MCP_URL],
        env: { ...process.env } as Record<string, string>,
      });
      await client.connect(transport);
      return client;
    })();
    globalRef.__higgsfieldClient.catch(() => {
      globalRef.__higgsfieldClient = undefined;
    });
  }
  return globalRef.__higgsfieldClient;
}

async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const client = await getClient();
  const res = await client.callTool({ name, arguments: args });
  const content = (res.content as Array<{ type: string; text?: string }> | undefined) ?? [];
  const text = content.find((c) => c.type === "text")?.text;
  if (res.isError) throw new Error(`Higgsfield ${name} failed: ${text ?? "unknown error"}`);
  // The server renders human text in content and the machine shape in structuredContent.
  if (res.structuredContent) return res.structuredContent as T;
  if (!text) throw new Error(`Higgsfield ${name}: empty response`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Higgsfield ${name}: unparseable response: ${text.slice(0, 200)}`);
  }
}

type BatchSubmit = {
  jobs: Array<{ index: number; job_id: string; status: string }>;
  failed_count: number;
};
type WaitResult = {
  jobs: Array<{ index: number; job_id: string; status: string; result_url?: string }>;
  all_terminal: boolean;
  poll_after_seconds?: number;
};

async function submitAndWait(
  tool: "generate_image_batch" | "generate_video_batch" | "generate_audio_batch",
  params: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ url: string; jobId: string }> {
  const submit = await callTool<BatchSubmit>(tool, {
    requests: [{ index: 0, params }],
  });
  const job = submit.jobs?.[0];
  if (!job || submit.failed_count > 0) {
    throw new Error(`Higgsfield ${tool}: submission failed (${JSON.stringify(submit)})`);
  }

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const wait = await callTool<WaitResult>("jobs_wait", {
      jobs: [{ index: 0, job_id: job.job_id }],
      timeout_seconds: 15,
    });
    const state = wait.jobs?.[0];
    if (state?.status === "completed" && state.result_url) {
      return { url: state.result_url, jobId: job.job_id };
    }
    if (state && ["failed", "canceled", "nsfw", "error"].includes(state.status)) {
      throw new Error(`Higgsfield job ${job.job_id} ended as ${state.status}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`Higgsfield job ${job.job_id} timed out`);
    }
    await new Promise((r) => setTimeout(r, (wait.poll_after_seconds ?? 5) * 1000));
  }
}

async function download(url: string, subDir: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  const ext = path.extname(new URL(url).pathname) || ".bin";
  const dir = path.join(STORAGE, subDir);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${randomUUID()}${ext}`);
  await writeFile(filePath, Buffer.from(await res.arrayBuffer()));
  return filePath;
}

export const higgsfieldImage: ImageGenProvider = {
  async generateImage({ prompt, aspectRatio }): Promise<MediaResult> {
    const { url, jobId } = await submitAndWait(
      "generate_image_batch",
      { model: MODELS.image, prompt, aspect_ratio: aspectRatio },
      5 * 60_000,
    );
    return {
      filePath: await download(url, "images"),
      realCostUsd: FAL_EQUIVALENT.imageUsd,
      provider: "higgsfield",
      model: MODELS.image,
      meta: { prompt, jobId, sourceUrl: url, credits: 2 },
    };
  },
};

export const higgsfieldVideo: VideoGenProvider = {
  async generateClip({ prompt, keyframeRef, durationSeconds, tier }): Promise<MediaResult> {
    if (!keyframeRef) {
      throw new Error("Higgsfield video needs the keyframe generation jobId (keyframeRef).");
    }
    const { url, jobId } = await submitAndWait(
      "generate_video_batch",
      {
        model: MODELS.video,
        prompt,
        duration: durationSeconds,
        aspect_ratio: "16:9",
        resolution: "720p",
        generate_audio: false,
        mode: "omni_reference",
        medias: [{ value: keyframeRef, role: "start_image" }],
      },
      15 * 60_000,
    );
    return {
      filePath: await download(url, "clips"),
      realCostUsd: Number((durationSeconds * FAL_EQUIVALENT.videoUsdPerSec).toFixed(4)),
      provider: "higgsfield",
      model: `${MODELS.video} (tier ${tier} capped to 720p during testing)`,
      meta: { prompt, jobId, sourceUrl: url, credits: 32.5 },
    };
  },
};

export const higgsfieldTts: TtsProvider = {
  async synthesize({ text, voiceId }): Promise<MediaResult> {
    const { url, jobId } = await submitAndWait(
      "generate_audio_batch",
      {
        model: MODELS.audio,
        prompt: text,
        voice_type: "preset",
        voice_id: VOICE_MAP[voiceId] ?? VOICE_MAP["narrator-en-1"],
      },
      5 * 60_000,
    );
    const seconds = Math.max(1, Math.round(text.length / 15));
    return {
      filePath: await download(url, "voice"),
      realCostUsd: Number(((seconds / 60) * FAL_EQUIVALENT.ttsUsdPerMinute).toFixed(4)),
      provider: "higgsfield",
      model: MODELS.audio,
      meta: { jobId, sourceUrl: url, credits: 0.1, characters: text.length },
    };
  },
};
