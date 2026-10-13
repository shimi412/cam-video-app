import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { z } from "zod";
import { assertTransportMode } from "./provider-transports";
import { lockedAssets } from "./assets";
import { sha256, Hash, readCheckpoint, saveCheckpoint } from "./checkpoints";
import { simulatedProvider } from "./simulated-provider";
import { rehearsalBudget } from "./rehearsal-budget";
import { advanceProductionFlow, renderProductionFlow, type FlowDecision, type FlowInput, type FlowReview, type FlowServices } from "./production-flow";
import type { ProductionParams } from "../brain";
import type { Recipe } from "../recipes";
import type { ConceptTiming } from "./types";
import type { GenerationOperation } from "./generation-plan";

export type RehearsalInput = { jobId: string; directory: string; script: string; params: ProductionParams; recipe: Recipe;
  voiceFile: string; timing: ConceptTiming; assertOwned: () => Promise<void> };
const ReviewReceipt = z.object({ id: z.uuid(), target: Hash, decision: z.enum(["approved", "rejected"]), mode: z.literal("simulation") }).strict();

/** Trusted offline fixture factory, never exposed to HTTP input. The target
 * preset is Bram, but the bytes are a local Mac test voice and labelled cards.
 * This factory cannot connect to an external transport or approve real media.
 */
export async function productionFixture(input: RehearsalInput) {
  assertTransportMode("simulation"); await input.assertOwned();
  const wav = await readFile(input.voiceFile), references = await lockedAssets();
  const operations = new Map<string, GenerationOperation>();
  const stats = { submissions: 0, uploads: 0, downloads: 0 };
  const transcript = { text: input.timing.phrases.map((p) => p.text).join(" "), chunks: input.timing.words.map((w) => ({ text: w.word, timestamp: [w.start, w.end] })) };
  const readReview = (request: FlowReview) => readCheckpoint(path.join(input.directory, "reviews", `${request.target}.json`), ReviewReceipt);
  const decide = async (request: FlowReview, decision: "approved" | "rejected" = "approved"): Promise<FlowDecision> => {
    assertTransportMode("simulation"); Hash.parse(request.target);
    const old = await readReview(request);
    if (old?.decision === decision) return old;
    const result: FlowDecision = { id: randomUUID(), mode: "simulation", target: request.target, decision };
    await saveCheckpoint(path.join(input.directory, "reviews", `${request.target}.json`), result, input.assertOwned); return result;
  };
  const card = (op: GenerationOperation) => sharp({ create: { width: 960, height: 540, channels: 3, background: "#233249" } })
    .composite([{ input: Buffer.from(`<svg width="960" height="540"><rect x="30" y="30" width="900" height="480" fill="none" stroke="#54c2b4" stroke-width="8"/><text x="480" y="220" fill="white" font-family="sans-serif" font-size="56" text-anchor="middle">OFFLINE PIPELINE TEST</text><text x="480" y="290" fill="white" font-family="sans-serif" font-size="32" text-anchor="middle">Scene ${Number(op.scene)} · ${op.kind === "video" ? "animation" : op.id.endsWith("-end") ? "end image" : "start image"}</text><text x="480" y="350" fill="white" font-family="sans-serif" font-size="25" text-anchor="middle">Local test voice · not a Bram recording</text></svg>`) }]).png().toBuffer();
  const services: FlowServices = {
    mode: "simulation", review: readReview,
    authorize: (plan) => rehearsalBudget(plan, input.jobId, path.join(input.directory, "budgets"), input.assertOwned),
    cost: async (op, requestId) => ({ unit: op.transport === "higgsfield-mcp" ? "higgsfield-credit" : "usd", actual: 1000, evidence: `simulation-only:${requestId}` }),
    queue: (operation, payload) => {
      operations.set(operation.fingerprint, operation);
      const provider = simulatedProvider({ jobId: input.jobId, operation, payload, transcript, directory: path.join(input.directory, "acceptances"), assertOwned: input.assertOwned });
      return { ...provider.queue, submit: async () => { stats.submissions++; return provider.queue.submit(); } };
    },
    assets: { mode: "simulation",
      upload: async (bytes) => { stats.uploads++; return { url: `https://simulation.invalid/uploads/${sha256(bytes)}`, expiresAt: Date.now() + 365 * 86400_000 }; },
      download: async (url) => {
        stats.downloads++;
        const prefix = "https://simulation.invalid/outputs/simulation-";
        if (!url.startsWith(prefix)) throw new Error("Unexpected fixture result URL.");
        const op = operations.get(url.slice(prefix.length)); if (!op) throw new Error("Unknown fixture output.");
        if (op.kind === "voice") return new Response(new Uint8Array(wav));
        if (op.kind === "image") return new Response(new Uint8Array(await card(op)));
        if (op.kind !== "video") throw new Error("Unexpected media kind.");
        const root = path.join(input.directory, "fixture-media"); await mkdir(root, { recursive: true });
        const png = path.join(root, `${op.fingerprint}.png`), mp4 = path.join(root, `${op.fingerprint}.mp4`);
        await writeFile(png, await card(op));
        await promisify(execFile)("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-i", png, "-vf", "scale=640:360", "-t", String(op.input.duration), "-r", "30", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", mp4], { timeout: 60_000 });
        return new Response(new Uint8Array(await readFile(mp4)));
      },
    },
  };
  const flow: FlowInput = { ...input, references, services };
  return { flow, services, stats, decide };
}

/** Run the whole chain as a separate diagnostic artifact. Automatic decisions
 * here are explicitly simulation fixtures; no result is assigned to CAM scenes.
 */
export async function rehearseProduction(input: RehearsalInput & { workspace: string }) {
  assertTransportMode("simulation");
  const fixture = await productionFixture(input);
  fixture.services.review = (request) => fixture.decide(request);
  const flow = await advanceProductionFlow(fixture.flow);
  if (flow.status !== "ready-to-render" || !flow.render) {
    const report = { mode: "simulation", finalBramVoiceApproved: false, costUsd: 0, paidRequests: 0, status: flow.status, phase: flow.phase, events: flow.events };
    await saveCheckpoint(path.join(input.workspace, "production-sequence.json"), report, input.assertOwned); return { report, rendered: false };
  }
  const rendered = await renderProductionFlow(flow.render, path.join(input.workspace, "production-sequence"), input.directory, input.assertOwned);
  const report = { mode: "simulation", status: "complete", mediaSource: "local-test-voice-calibration-and-reviewed-imports", approvals: "simulation-fixtures-only",
    finalBramVoiceApproved: false, paidGenerationAuthorized: false, paidRequests: 0, costUsd: 0,
    events: flow.events, ...fixture.stats, timingBasis: "test-voice-with-estimated-word-timestamps", render: rendered };
  await saveCheckpoint(path.join(input.workspace, "production-sequence.json"), report, input.assertOwned);
  return { report, rendered: true };
}
