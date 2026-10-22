import { referenceSheetPreparations } from "./reference-sheet-preparation";
import { characterSheetPrompt } from "./cast-preparation";
import { characterSheetBlockers, type CharacterReference } from "./character-sheet-policy";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { ConceptBoard, ConceptTiming } from "./types";
import type { ProductionParams } from "../brain";
import { CAM_VOICE } from "./cam-voice";
import { ALIGNMENT_ENDPOINT, TranscriptionRequest } from "./transcription";
import { videoRequestSeconds, KLING_TURBO, SEEDANCE, SEEDANCE_COMPLETE, MINIMAX, HF_SEEDANCE, HF_MINIMAX, isHiggsfieldVideo, VideoModelSchema, type VideoModels } from "./model-selection";
import { changesState, physicalDirectionIssues } from "./physical-direction";

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

export const TurboVideoRequestSchema = z.object({
  prompt: z.string().min(1), image_url: mediaUrl,
  duration: z.string().refine((d) => /^(?:[3-9]|1[0-5])$/.test(d)),
}).strict();
export function parseVideoRequest(model: string, input: Record<string, unknown>) {
  if (model === SEEDANCE_COMPLETE) return z.object({draft_id:z.string().min(1),resolution:z.literal("1080p"),codec:z.literal("H264")}).strict().parse(input);
  VideoModelSchema.parse(model);
  if (model === SEEDANCE) return z.object({prompt:z.string().min(1),image_url:mediaUrl,end_image_url:mediaUrl.optional(),duration:z.string().regex(/^(?:[4-9]|1[0-5])$/),resolution:z.enum(["480p","1080p"]),draft:z.boolean(),generate_audio:z.literal(false),aspect_ratio:z.literal("auto"),codec:z.literal("H264"),bitrate_mode:z.literal("standard")}).strict().parse(input);
  if (model === MINIMAX) return z.object({prompt:z.string().min(1),image_url:mediaUrl,end_image_url:mediaUrl.optional(),duration:z.number().int().min(5).max(15),resolution:z.literal("768P"),prompt_expansion_mode:z.literal("disabled")}).strict().parse(input);
  if (isHiggsfieldVideo(model)) {
    if (input.draft_job_id) return z.object({model:z.literal(HF_SEEDANCE),draft_job_id:z.string().min(1),resolution:z.literal("1080p"),count:z.literal(1)}).strict().parse(input);
    return z.object({model:z.enum([HF_SEEDANCE,HF_MINIMAX]),prompt:z.string().min(1),duration:z.number().int().min(4).max(15),resolution:z.enum(["480p","1080p","2K"]),count:z.literal(1),aspect_ratio:z.literal("auto"),start_image_url:mediaUrl,end_image_url:mediaUrl.optional(),mode:z.literal("omni_reference").optional(),draft:z.boolean().optional(),generate_audio:z.literal(false).optional(),bitrate_mode:z.literal("standard").optional()}).strict().parse(input);
  }
  return model === KLING_TURBO ? TurboVideoRequestSchema.parse(input) : VideoRequestSchema.parse(input);
}

type Reference = CharacterReference;
export type VoiceEvidence = { audioSha256: string; alignmentSha256: string; source: "simulation" | "reviewed" };
export type GenerationOperation = {
  id: string; fingerprint: string; kind: "voice" | "alignment" | "image" | "video";
  transport: "higgsfield-mcp" | "fal-queue"; model: string; scene: number | null;
  dependsOn: string[]; gates: string[]; input: Record<string, unknown>;
  // Keys identify exact locked references or prior outputs, never guessed URLs.
  bindings: Record<string, string | string[]>;
};

