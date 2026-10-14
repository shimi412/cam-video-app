import { withAccess } from "@/lib/access";
import { desc,sql } from "drizzle-orm";
import { db, pool, schema } from "@/db";
import { getBalanceUsd } from "@/lib/credits";
import { isSimulation } from "@/lib/providers/mode";
import { BudgetBookSchema,budgetUsage } from "@/lib/concept/budget";

async function handleGET() {
  const connected=!isSimulation()&&process.env.CAM_LIVE_ENABLED==="1";
  const [balance, ledger, apiCalls, jobs, settings] = await Promise.all([
    getBalanceUsd(),
    db.select().from(schema.creditLedger).orderBy(desc(schema.creditLedger.createdAt)).limit(50),
    db.select().from(schema.apiCalls).where(connected?sql`${schema.apiCalls.provider}='openrouter' OR ${schema.apiCalls.jobId} IN (SELECT id FROM jobs WHERE params->>'live'='true')`:undefined).orderBy(desc(schema.apiCalls.createdAt)).limit(50),
    db.select().from(schema.jobs).where(connected?sql`${schema.jobs.params}->>'live'='true'`:undefined).orderBy(desc(schema.jobs.createdAt)).limit(20),
    db.select().from(schema.settings),
  ]);

  const storedBudget=settings.find(s=>s.key==="cam-budget:live:cam-provider-account")?.value;
  const book=storedBudget?BudgetBookSchema.parse(storedBudget):null;
  const ai=(await pool.query("SELECT coalesce(sum(actual_usd) FILTER (WHERE state='complete'),0) AS settled, coalesce(sum(maximum_usd) FILTER (WHERE state<>'complete'),0) AS reserved FROM assistant_requests WHERE created_at >= date_trunc('month',now() AT TIME ZONE 'UTC')")).rows[0];
  return Response.json({
    connected,
    aiUsage:{settled:Number(ai.settled),reserved:Number(ai.reserved),cap:Number(settings.find(s=>s.key==="assistant_monthly_usd")?.value??25)},
    mediaBudget:{caps:book?.caps??{usd:100e6,"higgsfield-credit":100e6},usage:book?budgetUsage(book):{usd:0,"higgsfield-credit":0}},
    balance,
    ledger: (connected?[]:ledger).map((l) => ({
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

export const GET = withAccess(handleGET, "admin");
