/** Existing local audio -> import/review -> exact montage, with no provider calls. */
process.env.PROVIDER_MODE = "dryrun"; process.env.BRAIN_MODE = "mock";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { POST as frame } from "../src/app/api/productions/route";
import { POST as upload, PATCH as patch } from "../src/app/api/jobs/[id]/narration/route";
import { POST as importScene, PATCH as sceneSettings } from "../src/app/api/jobs/[id]/preparation/route";
import { GET as getJob } from "../src/app/api/jobs/[id]/route";
import { GET as getPlan } from "../src/app/api/jobs/[id]/generation-plan/route";
import { GET as getDossier } from "../src/app/api/jobs/[id]/dossier/route";
import { POST as confirm } from "../src/app/api/jobs/[id]/confirm/route";
import { localNarration } from "../src/lib/concept/local-voice";
import { sha256 } from "../src/lib/concept/checkpoints";
import { runJob } from "../src/lib/runner";
import { acquireJobLock } from "../src/lib/job-lock";
import type { ConceptPreparation } from "../src/lib/concept/preparation";
import type { ProductionParams } from "../src/lib/brain";
import { getRecipe } from "../src/lib/recipes";
import { productionFixture } from "../src/lib/concept/production-rehearsal";
import { advanceProductionFlow } from "../src/lib/concept/production-flow";

