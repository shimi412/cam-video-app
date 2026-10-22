import {supervisedStep,RecoveryStepError} from './agent/recovery-step';
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, mkdir, readFile, rename, writeFile, copyFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { acquireJobLock, jobWorkerActive } from "./job-lock";
import { storedVideoUrl } from "./stored-media";
import { compositionHash, checkpointedRender } from "./concept/render-checkpoint";
import { conceptCanvas, writeMontage, type MontageOptions, type MontageMedia } from "./concept/montage";
import { checkEditorialAudio } from "./concept/editorial-audio";
import { FinishingReviewSchema } from "./concept/finishing-review";
import { readCheckpoint } from "./concept/checkpoints";
import { controls, validateTiming } from "./concept/controls";
import { renderConcept } from "./concept/render";
import { subtitleFile } from "./concept/existing-run";
import type { ConceptBoard, ConceptTiming } from "./concept/types";
import type { AspectRatio } from "./recipes";

const exec = promisify(execFile);
const FORMATS: AspectRatio[] = ["9:16", "1:1", "16:9"];
type Job = typeof schema.jobs.$inferSelect;
type ExportFile = { aspect: AspectRatio; url: string; sha256: string; layout: "original" | "adapted" | "fit" };
export type FormatExports = {
  status: "queued" | "running" | "complete" | "failed";
  backgroundManaged?: boolean;
  requestedAt: string; completedAt?: string; error?: string;
  sourceHash?: string; files: ExportFile[];
};
export async function digest(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
function parameters(job: Job) { return job.params as Record<string, unknown> & { execution?: { attemptId?: string }; formatExports?: FormatExports }; }

async function sourceFor(job: Job) {
  const params = parameters(job), attempt = params.execution?.attemptId;
  const live=params.live===true&&params.executionMode==="fal";
  if (job.status !== "succeeded" || params.templateSlug !== "cam-clay" || (!live&&(!z.uuid().safeParse(attempt).success ||
    !["mock", "dryrun"].includes(String(params.executionMode)))) || !(await storedVideoUrl(job.outputPath))) {
    throw new Error("Complete a CAM Clay production before preparing its download formats.");
  }
  const finishing = live ? await readCheckpoint(path.join(process.cwd(),"storage/concepts",job.id,"live/finishing.json"), FinishingReviewSchema) : null;
  if (finishing && (!finishing.approvedAt || finishing.pending || finishing.sha256 !== await digest(job.outputPath!))) throw new Error("Approve the final finishing version before exporting.");
  const root = finishing ? path.dirname(finishing.file) : live ? path.join(process.cwd(),"storage/concepts",job.id,"live/montage") : path.join(process.cwd(), "storage/concepts", job.id, "attempts", attempt!);
  const fingerprint = createHash("sha256").update("cam-formats-v1").update(await compositionHash(root)).update(await digest(job.outputPath!));
  for (const name of ["storyboard.json", "timing.json", "cues.json"]) fingerprint.update(await digest(path.join(root, name)));
  fingerprint.update(JSON.stringify([params.aspectRatio, params.previewSource, params.finalDurationSeconds]));
  const hash = fingerprint.digest("hex");
  return { root, hash, original: job.outputPath!, params };
}
const urlFor = (file: string) => `/api/media/${path.relative(path.join(process.cwd(), "storage"), file).split(path.sep).join("/")}`;

/** Public status is rebuilt from stored files, so stale/corrupt downloads are not offered. */
export async function exportView(job: Job) {
  const state = parameters(job).formatExports;
  if (!state) return { state: null, canStart: job.status === "succeeded" && parameters(job).templateSlug === "cam-clay" };
  const active = await jobWorkerActive(job.id);
  const recentlyQueued = state.status === "queued" && Date.now() - Date.parse(state.requestedAt) < 15_000;
  if (state.status === "complete") {
    try {
      const source = await sourceFor(job);
      if (source.hash !== state.sourceHash || state.files.length !== FORMATS.length) throw new Error();
      for (const aspect of FORMATS) {
        const file = state.files.find((f) => f.aspect === aspect);
        const target = path.join(process.cwd(), "storage/exports", job.id, source.hash, aspect.replace(":", "x"), "video.mp4");
        if (!file || file.url !== urlFor(target) || await digest(target) !== file.sha256 || !(await storedVideoUrl(target))) throw new Error();
      }
      return { state, canStart: false };
    } catch { return { state: { ...state, status: "failed" as const, files: [], error: "A source or exported file changed. Prepare the formats again." }, canStart: !active }; }
  }
  if (state.backgroundManaged && ["queued", "running"].includes(state.status)) return { state, canStart: false };
  if (!active && !recentlyQueued && state.status !== "failed") return { state: { ...state, status: "failed" as const, files: [], error: "Export was interrupted. Continue to reuse completed formats." }, canStart: true };
  return { state, canStart: !active && !recentlyQueued };
}

export async function queueExports(id: string) {
  const lock = await acquireJobLock(id);
  if (!lock) return false;
  try {
    const [job] = await lock.db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    if (!job) throw new Error("Production not found.");
    const source = await sourceFor(job), current = parameters(job).formatExports;
    if (current?.status === "queued" && Date.now() - Date.parse(current.requestedAt) < 15_000) return false;
    // Completion is verified by the worker; cached renders never call a provider.
    const state: FormatExports = { status: "queued", backgroundManaged: process.env.CAM_LIVE_ENABLED === "1" && process.env.PROVIDER_MODE === "fal", requestedAt: new Date().toISOString(), sourceHash: source.hash, files: [] };
    await lock.db.update(schema.jobs).set({ params: { ...job.params as object, formatExports: state } }).where(eq(schema.jobs.id, id));
    return true;
  } finally { await lock.release(); }
}

/** Every format is built from the completed attempt, never from today's draft or a new voice. */
export async function runExports(id: string) {
  const lock = await acquireJobLock(id);
  if (!lock) return;
  try {
    const [job] = await lock.db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    if (!job || job.deletedAt || !exportCanResume(parameters(job).formatExports)) return;
    const params = parameters(job);
    const state: FormatExports = { ...params.formatExports!, status: "running", files: [] };
    const publish = async () => {
      await lock.assertOwned();
      await lock.db.update(schema.jobs).set({ params: { ...params, formatExports: state } }).where(eq(schema.jobs.id, id));
    };
    try {
      await supervisedStep({jobId:id,category:'clay',stage:'exports',inputs:{sourceHash:state.sourceHash},directory:path.resolve('storage/exports',id),assertOwned:lock.assertOwned,execute:async()=>{
      state.files=[];
      const source = await sourceFor(job);
      if (source.hash !== state.sourceHash) throw new Error("Source changed.");
      await publish();
      const base = path.join(process.cwd(), "storage/exports", id, source.hash);
      const timing = JSON.parse(await readFile(path.join(source.root, "timing.json"), "utf8")) as ConceptTiming;
      const historical = params.previewSource === "existing";
      const board = JSON.parse(await readFile(path.join(source.root, "storyboard.json"), "utf8")) as ConceptBoard;
      const cues = JSON.parse(await readFile(path.join(source.root, "cues.json"), "utf8")) as { montageOptions?: MontageOptions; brandEnding?: { version: number; start: number; end: number; voiceEnd: number }; shots: { shot: number; media?: MontageMedia }[] };
      for (const aspect of FORMATS) {
        const directory = path.join(base, aspect.replace(":", "x"));
        await mkdir(directory, { recursive: true });
        const output = path.join(directory, "video.mp4");
        const temporary = path.join(directory, `${randomUUID()}.mp4`);
        const size = conceptCanvas(aspect);
        let cached = false;
        try {
          const receipt = JSON.parse(await readFile(path.join(directory, "receipt.json"), "utf8"));
          cached = receipt.sourceHash === source.hash && receipt.aspect === aspect && receipt.sha256 === await digest(output);
        } catch { /* Incomplete or changed exports are regenerated from the same snapshot. */ }
        if (!cached) {
          if (aspect === params.aspectRatio) await copyFile(source.original, temporary);
          else if (historical) {
            // Preserve the edited picture, captions and AAC packets. Never crop or speed up speech.
            await exec("ffmpeg", ["-y", "-loglevel", "error", "-i", source.original, "-map", "0:v:0", "-map", "0:a:0",
              "-vf", `scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${size.width}:${size.height}:(ow-iw)/2:(oh-ih)/2:color=0xFFF4DC,setsar=1`,
              "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", temporary], { timeout: 30 * 60_000 });
          } else {
            await cp(path.join(source.root, "assets"), path.join(directory, "assets"), { recursive: true });
            const media = Object.fromEntries(cues.shots.filter((s) => s.media).map((s) => [s.shot, s.media!]));
            // Follow the saved film; exporting an older film must not append a new ending.
            const composition = await writeMontage(directory, board, timing, aspect, media, { ...cues.montageOptions, endingTiming: cues.brandEnding, brandEnding: Boolean(cues.brandEnding) });
            validateTiming(timing, composition.captions);
            for (const kind of ["srt", "vtt"] as const) await writeFile(path.join(directory, `captions.${kind}`), subtitleFile(composition.captions, kind));
            await checkpointedRender({ project: directory, output: temporary, checkpointDir: path.join(directory, "checkpoints"), assertOwned: lock.assertOwned, render: (target) => renderConcept(directory, target) });
          }
          const duration = Number(params.finalDurationSeconds ?? timing.duration);
          if (cues.montageOptions?.audio) {
            // Original-format copies still need the reference mix for audio checks.
            await mkdir(path.join(directory, "assets"), { recursive: true });
            await copyFile(path.join(source.root, "assets/mix-reference.wav"), path.join(directory, "assets/mix-reference.wav"));
            await copyFile(path.join(source.root, "audio-finishing.json"), path.join(directory, "audio-finishing.json"));
            await checkEditorialAudio(temporary, directory, timing, [cues.montageOptions.audio.logoStart]);
          }
          await controls(temporary, directory, [0], size.width, size.height, duration);
          if ((await sourceFor(job)).hash !== source.hash) throw new Error("Source changed during export.");
          await lock.assertOwned(); await rename(temporary, output);
          const receipt = { sourceHash: source.hash, aspect, sha256: await digest(output) };
          const receiptTemp = path.join(directory, `${randomUUID()}.json`);
          await writeFile(receiptTemp, JSON.stringify(receipt)); await lock.assertOwned(); await rename(receiptTemp, path.join(directory, "receipt.json"));
        }
        state.files.push({ aspect, url: urlFor(output), sha256: await digest(output), layout: aspect === params.aspectRatio ? "original" : historical ? "fit" : "adapted" });
        await publish();
      }
      if ((await sourceFor(job)).hash !== source.hash) throw new Error("Source changed during export.");
      state.status = "complete"; state.completedAt = new Date().toISOString(); await publish();
      }});
    } catch (error) {
      console.error("CAM format export failed", { jobId: id, message: error instanceof Error ? error.message : "Unknown export failure" });
      state.status = "failed"; state.error = error instanceof RecoveryStepError?error.message:"The formats could not be completed. Check the source files and continue to reuse completed exports.";
      await publish();
    }
  } finally { await lock.release(); }
}

export async function getExportJob(id: string) {
  return (await db.select().from(schema.jobs).where(eq(schema.jobs.id, id)))[0];
}

/** Running means an interrupted local render if its advisory lock is now free. */
export function exportCanResume(state: FormatExports | undefined) {
  return state?.status === "queued" || state?.status === "running" && state.backgroundManaged === true;
}
export async function runQueuedExports() {
  const jobs = await db.select({id: schema.jobs.id}).from(schema.jobs).where(sql`${schema.jobs.deletedAt} IS NULL AND ${schema.jobs.params}->'formatExports'->>'backgroundManaged' = 'true' AND ${schema.jobs.params}->'formatExports'->>'status' IN ('queued', 'running')`);
  for (const job of jobs) await runExports(job.id);
}
