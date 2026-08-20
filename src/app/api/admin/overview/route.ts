import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { getBalanceUsd } from "@/lib/credits";

export async function GET() {
  const [balance, ledger, apiCalls, jobs, settings] = await Promise.all([
    getBalanceUsd(),
    db.select().from(schema.creditLedger).orderBy(desc(schema.creditLedger.createdAt)).limit(50),
    db.select().from(schema.apiCalls).orderBy(desc(schema.apiCalls.createdAt)).limit(50),
    db.select().from(schema.jobs).orderBy(desc(schema.jobs.createdAt)).limit(20),
    db.select().from(schema.settings),
  ]);

  return Response.json({
    balance,
    ledger: ledger.map((l) => ({
      id: l.id,
      deltaUsd: Number(l.deltaUsd),
      kind: l.kind,
      note: l.note,
      createdAt: l.createdAt,
    })),
    apiCalls: apiCalls.map((c) => ({
      id: c.id,
      provider: c.provider,
      kind: c.kind,
      model: c.model,
      realCostUsd: Number(c.realCostUsd),
      billedUsd: Number(c.billedUsd),
      createdAt: c.createdAt,
    })),
    jobs: jobs.map((j) => ({
      id: j.id,
      status: j.status,
      script: j.script.slice(0, 80),
      estimateUsd: j.estimateUsd ? Number(j.estimateUsd) : null,
      billedUsd: j.billedUsd ? Number(j.billedUsd) : null,
      createdAt: j.createdAt,
    })),
    settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
  });
}
