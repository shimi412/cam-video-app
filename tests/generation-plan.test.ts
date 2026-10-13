import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getRecipe } from "../src/lib/recipes";
import { resolveParams } from "../src/lib/brain";
import { planConcept } from "../src/lib/concept/storyboard";
import { generationPlan, materializeRequest } from "../src/lib/concept/generation-plan";
import { placeholderTiming, measuredPhraseTiming } from "../src/lib/concept/timing";
import { DirectionSchema } from "../src/lib/concept/types";
import { rehearseGeneration } from "../src/lib/concept/rehearsal";
import { advanceSimulatedRequest, type SimulatedQueue } from "../src/lib/concept/request-journal";
import { suggestDirection } from "../src/lib/concept/direction";
import { estimateProduction } from "../src/lib/pricing";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const script = "Check the original source.\nThe quote needs its full context.\nFalse claims spread online.";
const recipe = getRecipe("cam-clay")!;
const refs = ["narrator", "monster", "effigy"].map((id) => ({ id, url: `/recipes/${id}.png`, sha256: "a".repeat(64) }));
function fixture() {
  const { params } = resolveParams(script, "auto");
  const board = planConcept(script, recipe, params.aspectRatio);
  const timing = placeholderTiming(board.shots.map((s) => s.narration));
  return { params, board, timing, plan: generationPlan(script, params, board, timing, refs) };
}

it("suggests distinct staging, preserves exact narration and leaves unknown subjects neutral", () => {
  const { board } = fixture();
  expect(new Set(board.shots.map((s) => s.scene)).size).toBe(3);
  expect(board.shots.map((s) => s.narration).join("\n")).toBe(script);
  expect(board.requiresReview).toBe(true);
  expect(suggestDirection("We celebrate the weather today.").scene).toContain("Neutral staging");
  expect(suggestDirection("Replace that misleading image.").scene).toContain("Neutral staging"); // No 'lie' substring match.
  expect(suggestDirection("Vérifier les sources.").scene).toContain("magnifying glass");
});

it("keeps narration outside scene edits and rejects invalid references and unknown scenes", () => {
  const direction = suggestDirection("Check a source.");
  expect(DirectionSchema.safeParse({ ...direction, narration: "Rewrite this" }).success).toBe(false);
  expect(DirectionSchema.safeParse({ ...direction, references: ["stranger"] }).success).toBe(false);
  expect(() => planConcept(script, recipe, "9:16", { 12: direction })).toThrow("Unknown scene");
  const board = planConcept(script, recipe, "9:16", { 1: { ...direction, scene: "A new scene.", overlay: "<script>not executable</script>" } });
  expect(board.shots[0].imagePrompt).toContain("A new scene.");
  expect(board.shots[0].narration).toBe("Check the original source.");
});

it("binds all locked references and the approved start to the end image, then both frames to Kling", () => {
  const { params, timing } = fixture();
  const board = planConcept(script, recipe, "9:16", { 1: { ...suggestDirection("source"), references: ["narrator", "monster"], endScene: "The board is now a blank phone." } });
  const plan = generationPlan(script, params, board, timing, refs);
  const byId = (id: string) => plan.operations.find((op) => op.id === id)!;
  expect(byId("scene-1-start").bindings.image_urls).toEqual(["reference:narrator", "reference:monster"]);
  expect(byId("scene-1-end").bindings.image_urls).toEqual(["output:scene-1-start", "reference:narrator", "reference:monster"]);
  const video = byId("scene-1-clip");
  expect(() => materializeRequest(video, {})).toThrow("Unresolved");
  expect(materializeRequest(video, { "output:scene-1-start": "https://example.invalid/start.png", "output:scene-1-end": "https://example.invalid/end.png" })).toMatchObject({ generate_audio: false, end_image_url: "https://example.invalid/end.png" });
  expect(plan.operations[0].input).toMatchObject({ model: "seed_audio", voice_type: "preset", voice_id: "b847bc29-f184-583a-8ad9-d1f1e16d1a60", speech_rate: 22 });
  expect(plan.liveQuote).toBeNull(); expect(plan.canExecute).toBe(false);
  const estimate = estimateProduction(params, 2.5);
  expect(estimate.unpriced).toEqual(["Dylan voice · quote required"]);
  expect(estimate.lines.some((line) => line.label === "Voice-over")).toBe(false);
});

