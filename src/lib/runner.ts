/**
 * Production engine: executes a confirmed job end to end.
 *   storyboard (director brain) → voice per shot → keyframes (first one is the
 *   style/character reference of the others) → clips → montage per shot,
 *   synced on the voice → final mp4.
 * Every provider call is metered (api_calls) and the client is billed
 * cost x margin through the credit ledger on success.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getProviders } from "./providers";
import type { MediaResult } from "./providers/types";
import type { ProductionParams } from "./brain";
import { directStoryboard, sanitizeScene, type Storyboard } from "./director";
import { buildImagePrompt, buildMotionPrompt, canvasFor, getRecipe, safeFallbackScene } from "./recipes";
import { addLedgerEntry, billedFromRealCost } from "./credits";
import { getMarginMultiplier } from "./settings";
import { MODEL_MAP, providerMode, saveSheet, type SheetEntry } from "./sheet";
import { produceCollage } from "./collage/run";

const exec = promisify(execFile);
const STORAGE = path.join(process.cwd(), "storage");

export type JobStep = {
  key: string;
  label: string;
  status: "pending" | "running" | "done" | "failed";
};

const STEPS: Array<Pick<JobStep, "key" | "label">> = [
  { key: "storyboard", label: "Storyboard" },
  { key: "voice", label: "Voice-over" },
  { key: "keyframes", label: "Keyframes" },
  { key: "clips", label: "Clips" },
  { key: "montage", label: "Montage & packaging" },
];

/** Breathing room added after each narration segment, in seconds. */
const TAIL_SECONDS = 0.35;

async function setProgress(jobId: string, params: Record<string, unknown>, steps: JobStep[]) {
  await db
    .update(schema.jobs)
    .set({ params: { ...params, progress: steps } })
    .where(eq(schema.jobs.id, jobId));
}

async function meter(jobId: string, kind: "image" | "video" | "tts" | "render", r: MediaResult, marginMultiplier: number): Promise<number> {
  const billed = billedFromRealCost(r.realCostUsd, marginMultiplier);
  await db.insert(schema.apiCalls).values({
    jobId,
    provider: r.provider,
    kind,
    model: r.model,
    realCostUsd: r.realCostUsd.toFixed(4),
    billedUsd: billed.toFixed(4),
    meta: r.meta ?? {},
  });
  return billed;
}

