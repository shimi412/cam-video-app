import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createBudget, quoteHash, budgetUsage, budgetedQueue, type BudgetBook, type BudgetStore, type BudgetQuote, type BudgetApproval } from "../src/lib/concept/budget";
import { sha256 } from "../src/lib/concept/checkpoints";
import { boundedMedia, uploadReference, downloadResult, type AssetTransport, type AudioAsset } from "../src/lib/concept/media-transfers";
import { assetTransport, connectCamAssets } from "../src/lib/providers/cam-assets";
import { alignVoice, alignmentHash, scriptHash, whisperAlignment, approveAlignedVoice, type VoiceAlignment } from "../src/lib/concept/voice-alignment";
import { CAM_VOICE } from "../src/lib/concept/cam-voice";
import { transcriptionQueue } from "../src/lib/concept/transcription";
import { advanceRequest } from "../src/lib/concept/request-journal";
import { alignedGenerationPlan } from "../src/lib/concept/aligned-plan";
import { generationPlan } from "../src/lib/concept/generation-plan";
import { planConcept } from "../src/lib/concept/storyboard";
import { getRecipe } from "../src/lib/recipes";
import { resolveParams } from "../src/lib/brain";
import { placeholderTiming } from "../src/lib/concept/timing";

function memoryStore(): BudgetStore {
  let book: BudgetBook | null = null, previous = Promise.resolve();
  return { mode: "simulation", transaction(update) {
    const next = previous.then(() => { const changed = update(structuredClone(book)); book = structuredClone(changed.book); return changed.result; });
    previous = next.then(() => {}, () => {}); return next;
  } };
}
const usd = "a".repeat(64), credit = "b".repeat(64), plan = "c".repeat(64);
const caps = { usd: 100, "higgsfield-credit": 100 };
const operations = [{ fingerprint: usd, transport: "fal-queue" }, { fingerprint: credit, transport: "higgsfield-mcp" }];
function reservation() {
  const quote: BudgetQuote = { source: "simulation-fixture", plan, expiresAt: Date.now() + 60_000, lines: [{ operation: usd, unit: "usd", maximum: 60 }, { operation: credit, unit: "higgsfield-credit", maximum: 25 }] };
  const approval: BudgetApproval = { id: randomUUID(), mode: "simulation", plan, quote: quoteHash(quote), caps, expiresAt: quote.expiresAt };
  return { jobId: randomUUID(), plan, operations, quote, approval };
}
let directory: string, jobId: string;
beforeEach(async () => { vi.stubEnv("PROVIDER_MODE", "dryrun"); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External network forbidden"); })); directory = await mkdtemp(path.join(os.tmpdir(), "cam-delivery-")); jobId = randomUUID(); });
afterEach(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); await rm(path.join(process.cwd(), "storage/imports", jobId), { recursive: true, force: true }); });

