import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
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
import { checkpointedRender } from "./render-checkpoint";
import { saveSheet, type SheetEntry } from "../sheet";
import { produceExistingConcept, subtitleFile } from "./existing-run";
import { localNarration } from "./local-voice";
import { LOCAL_VOICES, PreviewVoiceSchema } from "./preview-inputs";
import { stageSceneMedia, verifiedSceneMedia } from "./imported-media";
import { prepareConcept } from "./preparation";
import { generationPlan } from "./generation-plan";
import { CAM_VOICE } from "./cam-voice";
import { rehearseGeneration } from "./rehearsal";
import { rehearsalBudget } from "./rehearsal-budget";
import { rehearseDelivery } from "./delivery-rehearsal";
import { sceneWorkflow } from "./scene-workflow";
import { rehearseProduction } from "./production-rehearsal";
import { selectedNarration } from "./narration";
import { productionDossier } from "./production-dossier";
import { sha256 } from "./checkpoints";

export async function produceConcept(input: {
  jobId: string; script: string; params: ProductionParams; recipe: Recipe;
  workspace?: string; checkpointDir?: string; assertOwned?: () => Promise<void>;
  meter: (kind: "image" | "video" | "tts" | "render", media: MediaResult) => Promise<void>;
  setStep: (key: string, status: "pending" | "running" | "done" | "failed") => Promise<void>;
}) {
  if (!isSimulation()) throw new Error("CAM Clay is preview-only until its voice, storyboard and paid pipeline are approved.");
  if (input.params.previewSource === "existing") return produceExistingConcept(input);
  const { jobId, script, params, recipe, setStep } = input;
  const root = input.workspace ?? path.join(process.cwd(), "storage/concepts", jobId);
  const outputPath = path.join(root, "rendered.mp4");
  await mkdir(path.join(root, "assets"), { recursive: true });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await setStep("storyboard", "running");
  const references = await lockedAssets();
  const board = planConcept(script, recipe, params.aspectRatio, params.sceneDirections, params.sceneNarrations);
  // A file or reference can change after confirmation or between attempts.
  // Recheck approvals before rendering or exporting them as reusable assets.
  for (const shot of board.shots) {
    const workflow = sceneWorkflow({ jobId, shot, params, references });
    const binding = params.sceneMediaWorkflow?.[shot.index];
    const clip = workflow.stages.find((step) => step.stage === "clip")!;
    if (binding && (clip.status !== "approved" || clip.target !== binding)) throw new Error("A selected animation's scene approvals changed. Its saved approvals cannot be reused.");
    for (const step of workflow.stages) if (step.status === "approved" && step.media) await verifiedSceneMedia(jobId, step.media);
  }
  await writeFile(path.join(root, "storyboard.json"), JSON.stringify(board, null, 2));
  await writeFile(path.join(root, "references.json"), JSON.stringify(references.map(({ id, path: assetPath, sha256 }) => ({ id, path: assetPath, sha256 })), null, 2));
  await setStep("storyboard", "done");
  await setStep("voice", "running");
  const voice = PreviewVoiceSchema.parse(params.previewVoice ?? "silent");
  const phrases = board.shots.map((s) => s.narration);
  const imported = await selectedNarration(jobId, phrases, params);
  const audible = Boolean(imported) || voice !== "silent";
  if (imported) {
    const bytes = await readFile(imported.file);
    if (sha256(bytes) !== imported.audio.sha256) throw new Error("Reviewed recording changed before copying.");
    await writeFile(path.join(root, "assets/narration.wav"), bytes);
  }
  const timing = imported?.timing ?? (voice === "silent" ? placeholderTiming(phrases) : await localNarration(root, phrases, voice, {
    directory: input.checkpointDir ?? path.join(root, "checkpoints"), assertOwned: input.assertOwned ?? (async () => {}),
  }));
  await writeFile(path.join(root, "timing.json"), JSON.stringify(timing, null, 2));
  const plan = generationPlan(script, params, board, timing, references, imported?.evidence);
  await writeFile(path.join(root, "generation-plan.json"), JSON.stringify(plan, null, 2));
  const assertOwned = input.assertOwned ?? (async () => {});
  const checkpoints = input.checkpointDir ?? path.join(root, "checkpoints");
  if (!imported) {
    const reserved = await rehearsalBudget(plan, jobId, checkpoints, assertOwned);
    const rehearsal = await rehearseGeneration(plan, path.join(checkpoints, "simulated-requests"), assertOwned, { budget: reserved, timing, jobId });
    await writeFile(path.join(root, "generation-rehearsal.json"), JSON.stringify(rehearsal, null, 2));
    await writeFile(path.join(root, "budget-rehearsal.json"), JSON.stringify({ note: "SIMULATION ONLY. Artificial amounts, no provider quote or customer debit.", book: await reserved.budget.snapshot() }, null, 2));
    if (voice !== "silent") {
      const delivery = await rehearseDelivery({ jobId, directory: path.join(checkpoints, "delivery-rehearsal"), voiceFile: path.join(root, "assets/narration.wav"), script, params, board, plan, rehearsal, assertOwned });
      await writeFile(path.join(root, "delivery-rehearsal.json"), JSON.stringify(delivery, null, 2));
    }
  }
  if (!audible) await silentVoice(path.join(root, "assets/narration.wav"), timing.duration);
  await setStep("voice", "done");
  const sheet: SheetEntry[] = [{ step: 1, kind: "tts", falModel: voice === "silent" ? "higgsfield/text2speech_v2 (Bram preset)" : "local/macos-say", higgsfieldEquivalent: voice === "silent" ? "Bram · Text to Speech V2 · planned" : `${LOCAL_VOICES[voice].name} · local test voice`, prompt: script, durationSeconds: timing.duration, notes: voice === "silent" ? `Bram preset ${CAM_VOICE.voiceId} verified. New reading and pacing require review. Preview silent; no request sent.` : "Offline Mac speech, zero cost. No Bram identity or final voice approval. Phrase durations measured; word positions approximate." }];
  if (imported) sheet[0] = { step: 1, kind: "tts", falModel: "local/imported-recording", higgsfieldEquivalent: `Imported ${imported.narration.speaker} recording (declared)`, prompt: script, durationSeconds: timing.duration, notes: "Reviewed local audio and operator-supplied word timings. No generation; speaker identity not independently verified." };
  await setStep("keyframes", "running");
  for (const shot of board.shots) {
    if (params.sceneMedia?.[shot.index]) {
      const asset = params.sceneMedia[shot.index];
      sheet.push({ step: sheet.length + 1, kind: asset.kind, falModel: "local/import", higgsfieldEquivalent: `Imported ${asset.kind} · scene ${shot.index}`, prompt: "", notes: `Existing local file, SHA-256 ${asset.sha256}. No generation. Native picture speed; hold the last frame if needed. Clip audio removed.` });
      continue;
    }
    const refs = references.filter((r) => shot.references.includes(r.id as "narrator" | "monster" | "effigy"));
    sheet.push({ step: sheet.length+1, kind: "image", falModel: "fal-ai/nano-banana-pro/edit", higgsfieldEquivalent: "Nano Banana Pro 2K", prompt: shot.imagePrompt, aspectRatio: params.aspectRatio, referenceUrl: refs[0].url, notes: `Shot ${shot.index}; locked references: ${refs.map((r)=>`${r.url} (sha256 ${r.sha256})`).join(", ")}. Image approval required before animation.` });
    if (shot.endImagePrompt) sheet.push({ step: sheet.length+1, kind: "image", falModel: "fal-ai/nano-banana-pro/edit", higgsfieldEquivalent: "Nano Banana Pro 2K end frame", prompt: shot.endImagePrompt, aspectRatio: params.aspectRatio, notes: `End frame for shot ${shot.index}. Use that shot's approved start image as reference.` });
  }
  await setStep("keyframes", "done");
  await setStep("clips", "running");
  for (const shot of board.shots.filter((s) => !params.sceneMedia?.[s.index])) sheet.push({ step: sheet.length+1, kind: "video", falModel: "fal-ai/kling-video/v3/pro/image-to-video", higgsfieldEquivalent: "Kling 3.0 Pro", prompt: shot.motionPrompt, durationSeconds: shot.clipSeconds, aspectRatio: params.aspectRatio, notes: `Shot ${shot.index}; start_image_url = its approved keyframe; ${shot.endImagePrompt ? "end_image_url = its approved end frame; " : ""}generate_audio = false. No request sent.` });
  await setStep("clips", "done");
  const sheetUrl = await saveSheet(jobId, sheet);
  await setStep("montage", "running");
  const sceneDurations = timing.phrases.map((phrase, i) => (timing.phrases[i + 1]?.start ?? timing.duration) - (i === 0 ? 0 : phrase.start));
  const staged = await stageSceneMedia(jobId, params.sceneMedia ?? {}, root, sceneDurations);
  const composition = await writeMontage(root, board, timing, params.aspectRatio, staged);
  validateTiming(timing, composition.captions);
  for (const kind of ["srt", "vtt"] as const) await writeFile(path.join(root, `captions.${kind}`), subtitleFile(composition.captions, kind));
  const rendering = await checkpointedRender({ project: root, output: outputPath,
    checkpointDir: input.checkpointDir ?? path.join(root, "checkpoints"),
    assertOwned: input.assertOwned ?? (async () => {}),
    render: (output) => renderConcept(root, output),
  });
  await controls(outputPath, root, [...composition.cues.map((s)=>s.start), timing.duration], composition.width, composition.height, composition.duration, { requireAudibleVoice: audible, estimatedTiming: timing.estimated, captions: audible ? composition.captions : undefined });
  const sequence = !imported && voice !== "silent" ? await rehearseProduction({ jobId, directory: path.join(checkpoints, "production-sequence"), workspace: root,
    script, params, recipe, voiceFile: path.join(root, "assets/narration.wav"), timing, assertOwned }) : null;
  await writeFile(path.join(root, "provenance.json"), JSON.stringify({ voice: imported ? { source: "local-import", declaredSpeaker: imported.narration.speaker, sourceNote: imported.narration.sourceNote, sha256: imported.audio.sha256, reviewTarget: imported.target, reviewed: true, speakerIdentityVerified: false, costUsd: 0, finalVoiceApproved: false } : { source: voice === "silent" ? "silent" : "local-macos", name: voice === "silent" ? null : LOCAL_VOICES[voice].name, rate: 150, costUsd: 0, finalVoiceApproved: false }, scenes: composition.cues, importedMedia: params.sceneMedia ?? {}, phraseTiming: !audible ? "estimated" : imported ? "operator-supplied" : "measured", wordTiming: imported ? "operator-supplied" : "estimated", costUsd: 0 }, null, 2));
  await copyFile(outputPath, path.join(root, "preview.mp4"));
  await input.meter("render", { filePath: outputPath, realCostUsd: 0, provider: "hyperframes", model: "concept-local-preview", meta: { previewVoice: voice, importedScenes: Object.keys(staged).length, estimatedWordTiming: timing.estimated, measuredSceneTiming: audible, importedRecording: Boolean(imported), visualApproval: false } });
  await setStep("montage", "done");
  const url = (file: string) => `/api/media/${path.relative(path.join(process.cwd(), "storage"), root).split(path.sep).join("/")}/${file}`;
  const preparation = await prepareConcept(script, params, recipe, jobId, audible ? timing : undefined);
  await writeFile(path.join(root, "visual-review.json"), JSON.stringify({ paidGenerationAuthorized: false,
    scenes: preparation.shots.filter((shot) => shot.media).map((shot) => ({ scene: shot.index, media: shot.media, review: shot.review, history: params.sceneReviews?.[shot.index] ?? [] })),
  }, null, 2));
  if (imported) {
    await writeFile(path.join(root, "narration-review.json"), JSON.stringify({ ...preparation.narration, alignment: imported.alignment, paidGenerationAuthorized: false }, null, 2));
    if (preparation.narration) preparation.narration.url = url("assets/narration.wav");
  }
  // Results link to the exact measured snapshot used by this attempt.
  preparation.generation.downloadUrl = url("generation-plan.json");
  if (preparation.quote) {
    preparation.quote = { ...preparation.quote, downloadUrl: url("quote-preparation.json") };
    await writeFile(path.join(root, "quote-preparation.json"), JSON.stringify(preparation.quote, null, 2));
  }
  await writeFile(path.join(root, "scene-workflow.json"), JSON.stringify({ paidGenerationAuthorized: false,
    scenes: preparation.shots.map((shot) => shot.workflow), history: params.sceneWorkflow ?? {},
  }, null, 2));
  preparation.readiness.dossierUrl = url("production-dossier.json");
  await writeFile(path.join(root, "production-dossier.json"), JSON.stringify(productionDossier(jobId, script, params, preparation), null, 2));
  return { outputPath, renderReused: rendering.reused, durationSeconds: composition.duration, board, sheet, sheetUrl, media: null,
    preparation, artifacts: [
    { label: "Production dossier", url: url("production-dossier.json") },
    { label: "Storyboard", url: url("storyboard.json") },
    { label: "Visual review record", url: url("visual-review.json") },
    { label: "Scene approval steps", url: url("scene-workflow.json") },
    { label: "Quote worksheet (not authorized)", url: url("quote-preparation.json") },
    ...(sequence ? [{ label: "Complete production sequence (simulation)", url: url("production-sequence.json") },
      ...(sequence.rendered ? [{ label: "Offline sequence test video (test voice)", url: url("production-sequence/preview.mp4") }] : [])] : []),
    { label: "Generation plan (not submitted)", url: url("generation-plan.json") },
    ...(!imported ? [{ label: "Pipeline rehearsal (simulation)", url: url("generation-rehearsal.json") },
    { label: "Budget checks (simulation)", url: url("budget-rehearsal.json") }] : [{ label: "Recording review", url: url("narration-review.json") }]),
    ...(!imported && voice !== "silent" ? [{ label: "File transfer & voice sync checks (simulation)", url: url("delivery-rehearsal.json") }] : []),
    { label: "Shot contact sheet", url: url("controls/shots.png") },
    ...(board.shots.length > 1 ? [{ label: "Transition contact sheet", url: url("controls/transitions.png") }] : []),
    { label: "Timing", url: url("timing.json") }, { label: "Quality checks", url: url("controls/report.json") },
    { label: "Subtitles (SRT)", url: url("captions.srt") }, { label: "Subtitles (VTT)", url: url("captions.vtt") },
    { label: "Media provenance", url: url("provenance.json") },
    ...(audible ? [{ label: imported ? "Listen to imported recording" : "Listen to test voice", url: url("assets/narration.wav") }] : []),
    { label: "Download preview", url: url("preview.mp4") },
  ] };
}
