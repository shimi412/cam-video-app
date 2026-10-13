import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { createBudget, quoteHash, ApprovalSchema, QuoteSchema, type BudgetQuote } from "./budget";
import { postgresBudgetStore } from "./budget-store";
import { readCheckpoint, saveCheckpoint } from "./checkpoints";
import type { generationPlan } from "./generation-plan";
import { assertTransportMode } from "./provider-transports";

/** Artificial amounts exercise reservation/settlement. Never provider prices,
 * customer charges, or approvals to spend. Each free preview has its own scope.
 */
export async function rehearsalBudget(plan: ReturnType<typeof generationPlan>, jobId: string, directory: string, assertOwned: () => Promise<void>) {
  assertTransportMode("simulation");
  const file = path.join(directory, `budget-${plan.fingerprint}.json`);
  const schema = z.object({ quote: QuoteSchema, approval: ApprovalSchema });
  let packet = await readCheckpoint(file, schema);
  if (!packet) {
    const quote: BudgetQuote = { plan: plan.fingerprint, source: "simulation-fixture", expiresAt: Date.now() + 86400_000,
      lines: plan.operations.map((op) => ({ operation: op.fingerprint, unit: op.transport === "higgsfield-mcp" ? "higgsfield-credit" : "usd", maximum: 1000 })) };
    packet = { quote, approval: { id: randomUUID(), mode: "simulation", plan: plan.fingerprint, quote: quoteHash(quote), caps: { usd: 1_000_000, "higgsfield-credit": 1_000_000 }, expiresAt: quote.expiresAt } };
    await saveCheckpoint(file, packet, assertOwned);
  }
  const budget = createBudget(postgresBudgetStore("simulation", `rehearsal-${jobId}`), { usd: 1_000_000_000, "higgsfield-credit": 1_000_000_000 });
  await budget.reserve({ jobId, plan: plan.fingerprint, operations: plan.operations, ...packet });
  return { budget, ...packet };
}
