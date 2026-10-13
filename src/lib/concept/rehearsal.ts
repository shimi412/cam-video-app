import type { generationPlan } from "./generation-plan";
import { materializeRequest } from "./generation-plan";
import { advanceSimulatedRequest } from "./request-journal";
import { isSimulation } from "../providers/mode";
import { bramQueue, falQueue, type JsonRequest, type McpCall } from "./provider-transports";
import path from "node:path";

/** Exercise dependencies, payload contracts and durable receipts. Fake URLs are
 * never fetched or exposed as media. This is not a keyframe or voice approval.
 */
export async function rehearseGeneration(plan: ReturnType<typeof generationPlan>, directory: string, assertOwned: () => Promise<void>) {
  if (!isSimulation()) throw new Error("Generation rehearsal only runs offline.");
  const urls = Object.fromEntries(plan.references.map((ref) => [`reference:${ref.id}`, `https://simulation.invalid/references/${ref.sha256}.png`]));
  const complete = new Set<string>();
  const results: { operation: string; requestId?: string; state: string; reused: boolean }[] = [];
  for (const operation of plan.operations) {
    if (operation.gates.includes("split-scene")) {
      results.push({ operation: operation.id, state: "blocked-duration", reused: false });
      continue;
    }
    if (operation.dependsOn.some((id) => !complete.has(id))) throw new Error(`Unresolved operation dependency: ${operation.id}`);
    const payload = materializeRequest(operation, urls);
    const requestId = `simulation-${operation.fingerprint}`;
    const output = `https://simulation.invalid/outputs/${requestId}`;
    const fal: JsonRequest = async (url, init) => {
      if (init.method === "POST") return { request_id: requestId };
      if (url.endsWith("/status")) return { status: "COMPLETED", request_id: requestId };
      return operation.kind === "image" ? { images: [{ url: output }] } : { video: { url: output } };
    };
    const higgsfield: McpCall = async (name) => ({ structuredContent: name === "generate_audio"
      ? { results: [{ id: requestId, type: "audio", model: "text2speech_v2" }] }
      : { jobs: [{ index: 0, job_id: requestId, status: "completed", type: "audio", model: "text2speech_v2", result_url: output }] } });
    const queue = operation.kind === "voice" ? bramQueue(payload, "simulation", higgsfield) : falQueue(operation, payload, "simulation", fal);
    // Isolate receipts from the older direct fake-queue rehearsal.
    const result = await advanceSimulatedRequest({ directory: path.join(directory, "provider-contracts-v1"), fingerprint: operation.fingerprint, assertOwned, queue });
    if (result.output) urls[`output:${operation.id}`] = result.output;
    complete.add(operation.id);
    results.push({ operation: operation.id, requestId: result.requestId, state: result.state ?? "pending", reused: result.reused });
  }
  return { mode: "simulation", transportContracts: ["fal-queue-rest", "higgsfield-mcp"], mediaGenerated: false, paidRequests: 0, costUsd: 0, planFingerprint: plan.fingerprint, operations: results };
}
