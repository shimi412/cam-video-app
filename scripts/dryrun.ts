/** Offline integration check. Archived recipes are allowed only through this CLI. */
process.env.PROVIDER_MODE = "dryrun";
process.env.BRAIN_MODE = "mock";

import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../src/db";
import { resolveParams } from "../src/lib/brain";
import { estimateProduction } from "../src/lib/pricing";
import { getMarginMultiplier } from "../src/lib/settings";
import { runJob } from "../src/lib/runner";

let networkAttempts = 0;
globalThis.fetch = async () => {
  networkAttempts += 1;
  throw new Error("Network is disabled during a dry run.");
};

async function main() {
  const [templateSlug = "cartoon-ink-noir", aspect = "9:16"] = process.argv.slice(2);
  const script = z.string().min(40).parse(readFileSync(0, "utf8").trim());
  const aspectRatio = z.enum(["9:16", "16:9", "1:1"]).parse(aspect);
  const { params } = resolveParams(script, "manual", { templateSlug, aspectRatio }, { allowArchived: true });
  const estimate = estimateProduction(params, await getMarginMultiplier());
  const [template] = await db.select().from(schema.templates).where(eq(schema.templates.slug, params.templateSlug));
  const [job] = await db.insert(schema.jobs).values({
    templateId: template?.id,
    status: "confirmed",
    script,
    params: { ...params, executionMode: "dryrun", allowArchivedRecipe: true },
    estimateUsd: estimate.totalBilledUsd.toFixed(2),
    confirmedAt: new Date(),
  }).returning();

  const started = Date.now();
  // Concurrent delivery of the same work must still produce it only once.
  await Promise.all([runJob(job.id), runJob(job.id)]);
  const [done] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, job.id));
  const entries = await db.select().from(schema.creditLedger).where(eq(schema.creditLedger.jobId, job.id));
  const calls = await db.select().from(schema.apiCalls).where(eq(schema.apiCalls.jobId, job.id));
  const state = done.params as Record<string, unknown>;
  if (done.status !== "succeeded") throw new Error(done.error ?? "Dry run failed");
  if (Number(done.billedUsd) !== 0 || entries.length > 0) throw new Error("Simulation wrote to client credits");
  if (calls.some((call) => Number(call.billedUsd) !== 0 || Number(call.realCostUsd) !== 0)) throw new Error("Simulation reported real expenses");
  if (networkAttempts > 0) throw new Error("Simulation attempted external network access");
  if (calls.filter((call) => call.kind === "render").length !== 1) throw new Error("Duplicate execution detected");
  console.log(JSON.stringify({
    jobId: job.id,
    status: done.status,
    seconds: Math.round((Date.now() - started) / 1000),
    billedUsd: Number(done.billedUsd),
    ledgerEntries: entries.length,
    externalNetworkAttempts: networkAttempts,
    renderCount: calls.filter((call) => call.kind === "render").length,
    simulatedBilledUsd: state.simulatedBilledUsd,
    output: done.outputPath,
    sheet: state.sheetUrl,
  }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "Dry run failed");
  process.exit(1);
});
