import { createHash } from "node:crypto";
import { z } from "zod";
import type { ConceptBoard, ConceptTiming } from "./types";
import type { ProductionParams } from "../brain";
import { CAM_VOICE } from "./cam-voice";

export const IMAGE_ENDPOINT = "fal-ai/nano-banana-pro/edit";
export const VIDEO_ENDPOINT = "fal-ai/kling-video/v3/pro/image-to-video";
const mediaUrl = z.url().refine((value) => new URL(value).protocol === "https:", "A hosted HTTPS media URL is required.");
export const BramRequestSchema = z.object({
  model: z.literal("text2speech_v2"), variant: z.literal("elevenlabs"),
  voice_type: z.literal("preset"), voice_id: z.literal("549ff70a-3ee7-4f04-a4d9-89a24fab7709"),
  prompt: z.string().min(1).max(6000), count: z.literal(1),
}).strict();
export const ImageRequestSchema = z.object({
  prompt: z.string().min(1), image_urls: z.array(mediaUrl).min(1),
  aspect_ratio: z.enum(["9:16", "16:9", "1:1"]), resolution: z.literal("2K"),
  output_format: z.literal("png"), num_images: z.literal(1), limit_generations: z.literal(true),
}).strict();
export const VideoRequestSchema = z.object({
  prompt: z.string().min(1), start_image_url: mediaUrl, end_image_url: mediaUrl.optional(),
  duration: z.string().refine((d) => /^(?:[3-9]|1[0-5])$/.test(d)), generate_audio: z.literal(false),
}).strict();

type Reference = { id: string; url: string; sha256: string };
export type GenerationOperation = {
  id: string; fingerprint: string; kind: "voice" | "image" | "video";
  transport: "higgsfield-mcp" | "fal-queue"; model: string; scene: number | null;
  dependsOn: string[]; gates: string[]; input: Record<string, unknown>;
  // Keys identify exact locked references or prior outputs, never guessed URLs.
  bindings: Record<string, string | string[]>;
};

/** No network or SDK imports. A plan is never a budget authorization. */
export function generationPlan(script: string, params: ProductionParams, board: ConceptBoard, timing: ConceptTiming, references: Reference[]) {
  const operations: GenerationOperation[] = [];
  const blockers = ["Paid execution disabled", "Review scene directions", "Review new Bram reading and pacing", "Align the final voice before fixing clip durations", "Approve keyframes before animation", "Approve a complete provider quote and budget"];
  const add = (op: Omit<GenerationOperation, "fingerprint">) => {
    const parents = op.dependsOn.map((id) => {
      const parent = operations.find((item) => item.id === id);
      if (!parent) throw new Error(`Missing operation dependency: ${id}`);
      return parent.fingerprint;
    });
    const fingerprint = createHash("sha256").update(JSON.stringify({ op, references, parents })).digest("hex");
    operations.push({ ...op, fingerprint });
  };
  add({ id: "voice", kind: "voice", transport: "higgsfield-mcp", model: CAM_VOICE.model, scene: null, dependsOn: [],
    gates: ["script-review", "voice-settings-review", "paid-budget"], bindings: {},
    input: { model: CAM_VOICE.model, prompt: script, voice_type: CAM_VOICE.voiceType, voice_id: CAM_VOICE.voiceId,
      variant: CAM_VOICE.variant, count: 1 },
  });
  const reusedScenes: number[] = [];
  for (const shot of board.shots) {
    if (params.sceneMedia?.[shot.index]) { reusedScenes.push(shot.index); continue; }
    const id = `scene-${shot.index}`;
    const refs = shot.references.map((key) => {
      if (!references.some((ref) => ref.id === key)) throw new Error(`Missing locked reference: ${key}`);
      return `reference:${key}`;
    });
    const referenceRoles = (offset: number) => shot.references.map((ref, i) => `Image ${i + offset}: locked ${ref} identity and material only.`).join(" ");
    const imageInput = { prompt: `${referenceRoles(1)} Only depict the characters explicitly described in the scene. ${shot.imagePrompt}`, aspect_ratio: params.aspectRatio, resolution: "2K", output_format: "png", num_images: 1, limit_generations: true };
    add({ id: `${id}-start`, kind: "image", transport: "fal-queue", model: IMAGE_ENDPOINT, scene: shot.index,
      dependsOn: [], gates: ["scene-review", "paid-budget"], input: imageInput, bindings: { image_urls: refs } });
    if (shot.endImagePrompt) add({ id: `${id}-end`, kind: "image", transport: "fal-queue", model: IMAGE_ENDPOINT, scene: shot.index,
      dependsOn: [`${id}-start`], gates: ["start-frame-review", "paid-budget"], input: { ...imageInput, prompt: `Image 1: approved start frame, preserve its camera, composition and lighting. ${referenceRoles(2)} ${shot.endImagePrompt}` },
      bindings: { image_urls: [`output:${id}-start`, ...refs] } });
    // Use the full montage interval, including lead-in, pauses and tail.
    const seconds = Math.max(3, Math.ceil((timing.phrases[shot.index]?.start ?? timing.duration) - (shot.index === 1 ? 0 : timing.phrases[shot.index - 1].start)));
    if (seconds > 15) blockers.push(`Scene ${shot.index} lasts ${seconds}s: split it before animation (15s maximum)`);
    add({ id: `${id}-clip`, kind: "video", transport: "fal-queue", model: VIDEO_ENDPOINT, scene: shot.index,
      dependsOn: ["voice", `${id}-start`, ...(shot.endImagePrompt ? [`${id}-end`] : [])],
      gates: ["final-voice-alignment", "keyframe-review", "paid-budget", ...(seconds > 15 ? ["split-scene"] : [])],
      input: { prompt: shot.motionPrompt, duration: String(seconds), generate_audio: false },
      bindings: { start_image_url: `output:${id}-start`, ...(shot.endImagePrompt ? { end_image_url: `output:${id}-end` } : {}) } });
  }
  const content = { script, aspectRatio: params.aspectRatio, board, references, operations, importedMedia: params.sceneMedia ?? {} };
  return {
    version: 1, mode: "planning-only", canExecute: false, costUsd: 0, liveQuote: null,
    fingerprint: createHash("sha256").update(JSON.stringify(content)).digest("hex"),
    voice: CAM_VOICE, timingBasis: "provisional-not-final-voice",
    blockers, references, reusedScenes, importedMedia: params.sceneMedia ?? {}, operations,
  } as const;
}

/** Pure contract check for the future transport. Does not upload, submit or charge. */
export function materializeRequest(operation: GenerationOperation, urls: Record<string, string>) {
  const input = { ...operation.input };
  for (const [field, binding] of Object.entries(operation.bindings)) {
    const resolve = (key: string) => {
      if (!urls[key]) throw new Error(`Unresolved media binding: ${key}`);
      return mediaUrl.parse(urls[key]);
    };
    input[field] = Array.isArray(binding) ? binding.map(resolve) : resolve(binding);
  }
  if (operation.kind === "image") return ImageRequestSchema.parse(input);
  if (operation.kind === "video") return VideoRequestSchema.parse(input);
  return BramRequestSchema.parse(input);
}
