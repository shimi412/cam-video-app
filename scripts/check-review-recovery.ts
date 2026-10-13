/** Integration proof using the real DB/routes and durable offline provider fixture. */
process.env.PROVIDER_MODE = "dryrun";
process.env.BRAIN_MODE = "mock";
import assert from "node:assert/strict";
import { z } from "zod";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { POST as frame } from "../src/app/api/productions/route";
import { PATCH, POST as upload } from "../src/app/api/jobs/[id]/preparation/route";
import { POST as confirm } from "../src/app/api/jobs/[id]/confirm/route";
import { POST as resume } from "../src/app/api/jobs/[id]/resume/route";
import { GET as readJob } from "../src/app/api/jobs/[id]/route";
import { GET as requests, POST as reconcile } from "../src/app/api/jobs/[id]/requests/route";
import { acquireJobLock } from "../src/lib/job-lock";
import { runJob } from "../src/lib/runner";
import type { ProductionParams } from "../src/lib/brain";
import { getRecipe } from "../src/lib/recipes";
import { planConcept } from "../src/lib/concept/storyboard";
import { placeholderTiming } from "../src/lib/concept/timing";
import { generationPlan, materializeRequest } from "../src/lib/concept/generation-plan";
import { lockedAssets } from "../src/lib/concept/assets";
import { rehearsalBudget } from "../src/lib/concept/rehearsal-budget";
import { budgetedQueue, budgetUsage } from "../src/lib/concept/budget";
import { simulatedProvider } from "../src/lib/concept/simulated-provider";
import { advanceRequest, requestReceipts } from "../src/lib/concept/request-journal";
import { REQUEST_DIRECTORY, ACCEPTANCE_DIRECTORY } from "../src/lib/concept/request-recovery";

