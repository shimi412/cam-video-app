/** Actual OS voice + image/clip imports + local rendering; external fetch is forbidden. */
process.env.PROVIDER_MODE = "dryrun";
process.env.BRAIN_MODE = "mock";

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { POST as frame } from "../src/app/api/productions/route";
import { GET as readJob } from "../src/app/api/jobs/[id]/route";
import { PATCH, POST as upload } from "../src/app/api/jobs/[id]/preparation/route";
import { POST as confirm } from "../src/app/api/jobs/[id]/confirm/route";
import { acquireJobLock } from "../src/lib/job-lock";
import { runJob } from "../src/lib/runner";
import type { ConceptPreparation } from "../src/lib/concept/preparation";
import { normalizedText } from "../src/lib/concept/text";

const exec = promisify(execFile);
let networkAttempts = 0;
globalThis.fetch = async () => { networkAttempts++; throw new Error("External fetch forbidden in local media test."); };

async function main() {
  const qa = path.join(process.cwd(), "storage/qa");
  await mkdir(qa, { recursive: true });
  const script = "Read the original passage before sharing a claim.\nCheck who wrote it and when it was published.\nCompare the surrounding context, then explain what the source actually says.";
  const framed = await frame(new Request("http://localhost/api/productions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ script, mode: "auto", overrides: { aspectRatio: "16:9" } }) }));
  assert.equal(framed.status, 200);
  const draft = await framed.json(), id = draft.jobId;
  const context = { params: Promise.resolve({ id }) };
  const settings = (body: unknown) => PATCH(new Request("http://localhost/preparation", { method: "PATCH", body: JSON.stringify(body) }), context);
  assert.equal((await settings({ previewVoice: "local-en" })).status, 200);
  assert.equal((await settings({ previewVoice: "fal/dylan" })).status, 400);
  const send = async (scene: number, bytes: Buffer, name: string) => {
    const form = new FormData(); form.set("scene", String(scene)); form.set("file", new File([new Uint8Array(bytes)], name));
    return upload(new Request("http://localhost/preparation", { method: "POST", body: form }), context);
  };
  const image = await readFile("public/recipes/cam-clay/narrator.png");
  assert.equal((await send(1, image, "image.png")).status, 200);
  assert.equal((await send(99, image, "image.png")).status, 400);
  assert.equal((await send(2, Buffer.from("<svg><script>alert(1)</script></svg>"), "image.png")).status, 400);
  const clip = path.join(qa, "local-media-test-clip.mp4");
  // Deliberately recognizable calibration footage, with an unwanted tone to test audio removal.
  await exec("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", "1.5", "-c:v", "libx264", "-c:a", "aac", clip]);
  assert.equal((await send(2, await readFile(clip), "clip.mp4")).status, 200);
  assert.equal((await settings({ removeScene: 1 })).status, 200);
  assert.equal((await send(1, image, "image.png")).status, 200);
  const restored = await (await readJob(new Request("http://localhost/job"), context)).json();
  assert.equal(restored.draft.preparation.voice.preview, "local-en");
  assert.equal(restored.draft.preparation.shots.filter((s: { media: unknown }) => s.media).length, 2);
  const editing = await acquireJobLock(id);
  assert(editing);
  try { assert.equal((await confirm(new Request("http://localhost/confirm", { method: "POST" }), context)).status, 409); }
  finally { await editing.release(); }
  const importedVideo = restored.draft.preparation.shots[1].media;
  const { stdout: importedProbe } = await exec("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "json", path.join(process.cwd(), "storage", importedVideo.url.replace("/api/media/", ""))]);
  assert.equal(JSON.parse(importedProbe).streams.some((s: { codec_type: string }) => s.codec_type === "audio"), false);
  await db.update(schema.jobs).set({ status: "confirmed", confirmedAt: new Date() }).where(eq(schema.jobs.id, id));
  assert.equal((await settings({ previewVoice: "silent" })).status, 409);
  console.log(`Rendering local voice/import proof ${id}`);
  const started = Date.now();
  await Promise.all([runJob(id), runJob(id)]);
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  assert.equal(job.status, "succeeded", job.error ?? "Preview failed");
  const params = job.params as { preparation: ConceptPreparation; artifacts: { label: string; url: string }[] };
  assert.equal(params.preparation.measuredScenes, true);
  assert.equal(normalizedText(params.preparation.shots.map((s) => s.narration).join(" ")), normalizedText(script));
  const artifact = (label: string) => path.join(process.cwd(), "storage", params.artifacts.find((a) => a.label === label)!.url.replace("/api/media/", ""));
  const provenance = JSON.parse(await readFile(artifact("Media provenance"), "utf8"));
  const qc = JSON.parse(await readFile(artifact("Quality checks"), "utf8"));
  assert((await readFile(artifact("Subtitles (SRT)"), "utf8")).includes("Read the original passage"));
  assert.equal(provenance.voice.name, "Daniel");
  assert(provenance.scenes[1].media.heldSeconds > 0);
  assert(qc.audio.meanDb > -45);
  // Simulate interruption after a completed render. Keep the exact voice, then recover the render.
  const firstVoice = await readFile(artifact("Listen to test voice"));
  await db.update(schema.jobs).set({ status: "failed", error: "Integration test: interrupted after rendering" }).where(eq(schema.jobs.id, id));
  await Promise.all([runJob(id, { resume: true }), runJob(id, { resume: true })]);
  const [resumed] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  assert.equal(resumed.status, "succeeded");
  const recovered = resumed.params as { renderReused: boolean; artifacts: { label: string; url: string }[] };
  assert.equal(recovered.renderReused, true);
  const recoveredVoice = path.join(process.cwd(), "storage", recovered.artifacts.find((a) => a.label === "Listen to test voice")!.url.replace("/api/media/", ""));
  assert(firstVoice.equals(await readFile(recoveredVoice)));
  const ledger = await db.select().from(schema.creditLedger).where(eq(schema.creditLedger.jobId, id));
  const calls = await db.select().from(schema.apiCalls).where(eq(schema.apiCalls.jobId, id));
  assert.equal(Number(job.billedUsd), 0); assert.equal(ledger.length, 0);
  assert.equal(calls.length, 1); assert.equal(Number(calls[0].realCostUsd), 0); assert.equal(networkAttempts, 0);
  const proof = { jobId: id, seconds: (Date.now() - started) / 1000, status: resumed.status, duration: params.preparation.durationSeconds, voice: provenance.voice, importedScenes: 2, placeholderScenes: 1, heldSeconds: provenance.scenes[1].media.heldSeconds, audio: qc.audio, recoveredIdenticalVoice: true, recoveredRender: recovered.renderReused, output: resumed.outputPath, ledgerEntries: ledger.length, networkAttempts, billedUsd: 0 };
  await writeFile(path.join(qa, "cam-local-media-proof.json"), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
