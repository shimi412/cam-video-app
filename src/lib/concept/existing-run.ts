import { mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import type { produceConcept } from "./run";
import { assertExistingSelection, verifyExistingAssets, existingMediaSummary, demoTiming, DEMO_DURATION, wordTimingRepairs } from "./existing";
import { writeExistingMontage } from "./existing-montage";
import { lockedAssets } from "./assets";
import { planConcept } from "./storyboard";
import { validateTiming, controls } from "./controls";
import { renderConcept } from "./render";
import { saveSheet, type SheetEntry } from "../sheet";
import type { Caption } from "./montage";

export function subtitleFile(captions: Caption[], kind: "vtt" | "srt") {
  const stamp = (seconds: number) => {
    const ms = Math.round(seconds * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}${kind === "vtt" ? "." : ","}${String(ms % 1000).padStart(3, "0")}`;
  };
  return (kind === "vtt" ? "WEBVTT\n\n" : "") + captions.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join("\n");
}

/** Offline reconstruction from pinned clips and the already aligned voice recording. */
export async function produceExistingConcept(input: Parameters<typeof produceConcept>[0]) {
  assertExistingSelection(input.script, input.params);
  const { jobId, recipe, script, setStep } = input;
  const root = path.join(process.cwd(), "storage/concepts", jobId);
  const outputPath = path.join(process.cwd(), "storage/outputs", `${jobId}.mp4`);
  await mkdir(root, { recursive: true });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await setStep("storyboard", "running");
  const board = planConcept(script, recipe, "9:16");
  const refs = await lockedAssets();
  await writeFile(path.join(root, "storyboard.json"), JSON.stringify(board, null, 2));
  await writeFile(path.join(root, "references.json"), JSON.stringify(refs.map(({ id, sha256, url }) => ({ id, sha256, url })), null, 2));
  await setStep("storyboard", "done");
  await setStep("voice", "running");
  const manifest = await verifyExistingAssets(root);
  await writeFile(path.join(root, "media-manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(root, "timing.json"), JSON.stringify({ ...demoTiming, alignment: "Imported silence-guided word estimates; recording and phrase boundaries unchanged.", repairs: wordTimingRepairs }, null, 2));
  await setStep("voice", "done");
  await setStep("keyframes", "done");
  await setStep("clips", "running");
  const composition = await writeExistingMontage(root);
  validateTiming(demoTiming, composition.captions);
  for (const kind of ["srt", "vtt"] as const) await writeFile(path.join(root, `captions.${kind}`), subtitleFile(composition.captions, kind));
  const sheet: SheetEntry[] = [
    { step: 1, kind: "tts", falModel: "local/existing-recording", higgsfieldEquivalent: existingMediaSummary().voice, prompt: script, durationSeconds: demoTiming.duration, notes: "Recorded voice reused unchanged. Existing silence-aligned timing; no transcription or voice service called." },
    ...composition.cues.map((s) => ({ step: s.shot + 1, kind: "video" as const, falModel: "local/existing-clip", higgsfieldEquivalent: `Existing animated clip ${s.shot}`, prompt: "Existing CAM media; no generation prompt submitted.", durationSeconds: s.end - s.start, notes: `${s.file}; source offset ${s.mediaStart}s; playback rate ${s.rate}. Voice remains at its recorded speed.` })),
  ];
  const sheetUrl = await saveSheet(jobId, sheet);
  await setStep("clips", "done");
  await setStep("montage", "running");
  await renderConcept(root, outputPath);
  const captionBoards = await controls(outputPath, root, composition.cues.map((s) => s.start), 1080, 1920, DEMO_DURATION, { estimatedTiming: false, captions: composition.captions, requireAudibleVoice: true });
  await copyFile(outputPath, path.join(root, "preview.mp4"));
  const media = existingMediaSummary();
  await input.meter("render", { filePath: outputPath, realCostUsd: 0, provider: "hyperframes", model: "concept-existing-media", meta: { ...media, estimatedTiming: false, visualApproval: false } });
  await setStep("montage", "done");
  const url = (file: string) => `/api/media/concepts/${jobId}/${file}`;
  return { outputPath, durationSeconds: DEMO_DURATION, board, sheet, sheetUrl, media, artifacts: [
    { label: "Download film", url: url("preview.mp4") },
    { label: "Voice recording", url: url("assets/narration.wav") },
    { label: "Subtitles (SRT)", url: url("captions.srt") },
    { label: "Shot contact sheet", url: url("controls/shots.png") },
    { label: "Transition contact sheet", url: url("controls/transitions.png") },
    ...captionBoards.map((name, i) => ({ label: `Caption checks ${i + 1}`, url: url(`controls/${name}.png`) })),
    { label: "Quality checks", url: url("controls/report.json") },
    { label: "Media provenance", url: url("media-manifest.json") },
  ] };
}
