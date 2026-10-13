import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { resolveParams } from "../src/lib/brain";
import { getRecipe } from "../src/lib/recipes";
import { advanceProductionFlow, flowReviewTarget, type FlowInput, type FlowReview } from "../src/lib/concept/production-flow";

let directory: string;
beforeEach(async () => { vi.stubEnv("PROVIDER_MODE", "dryrun"); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden"); })); directory = await mkdtemp(path.join(os.tmpdir(), "cam-flow-")); });
afterEach(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); await rm(directory, { recursive: true, force: true }); });
function fixture() {
  const script = "Offline pipeline test.", { params } = resolveParams(script, "auto");
  const unexpected = vi.fn(async () => { throw new Error("Unexpected provider call"); });
  const review = vi.fn(async (_request: FlowReview) => { void _request; return null; });
  const input: FlowInput = { directory, jobId: randomUUID(), script, params, recipe: getRecipe(params.templateSlug)!,
    references: [{ id: "narrator", url: "/narrator.png", sha256: "a".repeat(64), filePath: "/unread-reference" }], assertOwned: async () => {},
    services: { mode: "simulation", review, authorize: unexpected, queue: () => { throw new Error("Unexpected queue"); }, cost: unexpected,
      assets: { mode: "simulation", upload: unexpected, download: unexpected } } };
  return { input, unexpected, review };
}
it("stops live mode before callbacks or file access, irrespective of supplied services", async () => {
  const f = fixture(); f.input.services.mode = "live";
  await expect(advanceProductionFlow(f.input)).rejects.toThrow("paid generation is disabled");
  expect(f.review).not.toHaveBeenCalled(); expect(f.unexpected).not.toHaveBeenCalled();
});
it("refuses a mixed transport mode before any side effect", async () => {
  const f = fixture(); f.input.services.assets.mode = "live";
  await expect(advanceProductionFlow(f.input)).rejects.toThrow("Mixed production"); expect(f.unexpected).not.toHaveBeenCalled();
});
it("refuses a request journal from a different job before requesting any approval", async () => {
  const f = fixture(), fingerprint = "a".repeat(64);
  await mkdir(path.join(directory, "requests"));
  await writeFile(path.join(directory, "requests", `${fingerprint}.json`), JSON.stringify({ mode: "simulation", fingerprint, state: "complete", requestId: "saved-id", output: "fixture",
    binding: { jobId: randomUUID(), operation: "voice", model: "text2speech_v2", transport: "higgsfield-mcp", payloadSha256: "b".repeat(64) } }));
  await expect(advanceProductionFlow(f.input)).rejects.toThrow("different job"); expect(f.review).not.toHaveBeenCalled();
});
it("pauses before the Bram request until the script is reviewed", async () => {
  const f = fixture(); const result = await advanceProductionFlow(f.input);
  expect(result).toMatchObject({ status: "awaiting-review", phase: "script", paidGenerationAuthorized: false });
  expect(f.unexpected).not.toHaveBeenCalled(); expect(result.events).toEqual([]);
});
it("does not accept a rejected, stale or cross-mode script decision", async () => {
  const f = fixture(); const initial = await advanceProductionFlow(f.input);
  for (const decision of [
    { mode: "simulation" as const, target: initial.review!.target, decision: "rejected" as const },
    { mode: "live" as const, target: initial.review!.target, decision: "approved" as const },
    { mode: "simulation" as const, target: "b".repeat(64), decision: "approved" as const },
  ]) {
    f.input.services.review = async () => ({ id: randomUUID(), ...decision });
    expect((await advanceProductionFlow(f.input)).status).toBe(decision.decision === "rejected" ? "rejected" : "awaiting-review");
  }
  expect(f.unexpected).not.toHaveBeenCalled();
});
it("requires a budget tied to the exact Bram payload after the script decision", async () => {
  const f = fixture(); f.input.services.review = async (r) => ({ id: randomUUID(), target: r.target, decision: "approved", mode: "simulation" });
  f.input.services.authorize = async () => null;
  const result = await advanceProductionFlow(f.input);
  expect(result).toMatchObject({ status: "awaiting-budget", phase: "voice" });
  expect(result.plan!.operations).toHaveLength(1);
  expect(result.plan!.operations[0].input.voice_id).toBe("549ff70a-3ee7-4f04-a4d9-89a24fab7709");
  expect(f.unexpected).not.toHaveBeenCalled();
});
it("binds reviews to mode, job, stage, actual audio/timing and parent decisions", () => {
  const job = randomUUID(), data = { audio: "a".repeat(64), alignment: "b".repeat(64), parent: randomUUID() };
  const first = flowReviewTarget("simulation", job, "voice", data);
  for (const other of [flowReviewTarget("live", job, "voice", data), flowReviewTarget("simulation", randomUUID(), "voice", data),
    flowReviewTarget("simulation", job, "clip", data), flowReviewTarget("simulation", job, "voice", { ...data, audio: "c".repeat(64) }),
    flowReviewTarget("simulation", job, "voice", { ...data, alignment: "c".repeat(64) }), flowReviewTarget("simulation", job, "voice", { ...data, parent: randomUUID() })]) expect(other).not.toBe(first);
});
