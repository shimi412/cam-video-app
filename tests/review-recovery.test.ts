import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { resolveParams } from "../src/lib/brain";
import { getRecipe } from "../src/lib/recipes";
import { planConcept } from "../src/lib/concept/storyboard";
import { placeholderTiming } from "../src/lib/concept/timing";
import { generationPlan, materializeRequest } from "../src/lib/concept/generation-plan";
import { importedVisualTarget, visualTarget, visualReview, requireVisualApproval, type VisualDecision } from "../src/lib/concept/visual-review";
import { importSceneMedia } from "../src/lib/concept/imported-media";
import { mediaFile } from "../src/lib/concept/preview-inputs";
import { materializeReviewedRequest, type KeyframeCandidate } from "../src/lib/concept/reviewed-keyframes";
import { advanceRequest, reconcileRequest, requestReceipts } from "../src/lib/concept/request-journal";
import { simulatedProvider } from "../src/lib/concept/simulated-provider";

let directory: string, jobId: string;
const assertOwned = async () => {};
beforeEach(async () => {
  vi.stubEnv("PROVIDER_MODE", "dryrun"); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden"); }));
  directory = await mkdtemp(path.join(os.tmpdir(), "cam-review-")); jobId = randomUUID();
});
afterEach(async () => {
  expect(fetch).not.toHaveBeenCalled(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
  await rm(path.join(process.cwd(), "storage/imports", jobId), { recursive: true, force: true });
});
const refs = [{ id: "narrator", url: "/reference.png", sha256: "a".repeat(64) , characterSheet:{status:"approved",sha256:"a".repeat(64),approvedAt:"2026-10-14"}}];
function fixture() {
  const script = "Check the source.";
  const { params } = resolveParams(script, "auto");
  const board = planConcept(script, getRecipe("cam-clay")!, params.aspectRatio);
  // Add an end frame without writing any creative provider prompt.
  board.shots[0].endImagePrompt = board.shots[0].imagePrompt;
  const plan = generationPlan(script, params, board, placeholderTiming([script]), refs);
  return { params, board, plan };
}
const decision = (target: string, value: "approved" | "rejected" = "approved"): VisualDecision => ({ id: randomUUID(), target, decision: value, reviewedAt: new Date().toISOString(), note: "Offline test decision" });
async function image() { return importSceneMedia(jobId, await sharp({ create: { width: 16, height: 16, channels: 3, background: "orange" } }).png().toBuffer()); }

it("invalidates visual decisions for replacement, scene, job, format and reference changes", async () => {
  const { params, board } = fixture(); const shot = board.shots[0];
  params.sceneMedia = { 1: await image() };
  const target = importedVisualTarget(jobId, shot, params, refs)!;
  const history = [decision(target)];
  expect(visualReview(target).status).toBe("pending"); expect(visualReview(target, history).status).toBe("approved");
  for (const changed of [
    importedVisualTarget(randomUUID(), shot, params, refs),
    importedVisualTarget(jobId, { ...shot, scene: shot.scene + " changed" }, params, refs),
    importedVisualTarget(jobId, shot, { ...params, aspectRatio: "1:1" }, refs),
    importedVisualTarget(jobId, shot, params, [{ ...refs[0], sha256: "b".repeat(64) }]),
    importedVisualTarget(jobId, shot, { ...params, sceneMedia: { 1: await image() } }, refs),
  ]) { expect(visualReview(changed!, history).status).toBe("stale"); expect(() => requireVisualApproval(changed!, history)).toThrow(); }
  expect(visualReview(target, [...history, decision(target, "rejected")]).status).toBe("rejected");
  expect(() => requireVisualApproval(target, [...history, decision(target, "rejected")])).toThrow();
});

it("requires reviewed start and end bytes, and invalidates the end after replacing the start", async () => {
  const { plan } = fixture(), operations = plan.operations;
  const start = operations.find((op) => op.id === "scene-1-start")!, end = operations.find((op) => op.id === "scene-1-end")!, clip = operations.find((op) => op.kind === "video")!;
  const startMedia = await image(), endMedia = await image();
  const startTarget = visualTarget({ jobId, scene: 1, slot: "start", media: startMedia, context: start.fingerprint });
  const endTarget = visualTarget({ jobId, scene: 1, slot: "end", media: endMedia, context: end.fingerprint, parent: startTarget });
  const images: Record<string, KeyframeCandidate> = {
    [start.id]: { media: startMedia, operationFingerprint: start.fingerprint, upload: { url: "https://simulation.invalid/start.png", sha256: startMedia.sha256 }, reviews: [decision(startTarget)] },
    [end.id]: { media: endMedia, operationFingerprint: end.fingerprint, parentTarget: startTarget, upload: { url: "https://simulation.invalid/end.png", sha256: endMedia.sha256 }, reviews: [decision(endTarget)] },
  };
  const input = { jobId, operation: clip, operations, images, referenceUrls: { "reference:narrator": "https://simulation.invalid/ref.png" } };
  expect(await materializeReviewedRequest(input)).toMatchObject({ start_image_url: images[start.id].upload.url, end_image_url: images[end.id].upload.url, generate_audio: false });
  images[end.id].reviews.push(decision(endTarget, "rejected"));
  await expect(materializeReviewedRequest(input)).rejects.toThrow("Review the current"); images[end.id].reviews.pop();
  images[start.id].upload.sha256 = "c".repeat(64);
  await expect(materializeReviewedRequest(input)).rejects.toThrow("Uploaded image"); images[start.id].upload.sha256 = startMedia.sha256;
  images[start.id].media = await image();
  const newTarget = visualTarget({ jobId, scene: 1, slot: "start", media: images[start.id].media, context: start.fingerprint });
  images[start.id].reviews = [decision(newTarget)];
  await expect(materializeReviewedRequest(input)).rejects.toThrow("different start image");
  images[start.id].media = startMedia; images[start.id].reviews = [decision(startTarget)];
  await writeFile(path.join(process.cwd(), "storage/imports", jobId, mediaFile(startMedia)), "corrupt");
  await expect(materializeReviewedRequest(input)).rejects.toThrow("changed");
});

async function interrupted() {
  const { plan } = fixture(), operation = plan.operations[0];
  const provider = simulatedProvider({ directory: path.join(directory, "provider"), jobId, operation, payload: materializeRequest(operation, {}), transcript: {}, assertOwned });
  const submit = vi.fn(async () => { await provider.queue.submit(); throw new Error("Response lost"); });
  const input = { directory, fingerprint: operation.fingerprint, binding: provider.binding, assertOwned, queue: { ...provider.queue, submit } };
  await expect(advanceRequest(input)).rejects.toThrow("Response lost");
  const reconcile = { directory, fingerprint: operation.fingerprint, mode: "simulation" as const, requestId: `simulation-${operation.fingerprint}`, binding: provider.binding, assertOwned, verify: provider.verify };
  return { input, reconcile, submit, provider };
}

it("recovers a lost acceptance, resumes the original ID and never submits twice", async () => {
  const { input, reconcile, submit } = await interrupted();
  await expect(advanceRequest(input)).rejects.toThrow("outcome unknown");
  const first = await reconcileRequest(reconcile);
  expect(first.state).toBe("submitted"); expect(first.reconciliation).toBeDefined();
  expect(await reconcileRequest(reconcile)).toEqual(first);
  const result = await advanceRequest(input); expect(result.state).toBe("complete"); expect(result.requestId).toBe(first.requestId);
  expect((await advanceRequest(input)).reused).toBe(true); expect(submit).toHaveBeenCalledTimes(1);
  expect((await requestReceipts(directory))[0].reconciliation).toEqual(first.reconciliation);
});

it("refuses mismatched ID, job, model, payload, fingerprint or provider evidence without changing the receipt", async () => {
  const { input, reconcile } = await interrupted();
  const file = path.join(directory, `${input.fingerprint}.json`), before = await readFile(file, "utf8");
  const evidence = await reconcile.verify(reconcile.requestId);
  const variants = [ { ...evidence, requestId: "another-id" }, { ...evidence, fingerprint: "b".repeat(64) }, { ...evidence, mode: "live" as const },
    ...[{ jobId: randomUUID() }, { model: "other-model" }, { payloadSha256: "b".repeat(64) }, { transport: "fal-queue" as const }].map((change) => ({ ...evidence, binding: { ...evidence.binding, ...change } })),
  ];
  for (const other of variants) await expect(reconcileRequest({ ...reconcile, verify: async () => other })).rejects.toThrow("does not match");
  expect(await readFile(file, "utf8")).toBe(before);
  await expect(reconcileRequest({ ...reconcile, verify: async () => { throw new Error("Lookup disconnected"); } })).rejects.toThrow("disconnected");
  expect(await readFile(file, "utf8")).toBe(before);
});

it("preserves an acknowledged ID across poll failures and records a terminal failure without retry", async () => {
  const { input, reconcile, submit } = await interrupted(); await reconcileRequest(reconcile);
  await expect(advanceRequest({ ...input, queue: { ...input.queue, poll: async () => { throw new Error("Poll lost"); } } })).rejects.toThrow("Poll lost");
  expect((await requestReceipts(directory))[0].requestId).toBe(reconcile.requestId);
  await expect(reconcileRequest({ ...reconcile, requestId: "wrong" })).rejects.toThrow("Cannot replace");
  await expect(advanceRequest({ ...input, queue: { ...input.queue, poll: async () => ({ state: "failed" }) } })).rejects.toThrow("original request failed");
  await expect(reconcileRequest(reconcile)).rejects.toThrow("original request failed");
  await expect(advanceRequest(input)).rejects.toThrow("original request failed"); expect(submit).toHaveBeenCalledTimes(1);
});

it("keeps uncertain requests blocked if there is no acceptance evidence or job ownership is lost", async () => {
  const { input, reconcile } = await interrupted();
  await expect(reconcileRequest({ ...reconcile, assertOwned: async () => { throw new Error("lock lost"); } })).rejects.toThrow("lock lost");
  await rm(path.join(directory, "provider"), { recursive: true });
  await expect(reconcileRequest(reconcile)).rejects.toThrow("No acceptance evidence");
  expect((await requestReceipts(directory))[0].state).toBe("submitting");
  vi.stubEnv("PROVIDER_MODE", "fal");
  await expect(reconcileRequest(reconcile)).rejects.toThrow();
  vi.stubEnv("PROVIDER_MODE", "dryrun");
  await expect(reconcileRequest({ ...reconcile, mode: "live" })).rejects.toThrow("disabled");
  await expect(advanceRequest({ ...input, binding: { ...input.binding, jobId: randomUUID() } })).rejects.toThrow("binding mismatch");
});
