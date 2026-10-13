import path from "node:path";
import { z } from "zod";
import { Hash, readCheckpoint, saveCheckpoint, sha256 } from "./checkpoints";
import { RequestBinding } from "./request-journal";
import { assertTransportMode, bramQueue, falQueue, type JsonRequest, type McpCall } from "./provider-transports";
import { transcriptionQueue } from "./transcription";
import type { GenerationOperation } from "./generation-plan";

const Acceptance = z.object({ mode: z.literal("simulation"), fingerprint: Hash,
  requestId: z.string(), binding: RequestBinding, output: z.string() });

/** Durable offline fixture. Acceptance survives a lost response, independently
 * of the application's request journal. It is never evidence of a real job. */
export function simulatedProvider(input: {
  directory: string; jobId: string; operation: GenerationOperation;
  payload: Record<string, unknown>; transcript: unknown; assertOwned: () => Promise<void>;
}) {
  const op = input.operation;
  Hash.parse(op.fingerprint);
  const binding = RequestBinding.parse({ jobId: input.jobId, operation: op.id, model: op.model,
    transport: op.transport, payloadSha256: sha256(JSON.stringify(input.payload)) });
  const requestId = `simulation-${op.fingerprint}`;
  const output = op.kind === "alignment" ? JSON.stringify(input.transcript) : `https://simulation.invalid/outputs/${requestId}`;
  const file = path.join(input.directory, `${op.fingerprint}.json`);
  const read = async () => {
    assertTransportMode("simulation");
    const value = await readCheckpoint(file, Acceptance);
    if (value && (JSON.stringify(value.binding) !== JSON.stringify(binding) || value.fingerprint !== op.fingerprint || value.requestId !== requestId)) throw new Error("Simulation acceptance mismatch.");
    return value;
  };
  const accept = async () => {
    if (await read()) throw new Error("Duplicate simulated submission blocked.");
    await saveCheckpoint(file, { mode: "simulation", fingerprint: op.fingerprint, requestId, binding, output }, input.assertOwned);
  };
  const existing = async () => {
    const value = await read();
    if (!value) throw new Error("No acceptance evidence. Keep this request blocked.");
    return value;
  };
  const fal: JsonRequest = async (url, init) => {
    if (init.method === "POST") { await accept(); return { request_id: requestId }; }
    const value = await existing();
    if (url.endsWith("/status")) return { status: "COMPLETED", request_id: requestId };
    if (op.kind === "alignment") return JSON.parse(value.output);
    return op.kind === "image" ? { images: [{ url: value.output }] } : { video: { url: value.output } };
  };
  const higgsfield: McpCall = async (name) => {
    if (name === "generate_audio") { await accept(); return { structuredContent: { results: [{ id: requestId, type: "audio", model: "text2speech_v2" }] } }; }
    const value = await existing();
    return { structuredContent: { jobs: [{ index: 0, job_id: requestId, status: "completed", type: "audio", model: "text2speech_v2", result_url: value.output }] } };
  };
  const queue = op.kind === "voice" ? bramQueue(input.payload, "simulation", higgsfield)
    : op.kind === "alignment" ? transcriptionQueue(input.payload, "simulation", fal) : falQueue(op, input.payload, "simulation", fal);
  return { queue, binding, async verify(id: string) {
    const value = await existing();
    if (value.requestId !== id) throw new Error("No matching simulation receipt.");
    return value;
  } };
}

/** A read-only lookup for the recovery API; no queue factory or submit method. */
export async function simulationAcceptance(directory: string, fingerprint: string) {
  assertTransportMode("simulation"); Hash.parse(fingerprint);
  return readCheckpoint(path.join(directory, `${fingerprint}.json`), Acceptance);
}
