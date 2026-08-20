import { sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Credits are denominated in USD. The client always sees dollars, never tokens.
 * Balance = sum of ledger deltas. Failed technical runs are refunded
 * (adjustment), creative iterations are billed at the displayed price.
 */

export async function getBalanceUsd(): Promise<number> {
  const rows = await db
    .select({ balance: sql<string>`coalesce(sum(${schema.creditLedger.deltaUsd}), 0)` })
    .from(schema.creditLedger);
  return Number(rows[0].balance);
}

export async function addLedgerEntry(entry: {
  deltaUsd: number;
  kind: "topup" | "consumption" | "adjustment";
  jobId?: string;
  note?: string;
}) {
  await db.insert(schema.creditLedger).values({
    deltaUsd: entry.deltaUsd.toFixed(2),
    kind: entry.kind,
    jobId: entry.jobId,
    note: entry.note,
  });
}

/** Default margin: real cost x multiplier = client price. Tuned per tier later. */
export const DEFAULT_MARGIN_MULTIPLIER = 2.5;

export function billedFromRealCost(realCostUsd: number, multiplier = DEFAULT_MARGIN_MULTIPLIER): number {
  return Number((realCostUsd * multiplier).toFixed(4));
}