it("invalidates dependent clips after a direction change and skips imported scenes", () => {
  const { params, board, timing, plan } = fixture();
  const changed = planConcept(script, recipe, "9:16", { 1: { ...suggestDirection("source"), scene: "The narrator examines a scroll." } });
  const next = generationPlan(script, params, changed, timing, refs);
  expect(next.operations.find((o) => o.id === "scene-1-clip")!.fingerprint).not.toBe(plan.operations.find((o) => o.id === "scene-1-clip")!.fingerprint);
  expect(next.operations.find((o) => o.id === "scene-2-clip")!.fingerprint).toBe(plan.operations.find((o) => o.id === "scene-2-clip")!.fingerprint);
  const imported = generationPlan(script, { ...params, sceneMedia: { 1: { id: "00000000-0000-4000-8000-000000000001", kind: "image", sha256: "b".repeat(64), width: 10, height: 10 } } }, board, timing, refs);
  expect(imported.reusedScenes).toEqual([1]); expect(imported.operations.some((o) => o.scene === 1)).toBe(false);
});

it("blocks an overlong spoken scene instead of shortening its voice", () => {
  const { params, board } = fixture();
  const timing = measuredPhraseTiming(board.shots.map((s) => s.narration), [18, 3, 3]);
  const plan = generationPlan(script, params, board, timing, refs);
  const clip = plan.operations.find((o) => o.id === "scene-1-clip")!;
  expect(clip.gates).toContain("split-scene");
  expect(clip.input.duration).toBe("19");
  expect(() => materializeRequest(clip, { "output:scene-1-start": "https://example.invalid/image.png" })).toThrow();
});

it("rehearses and resumes the full chain without a network call or a second submission", async () => {
  vi.stubEnv("PROVIDER_MODE", "dryrun");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden"); }));
  const dir = await mkdtemp(path.join(os.tmpdir(), "cam-plan-rehearsal-"));
  try {
    const { plan } = fixture();
    const first = await rehearseGeneration(plan, dir, async () => {});
    const resumed = await rehearseGeneration(plan, dir, async () => {});
    expect(first.operations).toHaveLength(7);
    expect(first.operations.every((op) => op.state === "complete" && !op.reused)).toBe(true);
    expect(resumed.operations.every((op) => op.reused)).toBe(true);
    expect(first).toMatchObject({ mediaGenerated: false, paidRequests: 0, costUsd: 0 });
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("PROVIDER_MODE", "fal");
    await expect(rehearseGeneration(plan, dir, async () => {})).rejects.toThrow("offline");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it("never resubmits an ambiguous submission, and resumes polling by saved request ID", async () => {
  vi.stubEnv("PROVIDER_MODE", "dryrun");
  const directory = await mkdtemp(path.join(os.tmpdir(), "cam-request-journal-"));
  const queue: SimulatedQueue = { mode: "simulation", submit: vi.fn(async () => { throw new Error("Response lost after acceptance"); }), poll: vi.fn() };
  const input = { directory, fingerprint: "c".repeat(64), queue, assertOwned: async () => {} };
  try {
    await expect(advanceSimulatedRequest(input)).rejects.toThrow("Response lost");
    await expect(advanceSimulatedRequest(input)).rejects.toThrow("outcome unknown");
    expect(queue.submit).toHaveBeenCalledTimes(1);
    queue.submit = vi.fn(async () => ({ requestId: "saved-id" }));
    queue.poll = vi.fn().mockRejectedValueOnce(new Error("Polling disconnected")).mockResolvedValue({ state: "complete", output: "simulated-output" });
    input.fingerprint = "d".repeat(64);
    await expect(advanceSimulatedRequest(input)).rejects.toThrow("Polling disconnected");
    expect((await advanceSimulatedRequest(input)).state).toBe("complete");
    expect(queue.submit).toHaveBeenCalledTimes(1); expect(queue.poll).toHaveBeenLastCalledWith("saved-id");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
