/**
 * End-to-end dry run of the pipeline with the real director brain (Claude)
 * and simulated media providers: zero media spend, validates storyboard,
 * sync and montage. Refunds the simulated consumption at the end.
 *   pnpm tsx --env-file-if-exists=.env scripts/dryrun.ts <templateSlug> <aspect> < script.txt
 */
process.env.PROVIDER_MODE = "dryrun";

import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { frameProduction } from "../src/lib/brain-llm";
import { estimateProduction } from "../src/lib/pricing";
import { getMarginMultiplier } from "../src/lib/settings";
import { runJob } from "../src/lib/runner";
import { addLedgerEntry } from "../src/lib/credits";

async function main() {
  const [templateSlug = "cartoon-ink-noir", aspect = "9:16"] = process.argv.slice(2);
  const script = readFileSync(0, "utf8").trim();
  const aspectRatio = aspect as "9:16" | "16:9" | "1:1";

  const { params, brain } = await frameProduction(script, "manual", { templateSlug, aspectRatio });
  const estimate = estimateProduction(params, await getMarginMultiplier());
  console.log(`framing brain=${brain} template=${params.templateSlug} shots≈${params.shotCount} estimate=$${estimate.totalBilledUsd} (real $${estimate.totalRealUsd})`);

  const [template] = await db.select().from(schema.templates).where(eq(schema.templates.slug, params.templateSlug));
  const [job] = await db
    .insert(schema.jobs)
    .values({ templateId: template?.id, status: "confirmed", script, params: { ...params }, estimateUsd: estimate.totalBilledUsd.toFixed(2), confirmedAt: new Date() })
    .returning();

  const t0 = Date.now();
  await runJob(job.id);
  const [done] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, job.id));
  const p = done.params as Record<string, unknown>;
  console.log(`status=${done.status} in ${Math.round((Date.now() - t0) / 1000)}s billed=$${done.billedUsd} error=${done.error ?? "none"}`);
  console.log(`output=${done.outputPath}`);
  console.log(JSON.stringify(p.storyboard, null, 2));
  if (done.billedUsd) {
    await addLedgerEntry({ deltaUsd: Number(done.billedUsd), kind: "adjustment", jobId: job.id, note: "Dry run refund (simulated providers)" });
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