/** No network or SDK imports. A plan is never a budget authorization. */
export function generationPlan(script: string, params: ProductionParams, board: ConceptBoard, timing: ConceptTiming, references: Reference[], voiceEvidence?: VoiceEvidence, videoModels?: VideoModels) {
  const operations: GenerationOperation[] = [];
  const blockers = ["Paid execution disabled", "Review scene directions", "Review new Bram reading and pacing", "Align the final voice before fixing clip durations", "Approve keyframes before animation", "Human approval of the complete storyboard and narrative meaning", "Approve a complete provider quote and budget"];
  const add = (op: Omit<GenerationOperation, "fingerprint">) => {
    const parents = op.dependsOn.map((id) => {
      const parent = operations.find((item) => item.id === id);
      if (!parent) throw new Error(`Missing operation dependency: ${id}`);
      return parent.fingerprint;
    });
    const fingerprint = createHash("sha256").update(JSON.stringify({ op, references, parents, ...(op.kind === "alignment" || op.kind === "video" ? { voiceEvidence } : {}) })).digest("hex");
    operations.push({ ...op, fingerprint });
  };
  add({ id: "voice", kind: "voice", transport: "higgsfield-mcp", model: CAM_VOICE.model, scene: null, dependsOn: [],
    gates: ["script-review", "voice-settings-review", "paid-budget"], bindings: {},
    input: { model: CAM_VOICE.model, prompt: script, voice_type: CAM_VOICE.voiceType, voice_id: CAM_VOICE.voiceId,
      variant: CAM_VOICE.variant, count: 1 },
  });
  add({ id: "voice-alignment", kind: "alignment", transport: "fal-queue", model: ALIGNMENT_ENDPOINT, scene: null,
    dependsOn: ["voice"], gates: ["verified-voice-file", "paid-budget"],
    input: { task: "transcribe", chunk_level: "word", diarize: false }, bindings: { audio_url: "output:voice" } });
  const referenceSheets = referenceSheetPreparations(params, references, board.shots.filter(s=>!params.sceneMedia?.[s.index]).flatMap(s=>s.references));
  for (const sheet of referenceSheets) add({id:sheet.id,kind:"image",transport:"fal-queue",model:IMAGE_ENDPOINT,scene:null,dependsOn:[],gates:["paid-budget"],
    input:{prompt:sheet.prompt,aspect_ratio:"16:9",resolution:"2K",output_format:"png",num_images:1,limit_generations:true},bindings:{image_urls:[`reference:${sheet.reference}`]}});
  const reusedScenes: number[] = [];
  for (const shot of board.shots) {
    if (params.sceneMedia?.[shot.index]) { reusedScenes.push(shot.index); continue; }
    const id = `scene-${shot.index}`;
    const refs = shot.references.map((key) => {
      if (!references.some((ref) => ref.id === key)) throw new Error(`Missing locked reference: ${key}`);
      const sheet=referenceSheets.find(s=>s.reference===key);
      return sheet ? `output:${sheet.id}` : `reference:${key}`;
    });
    const referenceRoles = (offset: number) => shot.references.map((ref, i) => `Image ${i + offset}: locked ${ref} identity and material only.`).join(" ");
    const castIds=shot.preparedCast?.characters.map((person,index)=>{
      add({id:person.id,kind:"image",transport:"fal-queue",model:IMAGE_ENDPOINT,scene:shot.index,dependsOn:shot.references.flatMap(key=>referenceSheets.filter(s=>s.reference===key).map(s=>s.id)),gates:["paid-budget"],
        input:{prompt:characterSheetPrompt(shot.preparedCast!,index),aspect_ratio:"16:9",resolution:"2K",output_format:"png",num_images:1,limit_generations:true},bindings:{image_urls:refs}});
      return person.id;
    })??[];
    const sceneRefs=[...refs,...castIds.map(id=>`output:${id}`)];
    const castRoles=(offset:number)=>shot.preparedCast?.characters.map((person,index)=>`Image ${refs.length+index+offset}: exact identity sheet for ${person.role} ${index+1}; use their face, body and wardrobe, never the sheet layout.`).join(" ")??"";
    const imageInput = { prompt: `${referenceRoles(1)}${castIds.length?` ${castRoles(1)}`:""} Only depict the characters explicitly described in the scene. ${shot.imagePrompt}`, aspect_ratio: params.aspectRatio, resolution: "2K", output_format: "png", num_images: 1, limit_generations: true };
    add({ id: `${id}-start`, kind: "image", transport: "fal-queue", model: IMAGE_ENDPOINT, scene: shot.index,
      dependsOn: [...shot.references.flatMap(key=>referenceSheets.filter(s=>s.reference===key).map(s=>s.id)),...castIds], gates: ["scene-review", "paid-budget"], input: imageInput, bindings: { image_urls: sceneRefs } });
    if (shot.endImagePrompt) add({ id: `${id}-end`, kind: "image", transport: "fal-queue", model: IMAGE_ENDPOINT, scene: shot.index,
      dependsOn: [`${id}-start`], gates: ["start-frame-review", "paid-budget"], input: { ...imageInput, prompt: `Image 1: approved start frame, preserve its camera, composition and lighting. ${referenceRoles(2)}${castIds.length?` ${castRoles(2)}`:""} ${shot.endImagePrompt}` },
      bindings: { image_urls: [`output:${id}-start`, ...sceneRefs] } });
    // Typography-first scenes are composed locally from the approved image.
    // Existing jobs retain their original billed request graph.
    if(params.productionMethod==="whimsical-v1"&&shot.visualMode==="presenter-text")continue;
    // Keep the planned action length stable before/after voice alignment.
    // The montage adds local holds for pauses/tails without buying extra animation.
    const issues = physicalDirectionIssues(shot);
    blockers.push(...issues.map((issue) => `Scene ${shot.index}: ${issue}`));
    const seconds = Math.max(changesState(shot) ? 4 : 3, Math.ceil(shot.actionSeconds ?? shot.clipSeconds));
    if (seconds > 15) blockers.push(`Scene ${shot.index} lasts ${seconds}s: split it before animation (15s maximum)`);
    const selected = videoModels ? VideoModelSchema.parse(videoModels[`${id}-clip`]) : VIDEO_ENDPOINT;
    add({ id: `${id}-clip`, kind: "video", transport: isHiggsfieldVideo(selected) ? "higgsfield-mcp" : "fal-queue", model: selected, scene: shot.index,
      dependsOn: ["voice-alignment", `${id}-start`, ...(shot.endImagePrompt ? [`${id}-end`] : [])],
      gates: ["final-voice-alignment", "keyframe-review", "human-storyboard-review", "paid-budget", ...(changesState(shot) ? ["state-change-end-frame"] : []), ...(issues.length ? ["correct-physical-direction"] : []), ...(seconds > 15 ? ["split-scene"] : [])],
      input: { prompt: shot.motionPrompt, duration: String(videoRequestSeconds(selected,seconds)), generate_audio: false },
      bindings: { start_image_url: `output:${id}-start`, ...(shot.endImagePrompt ? { end_image_url: `output:${id}-end` } : {}) } });
  }
  const reusedVoice = params.useImportedNarration && params.narration && voiceEvidence?.source === "reviewed" && voiceEvidence.audioSha256 === params.narration.audio.sha256
    ? { id: params.narration.id, audioSha256: voiceEvidence.audioSha256, alignmentSha256: voiceEvidence.alignmentSha256, declaredSpeaker: params.narration.speaker, reviewId: params.narration.reviews.at(-1)?.id, identityVerified: false } : null;
  const sheetBlockers = characterSheetBlockers(board.shots.filter(shot=>!params.sceneMedia?.[shot.index]).map(shot=>({...shot,references:shot.references.filter(key=>!referenceSheets.some(s=>s.reference===key))})),references);
  blockers.push(...sheetBlockers);
  if(sheetBlockers.length)for(const operation of operations)operation.gates.push("approved-character-sheet");
  const content = { script, aspectRatio: params.aspectRatio, board, references, operations, importedMedia: params.sceneMedia ?? {}, ...(reusedVoice ? { reusedVoice } : {}) };
  return {
    version: 1, mode: "planning-only", canExecute: false, costUsd: 0, liveQuote: null,
    fingerprint: createHash("sha256").update(JSON.stringify(content)).digest("hex"),
    voice: CAM_VOICE, voiceEvidence: voiceEvidence ?? null, timingBasis: voiceEvidence?.source === "reviewed" ? "reviewed-voice-alignment" : voiceEvidence ? "simulation-alignment" : "provisional-not-final-voice",
    modelNeeds: board.shots.filter(shot => !params.sceneMedia?.[shot.index]&&!(params.productionMethod==="whimsical-v1"&&shot.visualMode==="presenter-text")).map(shot => ({
      operation: `scene-${shot.index}-clip`, scene: shot.index,
      seconds: Number(operations.find(op => op.id === `scene-${shot.index}-clip`)!.input.duration),
      endFrame: Boolean(shot.endImagePrompt),
      complex: shot.motionComplexity ? shot.motionComplexity === "complex" : changesState({ ...shot, endScene: null }) || shot.references.length !== 1 || (shot.preparedCast?.characters.length??0)>1,
      localText: Boolean(shot.overlay) || shot.visualMode === "presenter-text",
    })),
    blockers, references, reusedScenes, reusedVoice, importedMedia: params.sceneMedia ?? {}, operations,
  } as const;
}

