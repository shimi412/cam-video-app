/** Explicit credential diagnostics, with no billable inference. */
import { checkFal, checkRunway } from "../src/lib/providers/health";
import { checkOpenrouter } from "../src/lib/providers/openrouter";

async function main() {
  const checks = await Promise.all([
    checkOpenrouter().then(result => ({provider:"openrouter",...result})),
    checkFal(),
    ...((process.env.VIDEO_PROVIDER ?? "fal") === "runway" ? [checkRunway()] : []),
  ]);
  for (const check of checks) console.log(`${check.provider}: ${check.ok ? "OK" : "FAILED"}. ${check.detail}`);
  if (checks.some((check) => !check.ok)) process.exitCode = 1;
}

main().catch(() => {
  console.error("Provider diagnostics failed.");
  process.exitCode = 1;
});