it("reserves two provider currencies atomically across jobs and resumes without double reservation", async () => {
  const store = memoryStore(), first = createBudget(store, caps), second = createBudget(store, caps), a = reservation(), b = reservation();
  const results = await Promise.allSettled([first.reserve(a), second.reserve(b)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  await first.reserve(a);
  expect(budgetUsage(await first.snapshot())).toEqual({ usd: 60, "higgsfield-credit": 25 });
});

it("rejects stale/incomplete quotes, changed plans, mixed currencies and reused approvals", async () => {
  const budget = createBudget(memoryStore(), caps);
  for (const mutation of [
    (r: ReturnType<typeof reservation>) => { r.quote.lines.pop(); r.approval.quote = quoteHash(r.quote); },
    (r: ReturnType<typeof reservation>) => { r.quote.expiresAt = 1; r.approval.quote = quoteHash(r.quote); },
    (r: ReturnType<typeof reservation>) => { r.plan = "d".repeat(64); },
    (r: ReturnType<typeof reservation>) => { r.quote.lines[1].unit = "usd"; r.approval.quote = quoteHash(r.quote); },
    (r: ReturnType<typeof reservation>) => { r.approval.caps.usd = 1; },
  ]) {
    const r = reservation(); r.approval.caps = { ...caps }; mutation(r); await expect(budget.reserve(r)).rejects.toThrow();
  }
  const r = reservation(); await budget.reserve(r);
  await expect(budget.reserve({ ...r, jobId: randomUUID() })).rejects.toThrow("another production");
});

it("keeps unknown/failed submission costs reserved and blocks retry without submitting twice", async () => {
  const budget = createBudget(memoryStore(), caps), r = reservation(); await budget.reserve(r);
  const submit = vi.fn(async () => { throw new Error("Response lost"); });
  const queue = budgetedQueue({ mode: "simulation", submit, poll: vi.fn() }, budget, r.approval.id, usd);
  const input = { directory, fingerprint: usd, queue, assertOwned: async () => {} };
  await expect(advanceRequest(input)).rejects.toThrow("Response lost");
  await expect(advanceRequest(input)).rejects.toThrow("outcome unknown");
  await expect(queue.submit()).rejects.toThrow("already has an attempt");
  expect(submit).toHaveBeenCalledTimes(1);
  expect(budgetUsage(await budget.snapshot()).usd).toBe(60);
});

it("records actual costs once, rejects conflicting receipts, and stops after an overrun", async () => {
  const budget = createBudget(memoryStore(), caps), r = reservation(); await budget.reserve(r); await budget.attempt(r.approval.id, usd);
  const cost = { unit: "usd" as const, actual: 80, evidence: "provider-cost-receipt-1" };
  expect((await budget.settle(r.approval.id, usd, cost)).overrun).toBe(true);
  await budget.settle(r.approval.id, usd, cost);
  expect(budgetUsage(await budget.snapshot()).usd).toBe(80);
  await expect(budget.settle(r.approval.id, usd, { ...cost, actual: 0 })).rejects.toThrow("Conflicting");
  await expect(budget.attempt(r.approval.id, credit)).rejects.toThrow("exceeded its reservation");
});

it("allows status recovery after quote expiry but refuses any new submission", async () => {
  const budget = createBudget(memoryStore(), caps), r = reservation(); await budget.reserve(r);
  await budget.reserve({ ...r, now: r.quote.expiresAt + 1 });
  await expect(budget.attempt(r.approval.id, usd, r.quote.expiresAt + 1)).rejects.toThrow("expired");
});

it("releases only requests that were never attempted and cannot use the released approval again", async () => {
  const budget = createBudget(memoryStore(), caps), r = reservation(); await budget.reserve(r); await budget.attempt(r.approval.id, usd);
  expect(await budget.releaseUnsubmitted(r.approval.id)).toBe(1);
  expect(budgetUsage(await budget.snapshot())).toEqual({ usd: 60, "higgsfield-credit": 0 });
  await expect(budget.attempt(r.approval.id, credit)).rejects.toThrow();
  await expect(budget.settle(r.approval.id, credit, { unit: "higgsfield-credit", actual: 0, evidence: "not-submitted" })).rejects.toThrow();
});

function fakeAssets(): AssetTransport {
  return { mode: "simulation", upload: vi.fn(async () => ({ url: "https://simulation.invalid/ref.png", expiresAt: Date.now() + 3600_000 })), download: vi.fn() };
}
it("uploads exact reference bytes once, detects edits and stops after an ambiguous upload", async () => {
  const bytes = Buffer.from("reference bytes"), file = path.join(directory, "reference.png"); await writeFile(file, bytes);
  const transport = fakeAssets(), input = { file, sha256: sha256(bytes), contentType: "image/png" as const, directory, transport, assertOwned: async () => {} };
  expect((await uploadReference(input)).reused).toBe(false); expect((await uploadReference(input)).reused).toBe(true);
  expect(transport.upload).toHaveBeenCalledTimes(1);
  await writeFile(file, "changed"); await expect(uploadReference(input)).rejects.toThrow("Reference bytes changed");
  input.sha256 = sha256("changed"); transport.upload = vi.fn(async () => { throw new Error("Lost upload response"); });
  await expect(uploadReference(input)).rejects.toThrow("Lost upload"); await expect(uploadReference(input)).rejects.toThrow("outcome unknown");
  expect(transport.upload).toHaveBeenCalledTimes(1);
});

it("refuses expired upload URLs and refuses sending bytes after the job lock is lost", async () => {
  const file = path.join(directory, "reference.png"); await writeFile(file, "abc"); const transport = fakeAssets();
  const input = { file, sha256: sha256("abc"), contentType: "image/png" as const, directory, transport, assertOwned: async () => {} };
  await uploadReference(input);
  await expect(uploadReference({ ...input, now: Date.now() + 7200_000 })).rejects.toThrow("expired");
  await writeFile(file, "def");
  await expect(uploadReference({ ...input, sha256: sha256("def"), assertOwned: async () => { throw new Error("Lock lost"); } })).rejects.toThrow("Lock lost");
  expect(transport.upload).toHaveBeenCalledTimes(1);
});

it("bounds streamed media, rejects errors and cancels oversized responses without trusting MIME", async () => {
  expect((await boundedMedia(new Response("abc"), 3)).toString()).toBe("abc");
  await expect(boundedMedia(new Response("oversized"), 3)).rejects.toThrow("size limit");
  await expect(boundedMedia(new Response("", { headers: { "content-length": "999" } }), 3)).rejects.toThrow("size limit");
  await expect(boundedMedia(new Response("unauthorized", { status: 401 }), 32)).rejects.toThrow("download failed");
});

it("decodes image results locally, verifies cache hashes and never redownloads a valid result", async () => {
  const transport = fakeAssets(); transport.download = vi.fn(async () => new Response(await readFile("public/recipes/cam-clay/narrator.png")));
  const input = { directory, transport, jobId, assertOwned: async () => {}, fingerprint: usd, kind: "image" as const, provider: "fal" as const, url: "https://simulation.invalid/result.png" };
  const result = await downloadResult(input); expect(result.media?.kind).toBe("image");
  expect((await downloadResult(input)).reused).toBe(true); expect(transport.download).toHaveBeenCalledTimes(1);
  await writeFile(path.join(process.cwd(), "storage/imports", jobId, `${result.media!.id}.png`), "corrupt");
  await expect(downloadResult(input)).rejects.toThrow("changed"); expect(transport.download).toHaveBeenCalledTimes(1);
});

it("uses initiate/PUT without leaking the fal key to object storage or output hosts", async () => {
  const request = vi.fn().mockResolvedValueOnce(Response.json({ upload_url: "https://simulation.invalid/upload", file_url: "https://simulation.invalid/ref.png" }))
    .mockResolvedValueOnce(new Response(null, { status: 200 })).mockResolvedValueOnce(new Response("data"));
  const transport = assetTransport("simulation", request, "fake-test-key");
  await transport.upload(Buffer.from("abc"), `${usd}.png`, "image/png"); await transport.download("https://simulation.invalid/result", "fal");
  expect(request.mock.calls.map(([, init]) => init.method)).toEqual(["POST", "PUT", "GET"]);
  expect(request.mock.calls[0][0]).toBe("https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3");
  expect(request.mock.calls[0][1].headers.Authorization).toBe("Key fake-test-key");
  expect(request.mock.calls[1][1].headers.Authorization).toBeUndefined(); expect(request.mock.calls[2][1].headers).toBeUndefined();
  expect(request.mock.calls.every(([, init]) => init.redirect === "error")).toBe(true);
});

it("explains an empty fal balance and resumes an explicitly rejected upload without ambiguity", async () => {
  const file = path.join(directory, "voice.wav"); await writeFile(file, "voice bytes");
  const request = vi.fn().mockResolvedValueOnce(Response.json({ detail: "User is locked. Reason: Exhausted balance." }, { status: 403 }))
    .mockResolvedValueOnce(Response.json({ upload_url: "https://simulation.invalid/upload", file_url: "https://simulation.invalid/voice.wav" }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  const input = { file, sha256: sha256("voice bytes"), contentType: "audio/wav" as const, directory, transport: assetTransport("simulation", request, "fake-test-key"), assertOwned: async () => {} };
  await expect(uploadReference(input)).rejects.toThrow("Your fal.ai balance is empty");
  expect(request).toHaveBeenCalledTimes(1); // No bytes sent after the rejected initiation.
  expect((await uploadReference(input)).reused).toBe(false);
  expect((await uploadReference(input)).reused).toBe(true);
  expect(request.mock.calls.map(([, init]) => init.method)).toEqual(["POST", "POST", "PUT"]);
});

it("keeps a lost initiation response blocked and never exposes provider error bodies", async () => {
  const file = path.join(directory, "voice.wav"); await writeFile(file, "voice bytes");
  const request = vi.fn().mockRejectedValueOnce(new Error("Connection lost"));
  const input = { file, sha256: sha256("voice bytes"), contentType: "audio/wav" as const, directory, transport: assetTransport("simulation", request, "fake-test-key"), assertOwned: async () => {} };
  await expect(uploadReference(input)).rejects.toThrow("Connection lost");
  await expect(uploadReference(input)).rejects.toThrow("outcome unknown");
  expect(request).toHaveBeenCalledTimes(1);
  request.mockResolvedValueOnce(Response.json({ detail: "private provider diagnostic" }, { status: 401 }));
  await expect(input.transport.upload(Buffer.from("abc"), `${usd}.wav`, "audio/wav")).rejects.toThrow("File transfer was not started (fal HTTP 401)");
});

const phrases = ["Check the source.", "Read the context."];
const audio: AudioAsset = { kind: "audio", file: "narration.wav", sha256: usd, sourceSha256: credit, duration: 8 };
function alignment(): VoiceAlignment {
  return { version: 1, audioSha256: audio.sha256, scriptSha256: scriptHash(phrases), requestId: "fixture-only", voiceId: CAM_VOICE.voiceId, source: "simulation-fixture",
    words: phrases.join(" ").split(" ").map((word, i) => ({ word, start: i + .3, end: i + .8 })) };
}
it("preserves original captions and derives scene times from matched words and the real file duration", () => {
  const a = alignment(); a.words[2].word = "source";
  const timing = alignVoice(phrases, audio, a, "simulation");
  expect(timing.duration).toBe(8); expect(timing.words[2].word).toBe("source.");
  expect(timing.phrases).toEqual([{ phrase: 1, text: phrases[0], start: .3, end: 2.8 }, { phrase: 2, text: phrases[1], start: 3.3, end: 5.8 }]);
  expect(timing.estimated).toBe(true);
});

it("rejects missing, added, changed, overlapping, zero-duration and out-of-range words", () => {
  for (const mutate of [
    (a: VoiceAlignment) => { a.words.pop(); }, (a: VoiceAlignment) => { a.words[1].word = "different"; },
    (a: VoiceAlignment) => { a.words[1].start = .4; }, (a: VoiceAlignment) => { a.words[1].end = a.words[1].start; },
    (a: VoiceAlignment) => { a.words.at(-1)!.end = 9; }, (a: VoiceAlignment) => { a.audioSha256 = credit; },
    (a: VoiceAlignment) => { a.scriptSha256 = credit; },
  ]) { const a = alignment(); mutate(a); expect(() => alignVoice(phrases, audio, a, "simulation")).toThrow(); }
  expect(() => alignVoice(phrases, audio, alignment(), "live")).toThrow("Simulated");
});

it("requires approval of the exact recording and alignment and invalidates clips after a timing change", () => {
  const a = alignment(), approval = { mode: "simulation" as const, approved: true, audioSha256: audio.sha256, alignmentSha256: alignmentHash(a), scriptSha256: scriptHash(phrases), voiceId: CAM_VOICE.voiceId };
  expect(() => approveAlignedVoice(phrases, audio, a, { ...approval, approved: false }, "simulation")).toThrow("approval");
  const script = phrases.join("\n"), { params } = resolveParams(script, "auto"), board = planConcept(script, getRecipe("cam-clay")!, "9:16");
  const references = [{ id: "narrator", sha256: usd, url: "/narrator.png" }];
  const before = generationPlan(script, params, board, placeholderTiming(phrases), references);
  const after = alignedGenerationPlan({ script, params, board, references, audio, alignment: a, approval, mode: "simulation" });
  expect(after.plan.timingBasis).toBe("simulation-alignment"); expect(after.plan.canExecute).toBe(false);
  expect(after.plan.operations.find((op) => op.id === "scene-2-clip")!.input.duration).toBe("5");
  expect(after.plan.operations.find((op) => op.id === "scene-1-clip")!.fingerprint).not.toBe(before.operations.find((op) => op.id === "scene-1-clip")!.fingerprint);
  expect(after.plan.operations.find((op) => op.id === "scene-1-start")!.fingerprint).toBe(before.operations.find((op) => op.id === "scene-1-start")!.fingerprint);
});

it("parses word-level Whisper output and resumes the same transcription request after disconnection", async () => {
  const a = alignment(), result = { text: phrases.join(" "), chunks: a.words.map((w) => ({ text: w.word, timestamp: [w.start, w.end] })) };
  const request = vi.fn().mockResolvedValueOnce({ request_id: "transcript-1" }).mockRejectedValueOnce(new Error("Connection lost"))
    .mockResolvedValueOnce({ status: "COMPLETED", request_id: "transcript-1" }).mockResolvedValueOnce(result);
  const queue = transcriptionQueue({ audio_url: "https://simulation.invalid/voice.wav", task: "transcribe", chunk_level: "word", diarize: false }, "simulation", request);
  const input = { directory, fingerprint: credit, queue, assertOwned: async () => {} };
  await expect(advanceRequest(input)).rejects.toThrow("Connection lost"); const receipt = await advanceRequest(input);
  const parsed = whisperAlignment(JSON.parse(receipt.output!), a);
  expect(alignVoice(phrases, audio, parsed, "simulation").words).toHaveLength(6);
  expect(request.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
  expect(() => whisperAlignment({ ...result, chunks: [{ text: result.text, timestamp: [0, 6] }] }, a)).toThrow("Word-level");
});

it.each(["mock", "dryrun", "fal"])("keeps asset transfers, transcription and budgets closed in live mode (%s)", async (mode) => {
  vi.stubEnv("PROVIDER_MODE", mode); const request = vi.fn();
  expect(() => connectCamAssets()).toThrow("paid generation is disabled");
  await expect(assetTransport("live", request, "fake-key").download("https://cdn.higgsfield.ai/voice.wav", "higgsfield")).rejects.toThrow("paid generation is disabled");
  await expect(transcriptionQueue({ audio_url: "https://cdn.higgsfield.ai/voice.wav", task: "transcribe", chunk_level: "word", diarize: false }, "live", request).submit()).rejects.toThrow("paid generation is disabled");
  await expect(createBudget({ ...memoryStore(), mode: "live" }, caps).reserve({ ...reservation(), approval: { ...reservation().approval, mode: "live" } })).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
