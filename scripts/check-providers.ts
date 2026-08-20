/**
 * Checks that the real-mode keys work, without spending on media generation.
 *   pnpm check:providers
 * - ANTHROPIC_API_KEY: one tiny structured call (~$0.001) on the chat model.
 * - FAL_KEY: uploads a 1-byte file to fal storage (free) to validate the key.
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

async function main() {
  const [a, f] = await Promise.all([checkAnthropic(), checkFal()]);
  console.log(a);
  console.log(f);
  console.log(`BRAIN_MODE=${process.env.BRAIN_MODE ?? "(unset)"} PROVIDER_MODE=${process.env.PROVIDER_MODE ?? "(unset)"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
