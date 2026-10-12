import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { getSetting } from "../settings";
import { brainMode } from "./mode";

const exec = promisify(execFile);
export const DEFAULT_CHAT_MODEL = "claude-sonnet-5";

/** All Anthropic generation crosses this gate, including storyboard helpers. */
export async function requestBrainObject<T>(input: {
  schema: z.ZodType<T>;
  prompt: string;
  system?: string;
  maxRetries?: number;
}): Promise<T | null> {
  if (brainMode() !== "api" || !process.env.ANTHROPIC_API_KEY) return null;
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = (await getSetting<string>("chat_model")) ?? DEFAULT_CHAT_MODEL;
  const { object } = await generateObject({ ...input, model: anthropic(model) });
  return object;
}

/** Subscription-backed CLI is a local development option only. */
export async function requestCliObject<T>(prompt: string, schema: z.ZodType<T>): Promise<T | null> {
  if (brainMode() !== "cli" || process.env.NODE_ENV === "production") return null;
  const { stdout } = await exec(
    process.env.CLAUDE_CLI_PATH ?? "claude",
    ["-p", prompt, "--output-format", "json"],
    { timeout: 60_000, maxBuffer: 1024 * 1024 },
  );
  const envelope = JSON.parse(stdout);
  const match = String(envelope.result ?? "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  const parsed = schema.safeParse(JSON.parse(match[0]));
  return parsed.success ? parsed.data : null;
}
