/**
 * LLM-backed framing, three modes via BRAIN_MODE:
 *  - "api":  Claude via the Anthropic API through the AI SDK (default, delivery mode).
 *            Model id comes from the admin setting "chat_model"
 *            (default claude-sonnet-5), never exposed to the client.
 *  - "cli":  local Claude Code CLI in headless mode (dev only, never shipped).
 *  - "mock": deterministic heuristic (zero cost, offline).
 * Every mode returns the same shape as resolveParams(); on any failure the
 * heuristic is the fallback so the app never blocks.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { getSetting } from "./settings";
import { resolveParams, type Overrides, type ProductionParams, type ScriptAnalysis } from "./brain";
import { RECIPES, getRecipe } from "./recipes";

const exec = promisify(execFile);

export type FramingResult = {
  analysis: ScriptAnalysis;
  params: ProductionParams;
  brain: "mock" | "cli" | "api";
};

export const DEFAULT_CHAT_MODEL = "claude-sonnet-5";

function brainMode(): "mock" | "cli" | "api" {
  const mode = process.env.BRAIN_MODE;
  return mode === "cli" || mode === "api" ? mode : "mock";
}

/** Returns a factory for the configured Anthropic model, or null without an API key. */
export function getAnthropicModel() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const anthropic = createAnthropic({ apiKey });
  return async () => anthropic((await getSetting<string>("chat_model")) ?? DEFAULT_CHAT_MODEL);
}

const CATALOG = RECIPES.map((r) => `- "${r.slug}" (${r.family}): ${r.description}`).join("\n");

const FRAMING_PROMPT = (script: string) => `You are the framing brain of a video production app used by a non-profit that debunks disinformation.
Given the script below, choose the best video model and tone.

Video models:
${CATALOG}

Tones: "serious" | "energetic" | "calm".
Guidance: grave subjects (hate, violence, historical lies) → serious tone and a sober look (ink noir, flat vector, vox collage). Explanatory scripts with facts and mechanisms → a whiteboard model. Punchy short rebuttals → flat vector or retro.

Reply with ONLY this JSON, nothing else:
{"templateSlug": "<one slug from the list>", "tone": "serious" | "energetic" | "calm", "reason": "<one sentence, addressed to the user, explaining the choice>"}

The "reason" MUST be written in English: this app's users are English speakers.

Script:
"""
${script}
"""`;

const FramingSchema = z.object({
  templateSlug: z.string(),
  tone: z.enum(["serious", "energetic", "calm"]),
  reason: z.string(),
});
type Framing = z.infer<typeof FramingSchema>;

function valid(f: Framing | null): f is Framing {
  return Boolean(f && getRecipe(f.templateSlug));
}

async function frameWithCli(script: string): Promise<Framing | null> {
  try {
    const claudeBin = process.env.CLAUDE_CLI_PATH ?? "claude";
    const { stdout } = await exec(
      claudeBin,
      ["-p", FRAMING_PROMPT(script), "--output-format", "json"],
      { timeout: 60_000, maxBuffer: 1024 * 1024 },
    );
    const envelope = JSON.parse(stdout);
    const match = String(envelope.result ?? "").match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = FramingSchema.safeParse(JSON.parse(match[0]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function frameWithApi(script: string): Promise<Framing | null> {
  const model = getAnthropicModel();
  if (!model) return null;
  try {
    const { object } = await generateObject({
      model: await model(),
      schema: FramingSchema,
      prompt: FRAMING_PROMPT(script),
      maxRetries: 2,
    });
    return object;
  } catch (err) {
    console.error("[brain] api framing failed, falling back to heuristic:", err);
    return null;
  }
}

export async function frameProduction(
  script: string,
  mode: "auto" | "manual",
  overrides?: Overrides,
): Promise<FramingResult> {
  const heuristic = resolveParams(script, mode, overrides);
  const brain = brainMode();

  // Manual mode with an explicit model: nothing to decide, skip the LLM.
  if (brain === "mock" || (mode === "manual" && overrides?.templateSlug)) {
    return { ...heuristic, brain: "mock" };
  }

  const llm = brain === "cli" ? await frameWithCli(script) : await frameWithApi(script);
  if (!valid(llm)) return { ...heuristic, brain: "mock" };

  const merged = resolveParams(script, mode, {
    ...overrides,
    templateSlug: overrides?.templateSlug ?? llm.templateSlug,
    tone: overrides?.tone ?? llm.tone,
  });
  return {
    analysis: { ...merged.analysis, suggestedTemplate: llm.templateSlug, reason: llm.reason },
    params: merged.params,
    brain,
  };
}
