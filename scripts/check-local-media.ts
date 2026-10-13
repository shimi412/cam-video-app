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
import { GET as exportPlan } from "../src/app/api/jobs/[id]/generation-plan/route";
import { GET as voiceReference } from "../src/app/api/cam-voice/route";
import { suggestDirection } from "../src/lib/concept/direction";
import { randomUUID } from "node:crypto";
import { createBudget, quoteHash, budgetUsage, type BudgetQuote } from "../src/lib/concept/budget";
import { postgresBudgetStore } from "../src/lib/concept/budget-store";
import { downloadResult, type AssetTransport } from "../src/lib/concept/media-transfers";
import { sha256 } from "../src/lib/concept/checkpoints";
import { verifiedSceneMedia } from "../src/lib/concept/imported-media";

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
  // Two workers compete for a shared provider cap in actual PostgreSQL.
  const budgetScope = `test-${randomUUID()}`, caps = { usd: 100, "higgsfield-credit": 100 };
  const createReservation = () => {
    const plan = sha256(randomUUID()), fingerprint = sha256("fake-operation");
    const quote: BudgetQuote = { plan, source: "simulation-fixture", expiresAt: Date.now() + 60_000, lines: [{ operation: fingerprint, unit: "usd", maximum: 60 }] };
    return { jobId: id, plan, operations: [{ fingerprint, transport: "fal-queue" }], quote,
      approval: { id: randomUUID(), mode: "simulation" as const, plan, quote: quoteHash(quote), caps, expiresAt: quote.expiresAt } };
  };
  const a = createBudget(postgresBudgetStore("simulation", budgetScope), caps), b = createBudget(postgresBudgetStore("simulation", budgetScope), caps);
  const reservations = await Promise.allSettled([a.reserve(createReservation()), b.reserve(createReservation())]);
  assert.equal(reservations.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(reservations.filter((r) => r.status === "rejected").length, 1);
  assert.equal(budgetUsage(await createBudget(postgresBudgetStore("simulation", budgetScope), caps).snapshot()).usd, 60);
  assert.equal(draft.preparation.generation.downloadUrl, `/api/jobs/${id}/generation-plan`);
  assert(draft.estimate.unpriced.includes("Bram voice · quote required"));
  const context = { params: Promise.resolve({ id }) };
  const settings = (body: unknown) => PATCH(new Request("http://localhost/preparation", { method: "PATCH", body: JSON.stringify(body) }), context);
  assert.equal((await settings({ previewVoice: "local-en" })).status, 200);
  assert.equal((await settings({ previewVoice: "fal/dylan" })).status, 400);
  const beforePlan = await (await exportPlan(new Request("http://localhost/plan"), context)).json();
  const direction = { ...suggestDirection("context"), overlay: "CHECK THE CONTEXT", endScene: "The paper strip now sits inside the open book, with the narrator in the same pose." };
  assert.equal((await settings({ scene: 3, direction: { ...direction, narration: "Changed words" } })).status, 400);
  assert.equal((await settings({ scene: 36, direction })).status, 400);
  assert.equal((await settings({ scene: 3, direction })).status, 200);
  const afterPlan = await (await exportPlan(new Request("http://localhost/plan"), context)).json();
  assert.notEqual(afterPlan.fingerprint, beforePlan.fingerprint);
  assert.equal(afterPlan.operations[0].input.voice_id, "549ff70a-3ee7-4f04-a4d9-89a24fab7709");
  assert(afterPlan.operations.some((op: { id: string }) => op.id === "scene-3-end"));
  const recording = await voiceReference(new Request("http://localhost/voice", { headers: { range: "bytes=0-43" } }));
  assert.equal(recording.status, 206); assert.equal((await recording.arrayBuffer()).byteLength, 44);
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
  let clipDownloads = 0;
  const transfers: AssetTransport = { mode: "simulation", upload: async () => { throw new Error("Unused"); }, download: async () => { clipDownloads++; return new Response(new Uint8Array(await readFile(clip))); } };
  const transfer = { directory: path.join(qa, `transfers-${id}`), transport: transfers, jobId: id, fingerprint: sha256("fixture-clip"), kind: "video" as const, provider: "fal" as const, url: "https://simulation.invalid/clip.mp4", assertOwned: async () => {} };
  const downloaded = await downloadResult(transfer);
  assert(downloaded.media); assert.equal(downloaded.media.kind, "video");
  assert.equal((await downloadResult(transfer)).reused, true); assert.equal(clipDownloads, 1);
  const verified = await verifiedSceneMedia(id, downloaded.media);
  const { stdout: clipProbe } = await exec("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "json", verified.file]);
  assert(!JSON.parse(clipProbe).streams.some((s: { codec_type: string }) => s.codec_type === "audio"));
  assert.equal((await send(2, await readFile(clip), "clip.mp4")).status, 200);
  assert.equal((await settings({ removeScene: 1 })).status, 200);
  assert.equal((await send(1, image, "image.png")).status, 200);
  const restored = await (await readJob(new Request("http://localhost/job"), context)).json();
  assert.equal((await confirm(new Request("http://localhost/confirm", { method: "POST" }), context)).status, 409);
  for (const shot of restored.draft.preparation.shots.filter((s: { media: unknown }) => s.media)) {
    assert.equal((await settings({ reviewScene: shot.index, target: shot.review.target, decision: "approved", note: "Offline integration fixture, not final CAM artwork." })).status, 200);
  }
  assert.equal(restored.draft.preparation.voice.preview, "local-en");
  assert.equal(restored.draft.preparation.shots[2].scene, direction.scene);
  assert.equal(restored.draft.preparation.shots[2].overlay, direction.overlay);
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
  assert.equal((await settings({ scene: 3, direction })).status, 409);
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
  const generation = JSON.parse(await readFile(artifact("Generation plan (not submitted)"), "utf8"));
  const rehearsal = JSON.parse(await readFile(artifact("Pipeline rehearsal (simulation)"), "utf8"));
  const delivery = JSON.parse(await readFile(artifact("File transfer & voice sync checks (simulation)"), "utf8"));
  const budgetReport = JSON.parse(await readFile(artifact("Budget checks (simulation)"), "utf8"));
  assert.equal(delivery.mode, "simulation"); assert.equal(delivery.finalBramVoiceApproved, false);
  assert.equal(delivery.paidRequests, 0); assert.equal(delivery.uploads, 3); assert.equal(delivery.downloads, 2);
  assert(Math.abs(delivery.synchronizedDuration - params.preparation.durationSeconds) < .02);
  const budgetEntries = Object.values(budgetReport.book.reservations).flatMap((r) => (r as { entries: { state: string }[] }).entries);
  assert(budgetEntries.length > 0); assert(budgetEntries.every((entry) => entry.state === "settled"));
  assert.equal(params.preparation.generation.downloadUrl, params.artifacts.find((a) => a.label === "Generation plan (not submitted)")!.url);
  assert.equal(generation.canExecute, false); assert.equal(generation.reusedScenes.length, 2);
  assert.equal(rehearsal.mediaGenerated, false); assert.equal(rehearsal.paidRequests, 0);
  assert.equal(rehearsal.operations.length, 5);
  assert.equal(params.preparation.shots[2].scene, direction.scene);
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
  const recoveredDeliveryPath = path.join(process.cwd(), "storage", recovered.artifacts.find((a) => a.label === "File transfer & voice sync checks (simulation)")!.url.replace("/api/media/", ""));
  const recoveredDelivery = JSON.parse(await readFile(recoveredDeliveryPath, "utf8"));
  assert.equal(recoveredDelivery.uploads, 0); assert.equal(recoveredDelivery.downloads, 0);
  assert.equal(recoveredDelivery.audioSha256, delivery.audioSha256); assert.equal(recoveredDelivery.alignmentSha256, delivery.alignmentSha256);
  const ledger = await db.select().from(schema.creditLedger).where(eq(schema.creditLedger.jobId, id));
  const calls = await db.select().from(schema.apiCalls).where(eq(schema.apiCalls.jobId, id));
  assert.equal(Number(job.billedUsd), 0); assert.equal(ledger.length, 0);
  assert.equal(calls.length, 1); assert.equal(Number(calls[0].realCostUsd), 0); assert.equal(networkAttempts, 0);
  const proof = { jobId: id, seconds: (Date.now() - started) / 1000, status: resumed.status, duration: params.preparation.durationSeconds, voice: provenance.voice, importedScenes: 2, placeholderScenes: 1, heldSeconds: provenance.scenes[1].media.heldSeconds, audio: qc.audio, recoveredIdenticalVoice: true, recoveredRender: recovered.renderReused, delivery: { verified: true, reusedWithoutTransfer: true, clipAudioRemoved: true, finalBramVoiceApproved: false }, budget: { concurrencyVerified: true, unknownCostsReserved: true, customerDebit: 0 }, output: resumed.outputPath, ledgerEntries: ledger.length, networkAttempts, billedUsd: 0 };
  await writeFile(path.join(qa, "cam-local-media-proof.json"), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
