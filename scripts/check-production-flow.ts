/** Complete offline chain with actual media/DB and deliberate interruptions. */
process.env.PROVIDER_MODE = "dryrun"; process.env.BRAIN_MODE = "mock";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { POST as frame } from "../src/app/api/productions/route";
import { GET as requests, POST as reconcile } from "../src/app/api/jobs/[id]/requests/route";
import { POST as resume } from "../src/app/api/jobs/[id]/resume/route";
import { acquireJobLock } from "../src/lib/job-lock";
import type { ProductionParams } from "../src/lib/brain";
import { getRecipe } from "../src/lib/recipes";
import { planConcept } from "../src/lib/concept/storyboard";
import { localNarration } from "../src/lib/concept/local-voice";
import { productionFixture } from "../src/lib/concept/production-rehearsal";
import { advanceProductionFlow, renderProductionFlow, type FlowOutcome } from "../src/lib/concept/production-flow";
import { requestReceipts } from "../src/lib/concept/request-journal";
import { sha256 } from "../src/lib/concept/checkpoints";
import { budgetUsage, createBudget } from "../src/lib/concept/budget";
import { postgresBudgetStore } from "../src/lib/concept/budget-store";
import { attachStage, reviewStage, sceneWorkflow } from "../src/lib/concept/scene-workflow";

