/** Real process-death test, restricted to offline local previews. No provider calls. */
process.env.PROVIDER_MODE = "dryrun";
process.env.BRAIN_MODE = "mock";

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readdir, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { resolveParams } from "../src/lib/brain";
import { runJob } from "../src/lib/runner";
import { jobWorkerActive } from "../src/lib/job-lock";
import { GET } from "../src/app/api/jobs/[id]/route";

let networkAttempts = 0;
globalThis.fetch = async () => { networkAttempts++; throw new Error("External fetch disabled in recovery test"); };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const scriptPath = path.resolve("scripts/check-recovery.ts");
function worker(id: string, resume = false) {
  const child = spawn(process.execPath, ["--import", "tsx", scriptPath, "--worker", id, ...(resume ? ["--resume"] : [])], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let diagnostics = "";
  child.stdout.on("data", (data) => { diagnostics += data; });
  child.stderr.on("data", (data) => { diagnostics += data; });
  const done = once(child, "exit").then(([code, signal]) => ({ code, signal, diagnostics }));
  return { child, done };
}
async function view(id: string) {
  return (await GET(new Request(`http://localhost/api/jobs/${id}`), { params: Promise.resolve({ id }) })).json();
}
async function main() {
  if (process.argv.includes("--worker")) {
    await runJob(process.argv[process.argv.indexOf("--worker") + 1], { resume: process.argv.includes("--resume") });
    assert.equal(networkAttempts, 0);
    return;
  }
  const script = "Read the full passage before sharing a claim. Check who wrote it and when it was published. Compare the quote with the original source. A missing sentence can change the entire meaning. Share the context so others can judge for themselves.";
  const { params } = resolveParams(script, "auto", { aspectRatio: "16:9" });
  const [job] = await db.insert(schema.jobs).values({ status: "confirmed", script, params: { ...params, executionMode: "dryrun" }, estimateUsd: "0.00", confirmedAt: new Date() }).returning();
  const directory = path.join(process.cwd(), "storage/concepts", job.id, "checkpoints");
  const first = worker(job.id);
  const deadline = Date.now() + 180_000;
  let receipt = "";
  while (Date.now() < deadline) {
    receipt = (await readdir(directory).catch(() => [] as string[])).find((file) => file.endsWith(".json")) ?? "";
    if (receipt) break;
    if (first.child.exitCode !== null) throw new Error((await first.done).diagnostics || "Worker exited before checkpoint");
    await sleep(100);
  }
  if (!receipt) { first.child.kill("SIGKILL"); throw new Error("Timed out waiting for a completed render"); }
  assert.equal(await jobWorkerActive(job.id), true);
  assert.equal((await view(job.id)).canResume, false);
  const cachedPath = path.join(directory, receipt.replace(/\.json$/, ".mp4"));
  const renderedAt = (await stat(cachedPath)).mtimeMs;
  first.child.kill("SIGKILL");
  await first.done;
  for (let i = 0; i < 50 && await jobWorkerActive(job.id); i++) await sleep(100);
  const interrupted = await view(job.id);
  assert.equal(interrupted.status, "running");
  assert.equal(interrupted.interrupted, true);
  assert.equal(interrupted.canResume, true);
  console.log(`Interrupted ${job.id} after its render checkpoint; recovery is available.`);
  const resumed = await Promise.all([worker(job.id, true).done, worker(job.id, true).done]);
  for (const result of resumed) assert.equal(result.code, 0, result.diagnostics);
  const [done] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, job.id));
  const state = done.params as { execution: { attempts: number }; renderReused: boolean; artifacts: { url: string; label: string }[] };
  assert.equal(done.status, "succeeded", done.error ?? undefined);
  assert.equal(state.execution.attempts, 2, "Only one recovery worker should claim the job");
  assert.equal(state.renderReused, true);
  assert.equal((await stat(cachedPath)).mtimeMs, renderedAt, "No second render should run");
  const entries = await db.select().from(schema.creditLedger).where(eq(schema.creditLedger.jobId, job.id));
  const calls = await db.select().from(schema.apiCalls).where(eq(schema.apiCalls.jobId, job.id));
  assert.equal(Number(done.billedUsd), 0);
  assert.equal(entries.length, 0);
  assert.equal(calls.length, 1);
  assert.equal(Number(calls[0].realCostUsd), 0);
  assert.equal(Number(calls[0].billedUsd), 0);
  const quality = state.artifacts.find((a) => a.label === "Quality checks")!;
  const report = JSON.parse(await readFile(path.join(process.cwd(), "storage", quality.url.replace(/^\/api\/media\//, "")), "utf8"));
  assert.ok(report.checked.includes("duration"));
  const final = await view(job.id);
  assert.equal(final.canResume, false);
  assert.equal(final.interrupted, false);
  const proof = { jobId: job.id, processKilled: true, recovered: true, attempts: state.execution.attempts, renderReused: state.renderReused, duplicateRecoveryPrevented: true, ledgerEntries: entries.length, meteredRenders: calls.length, billedUsd: Number(done.billedUsd), output: done.outputPath, qualityChecks: report.checked };
  await mkdir("storage/qa", { recursive: true });
  await writeFile("storage/qa/cam-recovery-proof.json", JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
