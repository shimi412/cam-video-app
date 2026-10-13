import type { generationPlan } from "./generation-plan";
import { materializeRequest } from "./generation-plan";
import { advanceSimulatedRequest } from "./request-journal";
import { isSimulation } from "../providers/mode";

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
    materializeRequest(operation, urls);
    const result = await advanceSimulatedRequest({ directory, fingerprint: operation.fingerprint, assertOwned,
      queue: { mode: "simulation",
        submit: async () => ({ requestId: `simulation-${operation.fingerprint}` }),
        poll: async (requestId) => ({ state: "complete", output: `https://simulation.invalid/outputs/${requestId}` }),
      },
    });
    if (result.output) urls[`output:${operation.id}`] = result.output;
    complete.add(operation.id);
    results.push({ operation: operation.id, requestId: result.requestId, state: result.state ?? "pending", reused: result.reused });
  }
  return { mode: "simulation", mediaGenerated: false, paidRequests: 0, costUsd: 0, planFingerprint: plan.fingerprint, operations: results };
}