let networkAttempts = 0;
globalThis.fetch = async () => { networkAttempts++; throw new Error("External fetch forbidden."); };
async function main() {
  const script = "Offline pipeline test: check every step. Review this second scene.";
  const framed = await frame(new Request("http://localhost/productions", { method: "POST", body: JSON.stringify({ script, mode: "auto", overrides: { aspectRatio: "16:9" } }) }));
  assert.equal(framed.status, 200); const { jobId: id } = await framed.json();
  let lock = await acquireJobLock(id); assert(lock);
  try {
    const [job] = await lock.db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    const params = job.params as ProductionParams, recipe = getRecipe(params.templateSlug)!;
    let board = planConcept(script, recipe, params.aspectRatio);
    const shot = board.shots[0];
    params.sceneDirections = { 1: { scene: shot.scene, motion: shot.motion, references: shot.references, overlay: "OFFLINE TEST", strike: false, endScene: `${shot.scene} The magnifying glass now rests at the far edge of the page.` } };
    board = planConcept(script, recipe, params.aspectRatio, params.sceneDirections);
    const directory = path.join(process.cwd(), "storage/concepts", id, "checkpoints/production-sequence");
    const workspace = path.join(process.cwd(), "storage/qa", `flow-${id}`);
    await mkdir(path.join(workspace, "assets"), { recursive: true });
    const assertOwned = async () => { assert(lock); await lock.assertOwned(); };
    const timing = await localNarration(workspace, board.shots.map((s) => s.narration), "local-en", { directory: path.join(workspace, "voice-cache"), assertOwned });
    const fixture = await productionFixture({ jobId: id, directory, script, params, recipe, voiceFile: path.join(workspace, "assets/narration.wav"), timing, assertOwned });
    const advance = () => advanceProductionFlow(fixture.flow);
    let state = await advance(); assert.equal(state.phase, "script"); assert.equal(fixture.stats.submissions, 0);
    await fixture.decide(state.review!, "rejected"); assert.equal((await advance()).status, "rejected");
    await fixture.decide(state.review!);
    const authorize = fixture.services.authorize; fixture.services.authorize = async () => null;
    assert.equal((await advance()).status, "awaiting-budget"); assert.equal(fixture.stats.submissions, 0);
    fixture.services.authorize = authorize;
    state = await advance(); assert.equal(state.phase, "voice"); assert.equal(state.status, "awaiting-review"); assert.equal(fixture.stats.submissions, 2);
    const voiceReview = state.review!; assert(voiceReview.audio); assert.equal(voiceReview.timing!.estimated, true);
    assert(Math.abs(voiceReview.audio.duration - timing.duration) < .01);
    await advance(); assert.equal(fixture.stats.submissions, 2); // no duplicate voice/transcription
    await fixture.decide(voiceReview); state = await advance(); assert.equal(state.phase, "direction");
    await fixture.decide(state.review!); state = await advance(); assert.equal(state.phase, "start"); assert.equal(fixture.stats.submissions, 3);
    const startImage = state.review!.media!;
    await fixture.decide(state.review!, "rejected"); assert.equal((await advance()).status, "rejected"); assert.equal(fixture.stats.submissions, 3);
    await fixture.decide(state.review!); state = await advance(); assert.equal(state.phase, "end");
    const endImage = state.review!.media!;
    await fixture.decide(state.review!);
    fixture.services.authorize = async (plan) => plan.operations[0].kind === "video" ? null : authorize(plan);
    state = await advance(); assert.equal(state.status, "awaiting-budget"); assert.equal(state.phase, "scene-1-clip");
    assert.equal(state.plan!.timingBasis, "simulation-alignment"); assert(state.plan!.voiceEvidence?.audioSha256);
    const clipSeconds = Number(state.plan!.operations[0].input.duration);
    assert.equal(clipSeconds, Math.max(3, Math.ceil(timing.phrases[1].start)));
    fixture.services.authorize = authorize;
    const queue = fixture.services.queue;
    let delayed = false;
    fixture.services.queue = (op, payload) => {
      const q = queue(op, payload);
      return { ...q, poll: async (requestId) => {
        if (op.id === "scene-1-clip" && !delayed) { delayed = true; return { state: "pending" }; } return q.poll(requestId);
      } };
    };
    state = await advance(); assert.equal(state.status, "pending"); const beforePoll = fixture.stats.submissions;
    state = await advance(); assert.equal(state.phase, "clip"); assert.equal(fixture.stats.submissions, beforePoll);
    await fixture.decide(state.review!); state = await advance(); assert.equal(state.phase, "direction"); assert.equal(state.review!.scene, 2);
    await fixture.decide(state.review!);
    let lost = false;
    fixture.services.queue = (op, payload) => {
      const q = queue(op, payload);
      return { ...q, submit: async () => { const result = await q.submit(); if (op.id === "scene-2-start" && !lost) { lost = true; throw new Error("Lost acceptance response"); } return result; } };
    };
    await assert.rejects(advance(), /Lost acceptance/); const beforeRetry = fixture.stats.submissions;
    await assert.rejects(advance(), /needs reconciliation/); assert.equal(fixture.stats.submissions, beforeRetry);
    const receipts = await requestReceipts(path.join(directory, "requests")), ambiguous = receipts.find((r) => r.state === "submitting")!;
    assert(ambiguous?.binding);
    // The same public recovery route now covers the complete chain's journal.
    await lock.db.update(schema.jobs).set({ status: "failed", error: "Offline QA: response lost after acceptance." }).where(eq(schema.jobs.id, id));
    await lock.release(); lock = null;
    const context = { params: Promise.resolve({ id }) };
    const visible = await (await requests(new Request("http://localhost/requests"), context)).json();
    assert(visible.requests.some((r: { fingerprint: string; canReconcile: boolean }) => r.fingerprint === ambiguous.fingerprint && r.canReconcile));
    assert.equal((await resume(new Request("http://localhost/resume", { method: "POST" }), context)).status, 409);
    const reconciliation = await reconcile(new Request("http://localhost/requests", { method: "POST", body: JSON.stringify({ fingerprint: ambiguous.fingerprint }) }), context);
    assert.equal(reconciliation.status, 200);
    lock = await acquireJobLock(id); assert(lock);
    fixture.services.queue = queue;
    state = await advance(); assert.equal(state.phase, "start"); assert.equal(fixture.stats.submissions, beforeRetry);
    await fixture.decide(state.review!);
    const cost = fixture.services.cost;
    fixture.services.cost = async (op, requestId) => op.id === "scene-2-clip" ? null : cost(op, requestId);
    state = await advance(); assert.equal(state.status, "awaiting-cost"); const beforeCost = fixture.stats.submissions;
    fixture.services.cost = cost;
    state = await advance(); assert.equal(state.phase, "clip"); assert.equal(fixture.stats.submissions, beforeCost);
    await fixture.decide(state.review!);
    state = await advance(); assert.equal(state.status, "ready-to-render"); assert(state.render);
    assert.equal(Object.keys(state.render.media).length, 2); assert.equal(state.render.reviews.length, 9);
    // Tampering with either the packet or approved voice must fail before render.
    await assert.rejects(renderProductionFlow({ ...state.render, audioSha256: "0".repeat(64) }, workspace, directory, assertOwned), /packet changed/);
    const audio = await readFile(state.render.voiceFile); await writeFile(state.render.voiceFile, "tampered QA audio");
    await assert.rejects(renderProductionFlow(state.render, workspace, directory, assertOwned), /voice changed/);
    await writeFile(state.render.voiceFile, audio);
    const rendered = await renderProductionFlow(state.render, workspace, directory, assertOwned);
    assert.equal(rendered.finalBramVoiceApproved, false); assert.equal(rendered.renderReused, false);
    assert.equal(sha256(await readFile(path.join(workspace, "assets/narration.wav"))), state.render.audioSha256);
    const counts = { ...fixture.stats };
    const resumed: FlowOutcome = await advance(); assert.equal(resumed.status, "ready-to-render");
    const reused = await renderProductionFlow(resumed.render!, workspace, directory, assertOwned);
    assert.equal(reused.renderReused, true); assert.deepEqual(fixture.stats, counts);
    // Adopt the exact existing start/end files through the Studio workflow.
    // The production executor must then reuse them without image submissions.
    const workflowContext = { jobId: id, shot: board.shots[0], params, references: fixture.flow.references };
    const step = (stage: "direction" | "start" | "end") => sceneWorkflow(workflowContext).stages.find((s) => s.stage === stage)!;
    params.sceneWorkflow = { 1: reviewStage(workflowContext, { stage: "direction", target: step("direction").target, decision: "approved", note: "Offline fixture only" }) };
    for (const [stage, media] of [["start", startImage], ["end", endImage]] as const) {
      params.sceneWorkflow[1] = attachStage(workflowContext, stage, step(stage).uploadTarget!, media);
      params.sceneWorkflow[1] = reviewStage(workflowContext, { stage, target: step(stage).target, decision: "approved", note: "Offline fixture only" });
    }
    const reusedFrames = await advance(); assert.equal(reusedFrames.status, "ready-to-render");
    assert(reusedFrames.events.some((e) => e.stage === "reuse-scene-1-start"));
    assert(reusedFrames.events.some((e) => e.stage === "reuse-scene-1-end"));
    assert.deepEqual(fixture.stats, counts);
    const complete = await requestReceipts(path.join(directory, "requests"));
    assert(complete.every((r) => r.state === "complete")); assert.equal(complete.length, 7); assert.equal(fixture.stats.submissions, 7);
    assert.equal(complete.find((r) => r.fingerprint === ambiguous.fingerprint)!.requestId, `simulation-${ambiguous.fingerprint}`);
    const budget = createBudget(postgresBudgetStore("simulation", `rehearsal-${id}`), { usd: 1_000_000_000, "higgsfield-credit": 1_000_000_000 });
    const book = await budget.snapshot();
    assert.deepEqual(budgetUsage(book), { usd: 6000, "higgsfield-credit": 1000 });
    assert(Object.values(book.reservations).every((r) => r.entries.every((e) => e.state === "settled")));
    assert.equal((await db.select().from(schema.creditLedger).where(eq(schema.creditLedger.jobId, id))).length, 0);
    assert.equal(networkAttempts, 0);
    await lock.db.update(schema.jobs).set({ status: "succeeded", error: null, outputPath: rendered.output, billedUsd: "0", finishedAt: new Date() }).where(eq(schema.jobs.id, id));
    const proof = { jobId: id, status: "succeeded", voice: "Daniel, local test recording; Bram request contract only", approvals: "simulation-fixtures",
      ...counts, pipelineRequests: complete.length, approvalStops: true, budgetStops: true, pendingPollResumed: true, unknownSubmitReconciled: true, missingCostBlocked: true,
      exactNormalizedAudioUsed: true, duration: rendered.duration, clipsUseAlignedDurations: true, renderReused: true,
      approvedKeyframesReused: true,
      networkAttempts, ledgerEntries: 0, paidRequests: 0, billedUsd: 0, finalBramVoiceApproved: false, output: rendered.output };
    await writeFile(path.join(process.cwd(), "storage/qa/cam-production-flow-proof.json"), JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof, null, 2));
  } finally { await lock?.release(); }
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
