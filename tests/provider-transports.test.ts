import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { bramQueue, falQueue, providerOutputUrl, type McpCall } from "../src/lib/concept/provider-transports";
import { connectCamProviders } from "../src/lib/providers/cam";
import { advanceRequest } from "../src/lib/concept/request-journal";
import { generationPlan, materializeRequest } from "../src/lib/concept/generation-plan";
import { getRecipe } from "../src/lib/recipes";
import { resolveParams } from "../src/lib/brain";
import { planConcept } from "../src/lib/concept/storyboard";
import { placeholderTiming } from "../src/lib/concept/timing";
import { currentDraft } from "../src/lib/concept/current-draft";
import { CAM_VOICE } from "../src/lib/concept/cam-voice";

const script = "Check the original source. Read the surrounding context before sharing a claim.";
const { params } = resolveParams(script, "auto");
const board = planConcept(script, getRecipe("cam-clay")!, params.aspectRatio);
const plan = generationPlan(script, params, board, placeholderTiming(board.shots.map((s) => s.narration)), [{ id: "narrator", sha256: "a".repeat(64), url: "/narrator.png" }]);
const voice = plan.operations[0];
const image = plan.operations.find((op) => op.kind === "image")!;
const video = plan.operations.find((op) => op.kind === "video")!;
const urls = { "reference:narrator": "https://simulation.invalid/narrator.png", "output:scene-1-start": "https://simulation.invalid/start.png" };
const wrapped = (data: unknown) => ({ structuredContent: data });
const complete = (status = "completed", id = "bram-job-1") => wrapped({ jobs: [{ index: 0, job_id: id, status, model: "text2speech_v2", type: "audio", result_url: "https://cdn.higgsfield.ai/audio.wav" }] });
let directory: string;
beforeEach(async () => {
  vi.stubEnv("PROVIDER_MODE", "dryrun");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden"); }));
  directory = await mkdtemp(path.join(os.tmpdir(), "cam-provider-contracts-"));
});
afterEach(async () => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

it("uses the exact Bram request without Dylan speed settings or trial flags", async () => {
  const call = vi.fn().mockResolvedValueOnce(wrapped({ results: [{ id: "bram-job-1", type: "audio", model: "text2speech_v2" }] })).mockResolvedValueOnce(complete());
  const queue = bramQueue(materializeRequest(voice, {}), "simulation", call);
  expect(await queue.submit()).toEqual({ requestId: "bram-job-1" });
  expect(call).toHaveBeenNthCalledWith(1, "generate_audio", { params: { model: "text2speech_v2", variant: "elevenlabs", voice_type: "preset", voice_id: CAM_VOICE.voiceId, count: 1, prompt: script } });
  expect(await queue.poll("bram-job-1")).toEqual({ state: "complete", output: "https://cdn.higgsfield.ai/audio.wav" });
  expect(call).toHaveBeenLastCalledWith("jobs_wait", { jobs: [{ index: 0, job_id: "bram-job-1" }], timeout_seconds: 0 });
  expect(() => bramQueue({ ...voice.input, speech_rate: 22 }, "simulation", call)).toThrow();
  expect(() => bramQueue({ ...voice.input, voice_id: "b847bc29-f184-583a-8ad9-d1f1e16d1a60" }, "simulation", call)).toThrow();
});

it.each([
  { cost: { credits: 0.15 } }, { unlim_choice: { plans: ["paid"] } }, { results: [] },
  { results: [{ id: "one" }, { id: "two" }] }, { results: [{ id: "image", type: "image" }] },
])("does not treat an estimate, plan offer or ambiguous result as a voice submission: %j", async (response) => {
  const call = vi.fn().mockResolvedValue(wrapped(response));
  const queue = bramQueue(voice.input, "simulation", call);
  const input = { directory, fingerprint: voice.fingerprint, queue, assertOwned: async () => {} };
  await expect(advanceRequest(input)).rejects.toThrow("No unique Bram request ID");
  await expect(advanceRequest(input)).rejects.toThrow("outcome unknown");
  expect(call).toHaveBeenCalledTimes(1);
});

it("reads MCP JSON text and preserves the saved ID across polling outages", async () => {
  const call = vi.fn().mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify({ results: [{ id: "bram-job-1" }] }) }] })
    .mockResolvedValueOnce(complete("queued")).mockResolvedValueOnce(complete("lookup_failed")).mockResolvedValueOnce(complete());
  const input = { directory, fingerprint: voice.fingerprint, queue: bramQueue(voice.input, "simulation", call), assertOwned: async () => {} };
  expect((await advanceRequest(input)).state).toBe("submitted");
  await expect(advanceRequest(input)).rejects.toThrow("Resume polling");
  expect((await advanceRequest(input)).state).toBe("complete");
  expect((await advanceRequest(input)).reused).toBe(true);
  expect(call.mock.calls.filter(([name]) => name === "generate_audio")).toHaveLength(1);
});

it("rejects another job's result, moderation failures and malformed MCP replies", async () => {
  const call = vi.fn().mockResolvedValueOnce(complete("completed", "someone-else")).mockResolvedValueOnce(complete("nsfw"))
    .mockResolvedValueOnce({ isError: true, content: [] }).mockResolvedValueOnce({ content: [{ type: "text", text: "not JSON" }] });
  const queue = bramQueue(voice.input, "simulation", call);
  await expect(queue.poll("bram-job-1")).rejects.toThrow("different job");
  expect(await queue.poll("bram-job-1")).toEqual({ state: "failed" });
  await expect(queue.submit()).rejects.toThrow("tool returned an error");
  await expect(queue.submit()).rejects.toThrow();
});