async function mediaDuration(filePath: string): Promise<number> {
  const { stdout } = await exec("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const d = Number(stdout.trim());
  return Number.isFinite(d) && d > 0 ? d : 3;
}

/** Video models accept 5 or 10 s clips; pick the smallest that covers the narration. */
function clipSecondsFor(audioSeconds: number): number {
  return audioSeconds + TAIL_SECONDS <= 5 ? 5 : 10;
}

export async function runJob(jobId: string): Promise<void> {
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
  if (!job || job.status !== "confirmed") return;

  const params = job.params as Record<string, unknown> & ProductionParams;
  const recipe = getRecipe(params.templateSlug);
  const marginMultiplier = await getMarginMultiplier();
  const providers = getProviders();
  const steps: JobStep[] = STEPS.map((s) => ({ ...s, status: "pending" }));
  const usesVideoApi = params.family === "cartoon";
  const dryRun = providerMode() === "dryrun";
  const sheet: SheetEntry[] = [];
  const { width, height } = canvasFor(params.aspectRatio);
  const mediaUrl = (filePath: string) =>
    `/api/media/${path.relative(STORAGE, filePath).split(path.sep).join("/")}`;

  let totalBilled = 0;
  const setStep = async (key: string, status: JobStep["status"]) => {
    const step = steps.find((s) => s.key === key);
    if (step) step.status = status;
    await setProgress(jobId, params, steps);
  };

  try {
    if (!recipe) throw new Error(`Unknown video model "${params.templateSlug}"`);
    await db.update(schema.jobs).set({ status: "running" }).where(eq(schema.jobs.id, jobId));

    let outputPath: string;
    if (recipe.collage) {
      // Whiteboard family: collage engine (score → elements → HyperFrames render).
      const r = await produceCollage({
        jobId,
        script: job.script,
        params,
        recipe,
        providers,
        meter: async (kind, media) => {
          totalBilled += await meter(jobId, kind, media, marginMultiplier);
        },
        setStep,
        tailSeconds: TAIL_SECONDS,
      });
      outputPath = r.outputPath;
      params.storyboard = { brain: r.score.brain, engine: "collage", elements: r.score.elements, shots: r.score.shots };
      params.fallbacks = r.fallbacks;
      params.finalDurationSeconds = r.durationSeconds;
      await setProgress(jobId, params, steps);
    } else {
    // 1. Storyboard: the director brain stages the script inside the style bible.
    await setStep("storyboard", "running");
    const storyboard: Storyboard = await directStoryboard(job.script, recipe, params);
    const shots = storyboard.shots;
    params.storyboard = {
      brain: storyboard.brain,
      characterNotes: storyboard.characterNotes,
      shots: shots.map((s) => ({ narration: s.narration, scene: s.scene, motion: s.motion, handwrittenKeywords: s.handwrittenKeywords })),
    };
    await setStep("storyboard", "done");

    // 2. Voice-over per shot: the real durations drive the clips and the montage.
    await setStep("voice", "running");
    const voices = await Promise.all(
      shots.map((shot) =>
        providers.tts.synthesize({ text: shot.narration, voiceId: params.voiceId, language: params.language }),
      ),
    );
    for (const v of voices) totalBilled += await meter(jobId, "tts", v, marginMultiplier);
    const audioSeconds = await Promise.all(voices.map((v) => mediaDuration(v.filePath)));
    if (dryRun) {
      shots.forEach((shot, i) =>
        sheet.push({
          step: sheet.length + 1,
          kind: "tts",
          falModel: MODEL_MAP.tts.falModel,
          higgsfieldEquivalent: MODEL_MAP.tts.higgsfieldEquivalent,
          prompt: shot.narration,
          durationSeconds: Number(audioSeconds[i].toFixed(2)),
          notes: `Voice-over for shot ${i + 1}, ${params.tone} tone.`,
        }),
      );
    }
    await setStep("voice", "done");

    // 3. Keyframes: shot 1 sets the style and the character; the others use it as reference.
    await setStep("keyframes", "running");
    const sceneWithCharacter = (scene: string) =>
      storyboard.characterNotes ? `${scene} Recurring character/props: ${storyboard.characterNotes}` : scene;
    const imagePrompts = shots.map((shot) =>
      buildImagePrompt(recipe, sceneWithCharacter(shot.scene), params.aspectRatio, shot.handwrittenKeywords),
    );
    const fallbacks: Array<{ shot: number; step: string; reason: string }> = [];
    const REF_PREFIX =
      "Use the reference image ONLY for its art style, palette and recurring character design. Create a NEW scene with a different composition: ";
    // A refused prompt (content checker) is rewritten abstractly, then falls back
    // to the recurring motif: one refused shot never breaks the video.
    const generateKeyframe = async (i: number, referencePath?: string): Promise<MediaResult> => {
      const attempt = (scene: string) =>
        providers.image.generateImage({
          prompt:
            (referencePath ? REF_PREFIX : "") +
            buildImagePrompt(recipe, sceneWithCharacter(scene), params.aspectRatio, shots[i].handwrittenKeywords),
          aspectRatio: params.aspectRatio,
          referencePath,
        });
      try {
        return await attempt(shots[i].scene);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        if (!/content_policy|flagged|safety/i.test(reason)) throw err;
        const rewritten = await sanitizeScene(shots[i].scene, recipe);
        if (rewritten) {
          try {
            const r = await attempt(rewritten);
            fallbacks.push({ shot: i + 1, step: "keyframe", reason: "scene rewritten after content check" });
            shots[i].scene = rewritten;
            return r;
          } catch {
            /* fall through to the safe motif */
          }
        }
        const r = await attempt(safeFallbackScene(recipe));
        fallbacks.push({ shot: i + 1, step: "keyframe", reason: "safe motif after content check" });
        shots[i].scene = safeFallbackScene(recipe);
        return r;
      }
    };
    const first = await generateKeyframe(0);
    totalBilled += await meter(jobId, "image", first, marginMultiplier);
    const rest = await Promise.all(
      shots.slice(1).map(async (_, i) => {
        const r = await generateKeyframe(i + 1, first.filePath);
        totalBilled += await meter(jobId, "image", r, marginMultiplier);
        return r;
      }),
    );
    const keyframes: MediaResult[] = [first, ...rest];
    params.fallbacks = fallbacks;
    if (dryRun) {
      shots.forEach((_, i) =>
        sheet.push({
          step: sheet.length + 1,
          kind: "image",
          falModel: i === 0 ? MODEL_MAP.image.falModel : MODEL_MAP.imageEdit.falModel,
          higgsfieldEquivalent: i === 0 ? MODEL_MAP.image.higgsfieldEquivalent : MODEL_MAP.imageEdit.higgsfieldEquivalent,
          prompt: imagePrompts[i],
          referenceUrl: i === 0 ? undefined : mediaUrl(first.filePath),
          aspectRatio: params.aspectRatio,
          notes: i === 0 ? "Master keyframe (style + character reference)." : `Keyframe for shot ${i + 1}, reference = master keyframe.`,
        }),
      );
    }
    await setStep("keyframes", "done");

    // 4. Clips: video API for the cartoon family, local animated still for whiteboard.
    await setStep("clips", "running");
    const clipDir = path.join(STORAGE, "clips");
    await mkdir(clipDir, { recursive: true });
    let clipPaths: string[];
    // Local animated still (slow drift on the keyframe): whiteboard family, and fallback for a refused clip.
    const stillClip = async (i: number): Promise<string> => {
      const seconds = audioSeconds[i] + TAIL_SECONDS;
      const clipPath = path.join(clipDir, `${jobId}-${i}.mp4`);
      await exec("ffmpeg", [
        "-y", "-loglevel", "error",
        "-loop", "1",
        "-i", keyframes[i].filePath,
        "-t", seconds.toFixed(2),
        "-vf",
        `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=decrease,pad=${width * 2}:${height * 2}:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.0006,1.06)':d=${Math.ceil(seconds * 25)}:s=${width}x${height}:fps=25`,
        "-pix_fmt", "yuv420p",
        "-c:v", "libx264",
        clipPath,
      ]);
      return clipPath;
    };
    if (usesVideoApi) {
      const motionPrompts = shots.map((shot) => buildMotionPrompt(recipe, shot.motion));
      clipPaths = await Promise.all(
        shots.map(async (_, i) => {
          try {
            const clip = await providers.video.generateClip({
              prompt: motionPrompts[i],
              keyframePath: keyframes[i].filePath,
              durationSeconds: clipSecondsFor(audioSeconds[i]),
              tier: params.tier,
              aspectRatio: params.aspectRatio,
            });
            totalBilled += await meter(jobId, "video", clip, marginMultiplier);
            return clip.filePath;
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            fallbacks.push({ shot: i + 1, step: "clip", reason: reason.slice(0, 200) });
            return stillClip(i);
          }
        }),
      );
      params.fallbacks = fallbacks;
      if (dryRun) {
        const target = params.tier === "premium" ? MODEL_MAP.videoPremium : MODEL_MAP.videoStandard;
        shots.forEach((_, i) =>
          sheet.push({
            step: sheet.length + 1,
            kind: "video",
            falModel: target.falModel,
            higgsfieldEquivalent: target.higgsfieldEquivalent,
            prompt: motionPrompts[i],
            referenceUrl: mediaUrl(keyframes[i].filePath),
            durationSeconds: clipSecondsFor(audioSeconds[i]),
            aspectRatio: params.aspectRatio,
            notes: `Image-to-video for shot ${i + 1}, start frame = its keyframe.`,
          }),
        );
      }
    } else {
      // Whiteboard: the keyframe holds for the narration with a slow drift (HyperFrames packaging: next chantier).
      clipPaths = [];
      for (const [i] of shots.entries()) clipPaths.push(await stillClip(i));
    }
    await setStep("clips", "done");

    // 5. Montage: each clip is cut to its narration (+ breathing room), muxed with its voice, then concatenated.
    await setStep("montage", "running");
    const outDir = path.join(STORAGE, "outputs");
    await mkdir(outDir, { recursive: true });
    const segmentPaths: string[] = [];
    for (const [i] of shots.entries()) {
      const seconds = audioSeconds[i] + TAIL_SECONDS;
      const segPath = path.join(outDir, `${jobId}-seg-${i}.mp4`);
      await exec("ffmpeg", [
        "-y", "-loglevel", "error",
        "-stream_loop", "-1", "-i", clipPaths[i],
        "-i", voices[i].filePath,
        "-t", seconds.toFixed(2),
        "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=25,format=yuv420p`,
        "-af", "apad",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-ar", "44100", "-ac", "1",
        "-map", "0:v:0", "-map", "1:a:0",
        segPath,
      ]);
      segmentPaths.push(segPath);
    }
    const listPath = path.join(outDir, `${jobId}.txt`);
    await writeFile(listPath, segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
    outputPath = path.join(outDir, `${jobId}.mp4`);
    await exec("ffmpeg", [
      "-y", "-loglevel", "error",
      "-f", "concat", "-safe", "0",
      "-i", listPath,
      "-c", "copy",
      "-movflags", "+faststart",
      outputPath,
    ]);
    totalBilled += await meter(
      jobId,
      "render",
      { filePath: outputPath, realCostUsd: 0.05, provider: "hyperframes", model: "local-cpu-montage" },
      marginMultiplier,
    );
    params.finalDurationSeconds = Number(audioSeconds.reduce((s, d) => s + d + TAIL_SECONDS, 0).toFixed(2));
    await setStep("montage", "done");
    }

    // Dry-run: persist the production sheet and expose it on the job.
    if (dryRun && sheet.length > 0) {
      const sheetUrl = await saveSheet(jobId, sheet);
      params.sheet = sheet;
      params.sheetUrl = sheetUrl;
      await setProgress(jobId, params, steps);
    }

    // Billing: consume credits at the metered billed total.
    const billed = Number(totalBilled.toFixed(2));
    await addLedgerEntry({
      deltaUsd: -billed,
      kind: "consumption",
      jobId,
      note: `Production ${params.templateSlug} (${params.finalDurationSeconds}s, ${params.aspectRatio})`,
    });
    await db
      .update(schema.jobs)
      .set({
        status: "succeeded",
        billedUsd: billed.toFixed(2),
        outputPath,
        finishedAt: new Date(),
      })
      .where(eq(schema.jobs.id, jobId));
  } catch (err) {
    // Technical failure: nothing is billed (rule from the devis).
    const failing = steps.find((s) => s.status === "running");
    if (failing) failing.status = "failed";
    await setProgress(jobId, params, steps);
    await db
      .update(schema.jobs)
      .set({
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        finishedAt: new Date(),
      })
      .where(eq(schema.jobs.id, jobId));
  }
}
