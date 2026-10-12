/** Explicit credential diagnostics, with no billable inference. */
import { checkAnthropic, checkFal, checkRunway } from "../src/lib/providers/health";
import { DEFAULT_CHAT_MODEL } from "../src/lib/providers/brain";

async function main() {
  const checks = await Promise.all([
    checkAnthropic(process.env.CHAT_MODEL ?? DEFAULT_CHAT_MODEL),
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