it.each([image, video])("submits $kind once and retrieves its output by ID through the correct base endpoint", async (op) => {
  const output = op.kind === "image" ? { images: [{ url: "https://v3b.fal.media/output.png" }] } : { video: { url: "https://v3b.fal.media/output.mp4" } };
  const request = vi.fn().mockResolvedValueOnce({ request_id: "fal-job-1", response_url: "https://untrusted.invalid/do-not-follow" })
    .mockResolvedValueOnce({ status: "IN_QUEUE" }).mockResolvedValueOnce({ status: "COMPLETED", request_id: "fal-job-1" }).mockResolvedValueOnce(output);
  const queue = falQueue(op, materializeRequest(op, urls), "simulation", request);
  const input = { directory, fingerprint: op.fingerprint, queue, assertOwned: async () => {} };
  expect((await advanceRequest(input)).state).toBe("submitted");
  expect((await advanceRequest(input)).state).toBe("complete");
  expect((await advanceRequest(input)).reused).toBe(true);
  expect(request.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
  expect(request.mock.calls[0][0]).toBe(`https://queue.fal.run/${op.model}`);
  expect(request.mock.calls[1][0]).toBe(`https://queue.fal.run/${op.model.split("/").slice(0, 2).join("/")}/requests/fal-job-1/status`);
  expect(request.mock.calls[3][0]).toBe(`https://queue.fal.run/${op.model.split("/").slice(0, 2).join("/")}/requests/fal-job-1`);
});

it("does not retry a lost fal POST, or re-submit a failed generation", async () => {
  const request = vi.fn().mockRejectedValueOnce(new Error("POST response lost"));
  const input = { directory, fingerprint: image.fingerprint, queue: falQueue(image, materializeRequest(image, urls), "simulation", request), assertOwned: async () => {} };
  await expect(advanceRequest(input)).rejects.toThrow("POST response lost");
  await expect(advanceRequest(input)).rejects.toThrow("outcome unknown");
  expect(request).toHaveBeenCalledTimes(1);
  request.mockResolvedValueOnce({ request_id: "failed-job" }).mockResolvedValueOnce({ status: "COMPLETED" }).mockResolvedValueOnce({ error: "Provider rejected generation" });
  input.fingerprint = "d".repeat(64);
  await expect(advanceRequest(input)).rejects.toThrow("original request failed");
  await expect(advanceRequest(input)).rejects.toThrow("original request failed");
  expect(request).toHaveBeenCalledTimes(4);
});

it("rejects bad output URLs, wrong request IDs and mismatched scene models", async () => {
  for (const url of ["http://v3.fal.media/x", "https://fal.media.evil.invalid/x", "https://localhost/x", "https://key@v3.fal.media/x", "https://v3.fal.media:4321/x"]) {
    expect(() => providerOutputUrl(url, "fal", "live")).toThrow();
  }
  const request = vi.fn().mockResolvedValue({ status: "COMPLETED", request_id: "different-id" });
  const queue = falQueue(image, materializeRequest(image, urls), "simulation", request);
  await expect(queue.poll("our-id")).rejects.toThrow("different request ID");
  await expect(queue.poll("../other")).rejects.toThrow();
  expect(() => falQueue({ ...image, model: "fal-ai/other" }, materializeRequest(image, urls), "simulation", request)).toThrow("Unsupported");
});

it.each(["mock", "dryrun", "fal"])("keeps real transports closed even with credentials and PROVIDER_MODE=%s", async (mode) => {
  vi.stubEnv("PROVIDER_MODE", mode); vi.stubEnv("FAL_KEY", "dummy-not-a-key"); vi.stubEnv("CAM_HIGGSFIELD_ACCESS_TOKEN", "dummy-not-a-token");
  const request = vi.fn(), mcp: McpCall = vi.fn();
  await expect(connectCamProviders()).rejects.toThrow("paid generation is disabled");
  await expect(falQueue(image, materializeRequest(image, urls), "live", request).submit()).rejects.toThrow("paid generation is disabled");
  await expect(bramQueue(voice.input, "live", mcp).poll("bram-job-1")).rejects.toThrow("paid generation is disabled");
  expect(request).not.toHaveBeenCalled(); expect(mcp).not.toHaveBeenCalled();
});

it("refreshes only unconfirmed planning drafts and keeps historical voice metadata intact", async () => {
  const preparation = { voice: { cam: { name: "Dylan", voiceId: "historical-id" } } };
  const old = { id: "31527145-d10e-4fc3-a989-8f2b30bf720d", status: "estimated", script, params: { ...params, preparation, draft: { estimate: { unpriced: ["Dylan voice · quote required"], totalBilledUsd: 10 } } } };
  const current = await currentDraft(old);
  expect(current.preparation).toMatchObject({ voice: { cam: { name: "Bram", referenceKind: "provider-sample", finalVoiceApproved: false } } });
  expect(current.draft).toMatchObject({ estimate: { unpriced: ["Bram voice · quote required"], totalBilledUsd: 10 } });
  expect(old.params.preparation.voice.cam.name).toBe("Dylan");
  for (const status of ["confirmed", "running", "succeeded", "failed"]) expect((await currentDraft({ ...old, status })).preparation).toBe(preparation);
  expect((await currentDraft({ ...old, params: { ...old.params, previewSource: "existing" } })).preparation).toBe(preparation);
});
