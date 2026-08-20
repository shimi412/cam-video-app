/**
 * Production engine: executes a confirmed job end to end.
 * script → storyboard → keyframes → clips → voice → montage → final mp4.
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
import { splitScript, type ProductionParams } from "./brain";
import { addLedgerEntry, billedFromRealCost } from "./credits";
import { getMarginMultiplier } from "./settings";
import { MODEL_MAP, providerMode, saveSheet, type SheetEntry } from "./sheet";

const exec = promisify(execFile);
const STORAGE = path.join(process.cwd(), "storage");

export type JobStep = {
  key: string;
  label: string;
  status: "pending" | "running" | "done" | "failed";
};

const STEPS: Array<Pick<JobStep, "key" | "label">> = [
  { key: "storyboard", label: "Storyboard" },
  { key: "keyframes", label: "Keyframes" },
  { key: "clips", label: "Clips" },
  { key: "voice", label: "Voice-over" },
  { key: "montage", label: "Montage & packaging" },
];

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

export async function runJob(jobId: string): Promise<void> {
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
  if (!job || job.status !== "confirmed") return;

  const params = job.params as Record<string, unknown> & ProductionParams;
  const marginMultiplier = await getMarginMultiplier();
  const providers = getProviders();
  const steps: JobStep[] = STEPS.map((s) => ({ ...s, status: "pending" }));
  // Whiteboard produces clips locally in the montage engine, not via video API.
  const usesVideoApi = params.templateSlug === "cartoon";
  // Dry-run: record every request the real pipeline would send to fal.ai.
  const dryRun = providerMode() === "dryrun";
  const sheet: SheetEntry[] = [];
  const template = job.templateId
    ? (await db.select().from(schema.templates).where(eq(schema.templates.id, job.templateId)))[0]
    : undefined;
  const recipeStyle =
    ((template?.recipe as Record<string, unknown>)?.style as string | undefined) ?? params.templateSlug;
  const mediaUrl = (filePath: string) =>
    `/api/media/${path.relative(STORAGE, filePath).split(path.sep).join("/")}`;

  let totalBilled = 0;
  const setStep = async (key: string, status: JobStep["status"]) => {
    const step = steps.find((s) => s.key === key);
    if (step) step.status = status;
    await setProgress(jobId, params, steps);
  };

  try {
    await db.update(schema.jobs).set({ status: "running" }).where(eq(schema.jobs.id, jobId));

    // 1. Storyboard: one narration segment + visual prompt per shot.
    await setStep("storyboard", "running");
    const segments = splitScript(job.script, params.shotCount);
    const shots = segments.map((narration, i) => ({
      index: i,
      narration,
      visualPrompt: `${recipeStyle}. Shot ${i + 1} of ${segments.length}, ${params.tone} tone, illustrating: ${narration.replace(/[.!?]\s*$/, "")}.`,
    }));
    await setStep("storyboard", "done");

    // 2. Keyframes.
    await setStep("keyframes", "running");
    const keyframes: MediaResult[] = [];
    for (const shot of shots) {
      const kf = await providers.image.generateImage({
        prompt: shot.visualPrompt,
        aspectRatio: params.aspectRatio,
      });
      totalBilled += await meter(jobId, "image", kf, marginMultiplier);
      keyframes.push(kf);
      if (dryRun) {
        sheet.push({
          step: sheet.length + 1,
          kind: "image",
          falModel: MODEL_MAP.image.falModel,
          higgsfieldEquivalent: MODEL_MAP.image.higgsfieldEquivalent,
          prompt: shot.visualPrompt,
          aspectRatio: params.aspectRatio,
          notes: `Keyframe for shot ${shot.index + 1}. Generate in 2K.`,
        });
      }
    }
    await setStep("keyframes", "done");

    // 3. Clips: video API for cartoon, local still-to-clip render for whiteboard.
    await setStep("clips", "running");
    const clipPaths: string[] = [];
    for (const [i, shot] of shots.entries()) {
      if (usesVideoApi) {
        const motionPrompt = `Animate this keyframe: subtle character motion, ${params.tone} energy, camera holds or slow push-in, consistent with the still. ${shot.narration.slice(0, 120)}`;
        const clip = await providers.video.generateClip({
          prompt: motionPrompt,
          keyframePath: keyframes[i].filePath,
          durationSeconds: params.shotSeconds,
          tier: params.tier,
        });
        totalBilled += await meter(jobId, "video", clip, marginMultiplier);
        clipPaths.push(clip.filePath);
        if (dryRun) {
          const target = params.tier === "premium" ? MODEL_MAP.videoPremium : MODEL_MAP.videoStandard;
          sheet.push({
            step: sheet.length + 1,
            kind: "video",
            falModel: target.falModel,
            higgsfieldEquivalent: target.higgsfieldEquivalent,
            prompt: motionPrompt,
            referenceUrl: mediaUrl(keyframes[i].filePath),
            durationSeconds: params.shotSeconds,
            aspectRatio: params.aspectRatio,
            notes: `Image-to-video for shot ${i + 1}: use the keyframe generated at the matching image step as the start frame.`,
          });
        }
      } else {
        const clipPath = path.join(STORAGE, "clips", `${jobId}-${i}.mp4`);
        await mkdir(path.dirname(clipPath), { recursive: true });
        await exec("ffmpeg", [
          "-y", "-loglevel", "error",
          "-loop", "1",
          "-i", keyframes[i].filePath,
          "-t", String(params.shotSeconds),
          "-vf", "scale=1280:720",
          "-pix_fmt", "yuv420p",
          "-c:v", "libx264",
          clipPath,
        ]);
        clipPaths.push(clipPath);
      }
    }
    await setStep("clips", "done");

    // 4. Voice-over on the full script.
    await setStep("voice", "running");
    const voice = await providers.tts.synthesize({
      text: job.script,
      voiceId: params.voiceId,
      language: params.language,
    });
    totalBilled += await meter(jobId, "tts", voice, marginMultiplier);
    if (dryRun) {
      sheet.push({
        step: sheet.length + 1,
        kind: "tts",
        falModel: MODEL_MAP.tts.falModel,
        higgsfieldEquivalent: MODEL_MAP.tts.higgsfieldEquivalent,
        prompt: job.script,
        notes: `Voice-over, ${params.tone} tone, English narrator. Full script above.`,
      });
    }
    await setStep("voice", "done");

    // 5. Montage: concat clips + voice track. (HyperFrames packaging: chantier 3.)
    await setStep("montage", "running");
    const outDir = path.join(STORAGE, "outputs");
    await mkdir(outDir, { recursive: true });
    const listPath = path.join(outDir, `${jobId}.txt`);
    await writeFile(
      listPath,
      clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
      "utf8",
    );
    const outputPath = path.join(outDir, `${jobId}.mp4`);
    await exec("ffmpeg", [
      "-y", "-loglevel", "error",
      "-f", "concat", "-safe", "0",
      "-i", listPath,
      "-i", voice.filePath,
      "-c:v", "copy",
      "-c:a", "aac",
      "-shortest",
      outputPath,
    ]);
    totalBilled += await meter(
      jobId,
      "render",
      {
        filePath: outputPath,
        realCostUsd: 0.05,
        provider: "hyperframes",
        model: "local-cpu-montage",
      },
      marginMultiplier,
    );
    await setStep("montage", "done");

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
      note: `Production ${params.templateSlug} (${params.durationSeconds}s)`,
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