let networkAttempts = 0;
globalThis.fetch = async () => { networkAttempts++; throw new Error("External fetch forbidden."); };
async function main() {
  const script = "Offline recording test. Check every spoken word.";
  const response = await frame(new Request("http://localhost/productions", { method: "POST", body: JSON.stringify({ script, mode: "auto", overrides: { aspectRatio: "16:9" } }) }));
  assert.equal(response.status, 200); const draft = await response.json(), id = draft.jobId;
  const context = { params: Promise.resolve({ id }) }, qa = path.join(process.cwd(), "storage/qa", `narration-${id}`);
  await mkdir(path.join(qa, "assets"), { recursive: true });
  const timing = await localNarration(qa, draft.preparation.shots.map((s: { narration: string }) => s.narration), "local-en");
  const wav = await readFile(path.join(qa, "assets/narration.wav"));
  const send = async (bytes: Buffer, currentId = "") => {
    const form = new FormData(); form.set("file", new File([new Uint8Array(bytes)], "test.wav")); form.set("speaker", "test"); form.set("sourceNote", "Offline Daniel fixture; timestamps approximate, not a CAM voice approval"); form.set("currentId", currentId);
    return upload(new Request("http://localhost/narration", { method: "POST", body: form }), context);
  };
  const change = (body: unknown) => patch(new Request("http://localhost/narration", { method: "PATCH", body: JSON.stringify(body) }), context);
  const read = async (): Promise<ConceptPreparation> => (await (await getJob(new Request("http://localhost/job"), context)).json()).preparation;
  assert.equal((await send(Buffer.from("invalid audio"))).status, 400);
  assert.equal((await send(Buffer.from("#EXTM3U\n#EXTINF:4,\nfile:///invalid\n"))).status, 400);
  assert.equal((await send(wav)).status, 200);
  let prep = await read(), voice = prep.narration!;
  assert.equal(voice.selected, false); assert.equal(voice.hasTiming, false);
  const approve = () => change({ action: "review", target: voice.target, decision: "approved", note: "Offline test only", listened: true, checkedWords: true });
  assert.equal((await approve()).status, 400);
  assert.equal((await change({ action: "select", target: voice.target })).status, 400);
  const words = timing.words.map(({ word, start, end }) => ({ word, start, end }));
  const times = () => ({ audioSha256: voice.audioSha256, scriptSha256: voice.scriptSha256, words });
  const saveTiming = () => change({ action: "timing", id: voice.id, target: voice.target, timing: times() });
  assert.equal((await change({ action: "timing", id: voice.id, target: voice.target, timing: { ...times(), audioSha256: "f".repeat(64) } })).status, 400);
  assert.equal((await change({ action: "timing", id: voice.id, target: voice.target, timing: { ...times(), words: words.slice(1) } })).status, 400);
  const initialTimingTarget = voice.target;
  assert.equal((await saveTiming()).status, 200); voice = (await read()).narration!;
  assert.equal((await change({ action: "timing", id: voice.id, target: initialTimingTarget, timing: times() })).status, 409); // same audio, newer timing saved by another tab
  assert.equal((await change({ action: "review", target: voice.target, decision: "approved", note: "", listened: false, checkedWords: true })).status, 400);
  assert.equal((await change({ action: "review", target: voice.target, decision: "rejected", note: "", listened: false, checkedWords: false })).status, 400);
  assert.equal((await change({ action: "review", target: voice.target, decision: "rejected", note: "Offline rejection fixture", listened: false, checkedWords: false })).status, 200);
  assert.equal((await change({ action: "select", target: voice.target })).status, 400);
  assert.equal((await approve()).status, 200); const review = (await read()).narration!.history.at(-1)!;
  assert.equal((await approve()).status, 200); assert.equal((await read()).narration!.history.at(-1)!.id, review.id);
  assert.equal((await change({ action: "select", target: voice.target })).status, 200);
  prep = await read(); assert.equal(prep.wordTiming, "operator-supplied"); assert.equal(prep.generation.reusedVoice, true);
  assert(prep.quote!.lines.filter((l) => ["voice", "voice-alignment"].includes(l.id)).every((l) => l.quantity === 0 && l.amount === 0));
  const firstId = voice.id, firstTarget = voice.target;
  assert.equal((await send(wav)).status, 409); // stale tab cannot replace
  assert.equal((await send(wav, voice.id)).status, 200); voice = (await read()).narration!;
  assert.equal(voice.selected, false); assert.equal(voice.hasTiming, false); assert.equal(voice.review.status, "stale");
  assert.equal((await change({ action: "review", target: firstTarget, decision: "approved", note: "", listened: true, checkedWords: true })).status, 409);
  assert.equal((await change({ action: "timing", id: firstId, target: firstTarget, timing: times() })).status, 409);
  assert.equal((await saveTiming()).status, 200); voice = (await read()).narration!;
  assert.equal((await approve()).status, 200);
  assert.equal((await change({ action: "select", target: voice.target })).status, 200);
  const file = path.join(process.cwd(), "storage", voice.url.replace("/api/media/", "")), normalized = await readFile(file);
  await writeFile(file, "tampered QA voice");
  assert.equal((await read()).readiness.canPreview, false);
  assert.equal((await confirm(new Request("http://localhost/confirm", { method: "POST" }), context)).status, 409);
  assert.equal((await getDossier(new Request("http://localhost/dossier"), context)).status, 409);
  await writeFile(file, normalized);
  const image = await readFile("public/recipes/cam-clay/narrator.png");
  for (const shot of prep.shots) {
    const form = new FormData(); form.set("scene", String(shot.index)); form.set("file", new File([new Uint8Array(image)], "existing-reference.png"));
    const imported = await importScene(new Request("http://localhost/preparation", { method: "POST", body: form }), context); assert.equal(imported.status, 200);
    const current = (await read()).shots.find((s) => s.index === shot.index)!;
    assert.equal((await sceneSettings(new Request("http://localhost/preparation", { method: "PATCH", body: JSON.stringify({ reviewScene: shot.index, target: current.review!.target, decision: "approved", note: "Offline technical fixture" }) }), context)).status, 200);
  }
  prep = await read(); assert.equal(prep.readiness.completeLocalInputs, true);
  const plan = await (await getPlan(new Request("http://localhost/plan"), context)).json();
  assert.equal(plan.reusedVoice.audioSha256, sha256(normalized)); assert.equal(plan.canExecute, false);
  const dossier = await (await getDossier(new Request("http://localhost/dossier"), context)).json();
  assert.equal(dossier.execution.paidGenerationAuthorized, false); assert.equal(dossier.recording.identityVerified, false);
  await writeFile(path.join(qa, "word-timings.json"), JSON.stringify(times(), null, 2));
  if (process.argv.includes("--prepare-only")) { console.log(JSON.stringify({ jobId: id, qa, voice: file, draft: true })); return; }
  const held = await acquireJobLock(id); assert(held);
  try {
    assert.equal((await change({ action: "select", target: voice.target })).status, 409);
    const [current] = await held.db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    const params = current.params as ProductionParams;
    const fixture = await productionFixture({ jobId: id, directory: path.join(qa, "full-flow"), script, params, recipe: getRecipe(params.templateSlug)!, voiceFile: file, timing, assertOwned: held.assertOwned });
    fixture.services.review = (request) => fixture.decide(request);
    const flow = await advanceProductionFlow(fixture.flow);
    assert.equal(flow.status, "ready-to-render"); assert(flow.events.some((e) => e.stage === "reuse-reviewed-recording"));
    assert.equal(flow.plan?.reusedVoice?.audioSha256, sha256(normalized));
    assert.deepEqual(fixture.stats, { submissions: 0, uploads: 0, downloads: 0 });
    assert.equal(flow.render?.audioSha256, sha256(normalized));
  } finally { await held.release(); }
  await db.update(schema.jobs).set({ status: "confirmed", confirmedAt: new Date() }).where(eq(schema.jobs.id, id));
  assert.equal((await saveTiming()).status, 409); assert.equal((await send(wav, voice.id)).status, 409);
  await writeFile(file, "changed after confirmation"); await runJob(id);
  assert.equal((await db.select().from(schema.jobs).where(eq(schema.jobs.id, id)))[0].status, "failed");
  await writeFile(file, normalized);
  await Promise.all([runJob(id, { resume: true }), runJob(id, { resume: true })]);
  let job = (await db.select().from(schema.jobs).where(eq(schema.jobs.id, id)))[0]; assert.equal(job.status, "succeeded", job.error ?? "render failed");
  const artifacts = () => (job.params as { artifacts: { label: string; url: string }[] }).artifacts;
  const artifact = (label: string) => path.join(process.cwd(), "storage", artifacts().find((a) => a.label === label)!.url.replace("/api/media/", ""));
  assert.equal(sha256(await readFile(artifact("Listen to imported recording"))), sha256(normalized));
  assert.deepEqual(JSON.parse(await readFile(artifact("Timing"), "utf8")).words, words);
  assert.equal(JSON.parse(await readFile(artifact("Media provenance"), "utf8")).voice.source, "local-import");
  assert.equal(JSON.parse(await readFile(artifact("Production dossier"), "utf8")).readiness.completeLocalInputs, true);
  assert(!artifacts().some((a) => a.label === "Listen to test voice"));
  await db.update(schema.jobs).set({ status: "failed", error: "Offline recovery fixture after rendering" }).where(eq(schema.jobs.id, id));
  await Promise.all([runJob(id, { resume: true }), runJob(id, { resume: true })]);
  job = (await db.select().from(schema.jobs).where(eq(schema.jobs.id, id)))[0]; assert.equal(job.status, "succeeded"); assert.equal((job.params as { renderReused: boolean }).renderReused, true);
  assert.equal(sha256(await readFile(artifact("Listen to imported recording"))), sha256(normalized));
  const ledger = await db.select().from(schema.creditLedger).where(eq(schema.creditLedger.jobId, id)); assert.equal(ledger.length, 0);
  assert.equal(networkAttempts, 0); assert.equal(Number(job.billedUsd), 0);
  const proof = { jobId: id, status: job.status, duration: prep.durationSeconds, audioSha256: sha256(normalized),
    importedVoice: "Daniel test recording", wordTimings: "approximate QA fixture, operator-input path", finalBramVoiceApproved: false,
    staleTabBlocked: true, staleTimingEditBlocked: true, approvalRequired: true, postConfirmationTamperBlocked: true, exactAudioUsed: true, quoteReuse: true, dossierExported: true, cachedRenderReused: true, fullFlowReusedImportsWithoutRequests: true,
    networkAttempts, ledgerEntries: ledger.length, billedUsd: Number(job.billedUsd), output: job.outputPath };
  await writeFile(path.join(process.cwd(), "storage/qa/cam-narration-proof.json"), JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof, null, 2));
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
