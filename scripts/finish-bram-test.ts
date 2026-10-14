/** Free local revision of the approved test. No provider calls, no new voice. */
import { cp, mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { pool, schema } from "../src/db";
import { acquireJobLock } from "../src/lib/job-lock";
import { renderProductionFlow, type RenderPacket } from "../src/lib/concept/production-flow";
import { requestReceipts } from "../src/lib/concept/request-journal";
import { sha256 } from "../src/lib/concept/checkpoints";

async function main() {
  globalThis.fetch = async () => { throw new Error("Network disabled in the free finishing command."); };
  const id = "2b0df353-688e-4d7c-b5aa-6a31cd4b2f21";
  const lock = await acquireJobLock(id); if (!lock) throw new Error("This production is busy.");
  try {
    const base = path.join(process.cwd(), "storage/concepts", id, "live"), revision = path.join(base, "finishing/claude-method-v3");
    await mkdir(revision, { recursive: true });
    const packet = JSON.parse(await readFile(path.join(base, "state.json"), "utf8")).render as RenderPacket;
    const before = await requestReceipts(path.join(base, "requests"));
    await writeFile(path.join(revision, "source-packet.json"), JSON.stringify(packet, null, 2));
    const variants: { name: string; url: string }[] = [];
    let mainResult: Awaited<ReturnType<typeof renderProductionFlow>> | null = null;
    for (const ending of ["cream", "last-frame"] as const) {
      const root = path.join(revision, ending);
      console.log(`Preparing ${ending} locally; all network calls are forbidden.`);
      const result = await renderProductionFlow(packet, root, path.join(root, "checkpoints"), lock.assertOwned, {
        hideTitles: true, reason: "Claude methodology: measured breaths, audio fades, clip selection and a logo after the voice. Scroll still needs replacement.",
        reviewedBy: "Codex technical checks; Shimi listening and picture acceptance pending",
        breaths: { 2: .6, 3: .7 }, ending,
        clips: { "1": { mediaStart: 0, mediaEnd: 2.4, playbackRate: .8, crop: 1 },
          "2": { mediaStart: .8, mediaEnd: 2.95, playbackRate: 1, crop: 1 },
          "3": { mediaStart: 0, mediaEnd: 1.25, playbackRate: .8, crop: 1.15 } },
      });
      variants.push({ name: ending === "cream" ? "Cream background" : "Blurred last scene", url: `/api/media/concepts/${id}/live/finishing/claude-method-v3/${ending}/preview.mp4` });
      if (ending === "cream") mainResult = result;
      console.log(JSON.stringify({ ending, duration: result.duration, audio: result.audioReport }));
    }
    if (!mainResult) throw new Error("No reviewed local output.");
    if (sha256(await readFile(packet.voiceFile)) !== packet.audioSha256) throw new Error("The original Bram recording changed.");
    if (JSON.stringify(before) !== JSON.stringify(await requestReceipts(path.join(base, "requests")))) throw new Error("Provider journal changed during free finishing.");
    await lock.assertOwned();
    // Keep the old deliverable recoverable, along with the immutable approvals.
    const backup = path.join(revision, "previous-montage");
    try { await readFile(path.join(backup, "index.html")); } catch { await cp(path.join(base, "montage"), backup, { recursive: true }); }
    await cp(path.join(revision, "cream"), path.join(base, "montage"), { recursive: true });
    const output = path.join(process.cwd(), "storage/outputs", `${id}.mp4`);
    await copyFile(mainResult.output, output);
    await copyFile(mainResult.output, path.join(process.cwd(), "storage/outputs/cam-bram-finition-v3.mp4"));
    const [job] = await lock.db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    await lock.db.update(schema.jobs).set({ outputPath: output, params: { ...job.params as object, finalDurationSeconds: mainResult.duration,
      formatExports: undefined, finishingRevision: sha256(await readFile(output)), editorialReview: "pending-scroll-and-listening" } }).where(eq(schema.jobs.id, id));
    await writeFile(path.join(base, "finishing-review.json"), JSON.stringify({ status: "pending-scroll-and-listening", variants,
      listeningUrl: `/api/media/concepts/${id}/live/finishing/claude-method-v3/cream/controls/transition-listening.wav`,
      waveformUrl: `/api/media/concepts/${id}/live/finishing/claude-method-v3/cream/controls/waveform-ending.png`,
      reportUrl: `/api/media/concepts/${id}/live/finishing/claude-method-v3/cream/controls/audio-report.json`,
      newPaidRequests: 0, sourceTailNeedsListening: mainResult.audioReport.sourceTail,
      message: "Free finishing preview. Scene 2 still needs replacement; its movement is not approved. Listen to the voice ending and compare the two CAM signatures before approval." }, null, 2));
    console.log("Free previews published. Original recording and all eight requests preserved. Editorial acceptance remains pending.");
  } finally { await lock.release(); await pool.end(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