/** Pure contract check for the future transport. Does not upload, submit or charge. */
export function materializeRequest(operation: GenerationOperation, urls: Record<string, string>) {
  if(operation.gates.includes("approved-character-sheet"))throw new Error("A character sheet requires human approval before generation.");
  if (operation.gates.includes("correct-physical-direction")) throw new Error("Correct the physical action and its start/end states before generation.");
  const input = { ...operation.input };
  for (const [field, binding] of Object.entries(operation.bindings)) {
    const resolve = (key: string) => {
      if (!urls[key]) throw new Error(`Unresolved media binding: ${key}`);
      return mediaUrl.parse(urls[key]);
    };
    input[field] = Array.isArray(binding) ? binding.map(resolve) : resolve(binding);
  }
  if (operation.kind === "image") return ImageRequestSchema.parse(input);
  if (operation.kind === "video") {
    if (operation.gates.includes("state-change-end-frame") && !input.end_image_url && !input.draft_job_id && operation.model !== SEEDANCE_COMPLETE) throw new Error("A change of state requires its approved end image.");
    if (input.draft_job_id || operation.model === SEEDANCE_COMPLETE) return parseVideoRequest(operation.model, input);
    if (isHiggsfieldVideo(operation.model)) {
      const seedance = operation.model === HF_SEEDANCE;
      return parseVideoRequest(operation.model, {model:operation.model,prompt:input.prompt,duration:Number(input.duration),resolution:seedance ? input.draft ? "480p" : "1080p" : "2K",count:1,aspect_ratio:"auto",start_image_url:input.start_image_url,...(input.end_image_url ? {end_image_url:input.end_image_url}:{}),...(seedance ? {mode:"omni_reference",draft:input.draft===true,generate_audio:false,bitrate_mode:"standard"}:{})});
    }
    if (operation.model === SEEDANCE || operation.model === MINIMAX) return parseVideoRequest(operation.model, {prompt:input.prompt,image_url:input.start_image_url,...(input.end_image_url ? {end_image_url:input.end_image_url}:{}),duration:operation.model===MINIMAX ? Number(input.duration):input.duration,...(operation.model===MINIMAX ? {resolution:"768P",prompt_expansion_mode:"disabled"}:{resolution:input.draft ? "480p":"1080p",draft:input.draft===true,generate_audio:false,aspect_ratio:"auto",codec:"H264",bitrate_mode:"standard"})});
    if (operation.model === KLING_TURBO) {
      if (input.end_image_url) throw new Error("Turbo does not support the required end frame.");
      const checked = VideoRequestSchema.parse(input);
      return parseVideoRequest(operation.model, {prompt: checked.prompt, image_url: checked.start_image_url, duration: checked.duration});
    }
    return parseVideoRequest(operation.model, input);
  }
  if (operation.kind === "alignment") return TranscriptionRequest.parse(input);
  return BramRequestSchema.parse(input);
}
