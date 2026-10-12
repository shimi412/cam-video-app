import { mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import type { Recipe } from "../recipes";
import type { ProductionParams } from "../brain";
import type { MediaResult } from "../providers/types";
import { isSimulation } from "../providers/mode";
import { planConcept } from "./storyboard";
import { placeholderTiming } from "./timing";
import { writeMontage } from "./montage";
import { controls, validateTiming } from "./controls";
import { renderConcept, silentVoice } from "./render";
import { lockedAssets } from "./assets";
import { saveSheet, type SheetEntry } from "../sheet";

export async function produceConcept(input: {
  jobId: string; script: string; params: ProductionParams; recipe: Recipe;
  meter: (kind: "image" | "video" | "tts" | "render", media: MediaResult) => Promise<void>;
  setStep: (key: string, status: "pending" | "running" | "done" | "failed") => Promise<void>;
}) {
  if (!isSimulation()) throw new Error("CAM Clay is preview-only until its voice, storyboard and paid pipeline are approved.");
  const { jobId, script, params, recipe, setStep } = input;
  const root = path.join(process.cwd(), "storage/concepts", jobId);
  const outputPath = path.join(process.cwd(), "storage/outputs", `${jobId}.mp4`);
  await mkdir(path.join(root, "assets"), { recursive: true });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await setStep("storyboard", "running");
  const references = await lockedAssets();
  const board = planConcept(script, recipe, params.aspectRatio);
  await writeFile(path.join(root, "storyboard.json"), JSON.stringify(board, null, 2));
  await writeFile(path.join(root, "references.json"), JSON.stringify(references.map(({ id, path: assetPath, sha256 }) => ({ id, path: assetPath, sha256 })), null, 2));
  await setStep("storyboard", "done");
  await setStep("voice", "running");
  const timing = placeholderTiming(board.shots.map((s) => s.narration));
  await writeFile(path.join(root, "timing.json"), JSON.stringify(timing, null, 2));
  await silentVoice(path.join(root, "assets/narration.wav"), timing.duration);
  await setStep("voice", "done");
  const sheet: SheetEntry[] = [{ step: 1, kind: "tts", falModel: "fal-ai/elevenlabs/tts/eleven-v3", higgsfieldEquivalent: "ElevenLabs voice-over", prompt: script, durationSeconds: timing.duration, notes: "Planning only. Dylan voice ID remains unverified. Preview audio is silent; timings are estimates." }];
  await setStep("keyframes", "running");
  for (const shot of board.shots) {
    const refs = references.filter((r) => shot.references.includes(r.id as "narrator" | "monster" | "effigy"));
    sheet.push({ step: sheet.length+1, kind: "image", falModel: "fal-ai/nano-banana-pro/edit", higgsfieldEquivalent: "Nano Banana Pro 2K", prompt: shot.imagePrompt, aspectRatio: params.aspectRatio, referenceUrl: refs[0].url, notes: `Shot ${shot.index}; locked references: ${refs.map((r)=>`${r.url} (sha256 ${r.sha256})`).join(", ")}. Image approval required before animation.` });
    if (shot.endImagePrompt) sheet.push({ step: sheet.length+1, kind: "image", falModel: "fal-ai/nano-banana-pro/edit", higgsfieldEquivalent: "Nano Banana Pro 2K end frame", prompt: shot.endImagePrompt, aspectRatio: params.aspectRatio, notes: `End frame for shot ${shot.index}. Use that shot's approved start image as reference.` });
  }
  await setStep("keyframes", "done");
  await setStep("clips", "running");
  for (const shot of board.shots) sheet.push({ step: sheet.length+1, kind: "video", falModel: "fal-ai/kling-video/v3/pro/image-to-video", higgsfieldEquivalent: "Kling 3.0 Pro", prompt: shot.motionPrompt, durationSeconds: shot.clipSeconds, aspectRatio: params.aspectRatio, notes: `Shot ${shot.index}; start_image_url = its approved keyframe; ${shot.endImagePrompt ? "end_image_url = its approved end frame; " : ""}generate_audio = false. No request sent.` });
  await setStep("clips", "done");
  const sheetUrl = await saveSheet(jobId, sheet);
  await setStep("montage", "running");
  const composition = await writeMontage(root, board, timing, params.aspectRatio);
  validateTiming(timing, composition.captions);
  await renderConcept(root, outputPath);
  await controls(outputPath, root, composition.cues.map((s)=>s.start), composition.width, composition.height, timing.duration);
  await copyFile(outputPath, path.join(root, "preview.mp4"));
  await input.meter("render", { filePath: outputPath, realCostUsd: 0, provider: "hyperframes", model: "concept-placeholder-preview", meta: { estimatedTiming: true, visualApproval: false } });
  await setStep("montage", "done");
  const url = (file: string) => `/api/media/concepts/${jobId}/${file}`;
  return { outputPath, durationSeconds: timing.duration, board, sheet, sheetUrl, artifacts: [
    { label: "Storyboard", url: url("storyboard.json") },
    { label: "Shot contact sheet", url: url("controls/shots.png") },
    ...(board.shots.length > 1 ? [{ label: "Transition contact sheet", url: url("controls/transitions.png") }] : []),
    { label: "Timing", url: url("timing.json") }, { label: "Quality checks", url: url("controls/report.json") },
    { label: "Download preview", url: url("preview.mp4") },
  ] };
}
