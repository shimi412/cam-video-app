/**
 * Checks that the real-mode keys work, without spending on media generation.
 *   pnpm check:providers
 * - ANTHROPIC_API_KEY: one tiny structured call (~$0.001) on the chat model.
 * - FAL_KEY: uploads a 1-byte file to fal storage (free) to validate the key.
 * - RUNWAYML_API_SECRET (optional, VIDEO_PROVIDER=runway): reads the organization
 *   endpoint, which generates nothing and costs nothing.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { fal } from "@fal-ai/client";

const CHAT_MODEL = process.env.CHAT_MODEL ?? "claude-sonnet-5";

async function checkAnthropic(): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "ANTHROPIC_API_KEY: missing in .env";
  try {
    const anthropic = createAnthropic({ apiKey });
    const { object } = await generateObject({
      model: anthropic(CHAT_MODEL),
      schema: z.object({ ok: z.boolean() }),
      prompt: 'Reply with {"ok": true}.',
    });
    return `ANTHROPIC_API_KEY: OK (${CHAT_MODEL} answered ${JSON.stringify(object)})`;
  } catch (err) {
    return `ANTHROPIC_API_KEY: FAILED — ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function checkFal(): Promise<string> {
  const key = process.env.FAL_KEY;
  if (!key) return "FAL_KEY: missing in .env";
  try {
    fal.config({ credentials: key });
    const url = await fal.storage.upload(new File(["x"], "ping.txt", { type: "text/plain" }));
    return `FAL_KEY: OK (storage upload succeeded: ${url.slice(0, 40)}…)`;
  } catch (err) {
    return `FAL_KEY: FAILED — ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function checkRunway(): Promise<string> {
  const key = process.env.RUNWAYML_API_SECRET;
  const selected = (process.env.VIDEO_PROVIDER ?? "fal") === "runway";
  if (!key) {
    return selected
      ? "RUNWAYML_API_SECRET: missing in .env (VIDEO_PROVIDER=runway needs it)"
      : "RUNWAYML_API_SECRET: not set (fine, VIDEO_PROVIDER=fal)";
  }
  try {
    const res = await fetch("https://api.dev.runwayml.com/v1/organization", {
      headers: { Authorization: `Bearer ${key}`, "X-Runway-Version": "2024-11-06" },
    });
    if (res.status === 401 || res.status === 403) return `RUNWAYML_API_SECRET: FAILED — rejected (${res.status})`;
    if (!res.ok) return `RUNWAYML_API_SECRET: key present, organization endpoint answered ${res.status} (not a credential error)`;
    const body = (await res.json()) as { creditBalance?: number };
    const balance = typeof body.creditBalance === "number" ? `, ${body.creditBalance} credits ($${(body.creditBalance * 0.01).toFixed(2)})` : "";
    return `RUNWAYML_API_SECRET: OK${balance}`;
  } catch (err) {
    return `RUNWAYML_API_SECRET: FAILED — ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function main() {
  const [a, f, r] = await Promise.all([checkAnthropic(), checkFal(), checkRunway()]);
  console.log(a);
  console.log(f);
  console.log(r);
  console.log(
    `BRAIN_MODE=${process.env.BRAIN_MODE ?? "(unset)"} PROVIDER_MODE=${process.env.PROVIDER_MODE ?? "(unset)"} VIDEO_PROVIDER=${process.env.VIDEO_PROVIDER ?? "fal (default)"}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
