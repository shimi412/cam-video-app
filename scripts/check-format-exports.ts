process.env.PROVIDER_MODE = "dryrun"; process.env.BRAIN_MODE = "mock";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, stat, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { queueExports, runExports, getExportJob, exportView, digest, type FormatExports } from "../src/lib/format-exports";
import { writeMontage } from "../src/lib/concept/montage";
import { renderConcept } from "../src/lib/concept/render";
import { acquireJobLock } from "../src/lib/job-lock";
import type { ConceptBoard, ConceptTiming } from "../src/lib/concept/types";

const exec = promisify(execFile);
let networkAttempts = 0;
globalThis.fetch = async () => { networkAttempts++; throw new Error("External fetch forbidden."); };
async function main() {
  const id = randomUUID(), attempt = randomUUID(), base = path.join(process.cwd(), "storage/concepts", id);
  const root = path.join(base, "attempts", attempt), output = path.join(root, "original.mp4");
  await mkdir(path.join(root, "assets"), { recursive: true });
  const board: ConceptBoard = { source: "offline-draft", requiresReview: true, shots: [{ index: 1, narration: "Offline export check.", scene: "Technical calibration card", motion: "Static", references: ["narrator"], endScene: null, overlay: "EXPORT CHECK", strike: false, imagePrompt: "", motionPrompt: "", endImagePrompt: null, clipSeconds: 3 }] };
  const timing: ConceptTiming = { duration: 3, estimated: true, phrases: [{ phrase: 1, text: "Offline export check.", start: 0.3, end: 2.7 }], words: [{ word: "Offline", start: .3, end: 1 }, { word: "export", start: 1, end: 1.8 }, { word: "check.", start: 1.8, end: 2.7 }] };
  const baselineLedger = (await db.select().from(schema.creditLedger)).length, baselineCalls = (await db.select().from(schema.apiCalls)).length;
  try {
    await sharp({ create: { width: 800, height: 800, channels: 3, background: "#d7e9e4" } }).png().toFile(path.join(root, "assets/scene-1.png"));
    // Deliberately audible calibration tone, never labelled as a human voice.
    await exec("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-ar", "48000", "-ac", "1", path.join(root, "assets/narration.wav")]);
    await writeFile(path.join(root, "storyboard.json"), JSON.stringify(board));
    await writeFile(path.join(root, "timing.json"), JSON.stringify(timing));
    await writeMontage(root, board, timing, "16:9", { 1: { kind: "image", file: "assets/scene-1.png", heldSeconds: 0 } });
    await renderConcept(root, output);
    const params = { templateSlug: "cam-clay", aspectRatio: "16:9", executionMode: "dryrun", execution: { attemptId: attempt }, finalDurationSeconds: 3 };
    await db.insert(schema.jobs).values({ id, status: "succeeded", script: "Offline export check.", params, outputPath: output, billedUsd: "0.00" });
    assert.deepEqual((await Promise.all([queueExports(id), queueExports(id)])).sort(), [false, true], "Duplicate clicks queue once");
    await runExports(id);
    const job = (await getExportJob(id))!, view = await exportView(job);
    assert.equal(view.state?.status, "complete", JSON.stringify(view)); assert.equal(view.state.files.length, 3);
    const timestamps: Record<string, number> = {};
    for (const file of view.state.files) {
      const target = path.join(process.cwd(), "storage", file.url.replace("/api/media/", ""));
      timestamps[file.aspect] = (await stat(target)).mtimeMs;
      const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "stream=width,height:format=duration", "-of", "json", target]);
      const probe = JSON.parse(stdout), size = file.aspect === "9:16" ? [1080, 1920] : file.aspect === "1:1" ? [1080, 1080] : [1920, 1080];
      assert.deepEqual([probe.streams[0].width, probe.streams[0].height], size); assert(Math.abs(Number(probe.format.duration) - 3) < .1);
      if (file.layout === "original") assert.equal(await digest(target), await digest(output));
      else {
        assert.equal(await digest(path.join(path.dirname(target), "assets/narration.wav")), await digest(path.join(root, "assets/narration.wav")));
        assert.equal(JSON.parse(await readFile(path.join(path.dirname(target), "cues.json"), "utf8")).captions.map((c: { text: string }) => c.text).join(" "), "Offline export check.");
      }
    }
    // A lost worker releases its lock; cached files survive the next request.
    const saved = job.params as Record<string, unknown>;
    await db.update(schema.jobs).set({ params: { ...saved, formatExports: { ...view.state, status: "running" } } }).where(eq(schema.jobs.id, id));
    assert.equal((await exportView((await getExportJob(id))!)).canStart, true);
    assert(await queueExports(id)); await runExports(id);
    const restored = (await exportView((await getExportJob(id))!)).state!;
    for (const file of restored.files) assert.equal((await stat(path.join(process.cwd(), "storage", file.url.replace("/api/media/", "")))).mtimeMs, timestamps[file.aspect]);
    const held = await acquireJobLock(id); assert(held); assert.equal(await queueExports(id), false); await held.release();
    const cuesPath = path.join(root, "cues.json"), cues = await readFile(cuesPath);
    await writeFile(cuesPath, Buffer.concat([cues, Buffer.from(" ")]));
    assert.equal((await exportView((await getExportJob(id))!)).state?.status, "failed", "Edited timing/layout invalidates exports");
    await writeFile(cuesPath, cues);
    const broken = path.join(process.cwd(), "storage", restored.files[0].url.replace("/api/media/", ""));
    await writeFile(broken, "broken"); assert.equal((await exportView((await getExportJob(id))!)).state?.status, "failed");
    assert(await queueExports(id)); await runExports(id); assert.equal((await exportView((await getExportJob(id))!)).state?.status, "complete");
    // The historical-film branch preserves the already-edited picture and audio packets.
    const current = (await getExportJob(id))!;
    await db.update(schema.jobs).set({ params: { ...current.params as object, previewSource: "existing", formatExports: undefined } }).where(eq(schema.jobs.id, id));
    assert(await queueExports(id)); await runExports(id);
    const fitted = (await exportView((await getExportJob(id))!)).state as FormatExports;
    assert.equal(fitted.status, "complete"); assert.equal(fitted.files.filter((f) => f.layout === "fit").length, 2);
    assert.equal((await db.select().from(schema.creditLedger)).length, baselineLedger);
    assert.equal((await db.select().from(schema.apiCalls)).length, baselineCalls); assert.equal(networkAttempts, 0);
    await mkdir("storage/qa", { recursive: true });
    const proof = { checkedAt: new Date().toISOString(), threeFormats: true, sameAudio: true, captionsPreserved: true, originalPreserved: true,
      duplicateQueueBlocked: true, interruptedExportRecovered: true, changedInputsDetected: true, corruptFileRebuilt: true, historicalPictureFitted: true,
      providerRequests: 0, billedUsd: 0, ledgerUnchanged: true };
    await writeFile("storage/qa/cam-format-exports-proof.json", JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof));
  } finally {
    await db.delete(schema.jobs).where(eq(schema.jobs.id, id));
    await rm(base, { recursive: true, force: true }); await rm(path.join(process.cwd(), "storage/exports", id), { recursive: true, force: true });
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error instanceof Error ? error.message : "Export check failed"); process.exit(1); });