let networkAttempts = 0;
globalThis.fetch = async () => { networkAttempts++; throw new Error("External fetch forbidden."); };
async function main() {
  const qa = path.join(process.cwd(), "storage/qa"); await mkdir(qa, { recursive: true });
  const script = "Offline test: check image review and request recovery.";
  const existingId = process.argv.includes("--interrupt-job") ? process.argv[process.argv.indexOf("--interrupt-job") + 1] : null;
  if (existingId) {
    z.uuid().parse(existingId); assert(process.argv.includes("--prepare-only"));
    const [existing] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, existingId));
    assert(existing && existing.status === "estimated" && existing.script === script, "Only this exact offline QA draft can be interrupted.");
  }
  let id = existingId;
  if (!id) {
    const response = await frame(new Request("http://localhost/api/productions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ script, mode: "auto", overrides: { aspectRatio: "16:9" } }) }));
    assert.equal(response.status, 200); const draft = await response.json(); id = z.uuid().parse(draft.jobId);
  }
  assert(id);
  const context = { params: Promise.resolve({ id }) };
  const settings = (body: unknown) => PATCH(new Request("http://localhost/preparation", { method: "PATCH", body: JSON.stringify(body) }), context);
  const current = async () => (await (await readJob(new Request("http://localhost/job"), context)).json()).draft.preparation;
  const blockedConfirm = async () => assert.equal((await confirm(new Request("http://localhost/confirm", { method: "POST" }), context)).status, 409);
  if (!existingId) {
    // A deliberately non-editorial calibration image. No generation or character approval.
    const png = await sharp({ create: { width: 960, height: 540, channels: 3, background: "#293850" } }).composite([{ input: Buffer.from('<svg width="960" height="540"><rect x="30" y="30" width="900" height="480" fill="none" stroke="#54c2b4" stroke-width="8"/><text x="480" y="260" fill="white" font-family="sans-serif" font-size="54" text-anchor="middle">OFFLINE TEST</text><text x="480" y="330" fill="white" font-family="sans-serif" font-size="26" text-anchor="middle">Image review and request recovery</text></svg>') }]).png().toBuffer();
    await writeFile(path.join(qa, "review-test-image.png"), png);
    async function send() {
      const form = new FormData(); form.set("scene", "1"); form.set("file", new File([new Uint8Array(png)], "offline-test.png"));
      assert.equal((await upload(new Request("http://localhost/preparation", { method: "POST", body: form }), context)).status, 200);
    }
    await send(); let prep = await current(); const firstTarget = prep.shots[0].review.target;
    await blockedConfirm();
    assert.equal((await settings({ reviewScene: 1, target: firstTarget, decision: "rejected", note: "" })).status, 400);
    assert.equal((await settings({ reviewScene: 1, target: firstTarget, decision: "rejected", note: "Offline fixture: demonstrate rejection." })).status, 200);
    assert.equal((await current()).shots[0].review.status, "rejected"); await blockedConfirm();
    assert.equal((await settings({ reviewScene: 1, target: firstTarget, decision: "approved", note: "Offline fixture only." })).status, 200);
    const shot = prep.shots[0];
    const direction = { scene: shot.scene, motion: shot.motion, references: shot.references, endScene: shot.endScene, overlay: "OFFLINE TEST", strike: false };
    assert.equal((await settings({ scene: 1, direction })).status, 200);
    assert.equal((await current()).shots[0].review.status, "stale"); await blockedConfirm();
    assert.equal((await settings({ reviewScene: 1, target: firstTarget, decision: "approved", note: "stale tab" })).status, 409);
    await send(); prep = await current(); const target = prep.shots[0].review.target; assert.notEqual(target, firstTarget);
    const approve = { reviewScene: 1, target, decision: "approved", note: "Offline fixture only, not final CAM artwork." };
    for (const response of await Promise.all([settings(approve), settings(approve)])) assert([200, 409].includes(response.status));
    assert.equal((await settings(approve)).status, 200);
    assert.equal((await current()).shots[0].review.status, "approved");
    const [checked] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    assert.equal((checked.params as ProductionParams).sceneReviews?.[1].filter((r) => r.target === target).length, 1);
  }
  assert.equal((await current()).shots[0].review.status, "approved");
  const [reviewed] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  const params = reviewed.params as ProductionParams;
  const root = path.join(process.cwd(), "storage/concepts", id, "checkpoints");
  const directory = path.join(root, "simulated-requests", REQUEST_DIRECTORY);
  const lock = await acquireJobLock(id); assert(lock);
  let submits = 0;
  const board = planConcept(script, getRecipe(params.templateSlug)!, params.aspectRatio, params.sceneDirections);
  const plan = generationPlan(script, params, board, placeholderTiming(board.shots.map((s) => s.narration)), await lockedAssets());
  let originalId: string, heldBefore: ReturnType<typeof budgetUsage>;
  try {
    await lock.db.update(schema.jobs).set({ status: "confirmed", confirmedAt: new Date() }).where(eq(schema.jobs.id, id));
    const reserved = await rehearsalBudget(plan, id, root, lock.assertOwned);
    const operation = plan.operations[0];
    const provider = simulatedProvider({ directory: path.join(root, "simulated-requests", ACCEPTANCE_DIRECTORY), jobId: id, operation, payload: materializeRequest(operation, {}), transcript: {}, assertOwned: lock.assertOwned });
    const interrupted = { ...provider.queue, async submit() { submits++; await provider.queue.submit(); throw new Error("Simulated response lost after acceptance"); } };
    const input = { directory, fingerprint: operation.fingerprint, binding: provider.binding, assertOwned: lock.assertOwned, queue: budgetedQueue(interrupted, reserved.budget, reserved.approval.id, operation.fingerprint) };
    await assert.rejects(advanceRequest(input), /response lost/);
    await assert.rejects(advanceRequest(input), /outcome unknown/);
    assert.equal(submits, 1);
    originalId = `simulation-${operation.fingerprint}`;
    heldBefore = budgetUsage(await reserved.budget.snapshot());
    assert.equal((await reserved.budget.snapshot()).reservations[reserved.approval.id].entries.find((e) => e.operation === operation.fingerprint)?.state, "attempted");
    await lock.db.update(schema.jobs).set({ status: "failed", error: "Offline test: response lost after acceptance. Check the saved receipt, then resume.", finishedAt: new Date() }).where(eq(schema.jobs.id, id));
  } finally { await lock.release(); }
  assert.equal((await settings({ previewVoice: "silent" })).status, 409);
  const savedRequests = await (await requests(new Request("http://localhost/requests"), context)).json();
  assert.equal(savedRequests.requests[0].state, "submitting"); assert.equal(savedRequests.requests[0].canReconcile, true);
  assert.equal((await resume(new Request("http://localhost/resume", { method: "POST" }), context)).status, 409);
  if (process.argv.includes("--prepare-only")) {
    await writeFile(path.join(qa, "cam-review-browser-fixture.json"), JSON.stringify({ jobId: id, originalId, networkAttempts, paidRequests: 0 }, null, 2));
    console.log(JSON.stringify({ jobId: id, originalId, networkAttempts, note: "Ready for browser recovery test." })); return;
  }
  const body = { fingerprint: plan.operations[0].fingerprint };
  const check = () => reconcile(new Request("http://localhost/requests", { method: "POST", body: JSON.stringify(body) }), context);
  assert.equal((await check()).status, 200); assert.equal((await check()).status, 200);
  const reserved = await rehearsalBudget(plan, id, root, async () => {});
  assert.deepEqual(budgetUsage(await reserved.budget.snapshot()), heldBefore!);
  assert.equal((await requestReceipts(directory))[0].requestId, originalId!);
  await Promise.all([runJob(id, { resume: true }), runJob(id, { resume: true })]);
  const [completed] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id)); assert.equal(completed.status, "succeeded", completed.error ?? "Failed");
  const final = await requestReceipts(directory); assert(final.every((r) => r.state === "complete"));
  assert.equal(final.find((r) => r.fingerprint === body.fingerprint)?.requestId, originalId!);
  assert.equal((await reserved.budget.snapshot()).reservations[reserved.approval.id].entries.filter((e) => e.state === "settled").length, plan.operations.length);
  const ledger = await db.select().from(schema.creditLedger).where(eq(schema.creditLedger.jobId, id));
  assert.equal(ledger.length, 0); assert.equal(networkAttempts, 0); assert.equal(Number(completed.billedUsd), 0);
  const proof = { jobId: id, originalId, status: completed.status, visualReview: { rejection: true, changedSceneInvalidated: true, replacedFileInvalidated: true, staleTabBlocked: true, idempotentApproval: true }, recovery: { submits, sameRequestId: true, heldBudgetUnchanged: true, duplicateResumeBlocked: true, complete: final.length }, networkAttempts, ledgerEntries: ledger.length, paidRequests: 0, billedUsd: 0 };
  await writeFile(path.join(qa, "cam-review-recovery-proof.json"), JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof, null, 2));
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
