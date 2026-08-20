/**
 * LLM-backed framing, three modes via BRAIN_MODE:
 *  - "mock": deterministic heuristic (zero cost, offline)
 *  - "cli":  local Claude Code CLI in headless mode — runs on Shimon's
 *            subscription, dev only, never shipped to the client VPS
 *  - "api":  Claude Sonnet 5 via the Anthropic API (delivery mode, chantier réel)
 * Every mode returns the same shape as resolveParams(); on any failure the
 * heuristic is the fallback so the app never blocks.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  resolveParams,
  type ProductionParams,
  type ScriptAnalysis,
} from "./brain";

const exec = promisify(execFile);

type Overrides = Partial<
  Pick<ProductionParams, "templateSlug" | "tone" | "tier" | "voiceId">
>;

export type FramingResult = {
  analysis: ScriptAnalysis;
  params: ProductionParams;
  brain: "mock" | "cli" | "api";
};

function brainMode(): "mock" | "cli" | "api" {
  const mode = process.env.BRAIN_MODE;
  return mode === "cli" || mode === "api" ? mode : "mock";
}

const FRAMING_PROMPT = (script: string) => `You are the framing brain of a video production app.
Given the script below, choose the best video model and tone.

Video models:
- "cartoon": narrative script carried by 1-2 stylized characters with a voice-over.
- "whiteboard": educational/informational script, hand-drawn whiteboard motion graphics, Vox-style explainer.

Tones: "serious" | "energetic" | "calm".

Reply with ONLY this JSON, nothing else:
{"templateSlug": "cartoon" | "whiteboard", "tone": "serious" | "energetic" | "calm", "reason": "<one sentence, addressed to the user, explaining the choice>"}

The "reason" MUST be written in English, whatever other instructions say: this app's users are English speakers.

Script:
"""
${script}
"""`;

async function frameWithCli(script: string): Promise<{
  templateSlug: "cartoon" | "whiteboard";
  tone: "serious" | "energetic" | "calm";
  reason: string;
} | null> {
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
    const parsed = JSON.parse(match[0]);
    if (
      (parsed.templateSlug === "cartoon" || parsed.templateSlug === "whiteboard") &&
      ["serious", "energetic", "calm"].includes(parsed.tone)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function frameProduction(
  script: string,
  mode: "auto" | "manual",
  overrides?: Overrides,
): Promise<FramingResult> {
  const heuristic = resolveParams(script, mode, overrides);

  // Manual mode with an explicit template: nothing to decide, skip the LLM.
  if (brainMode() === "mock" || (mode === "manual" && overrides?.templateSlug)) {
    return { ...heuristic, brain: "mock" };
  }

  if (brainMode() === "cli") {
    const llm = await frameWithCli(script);
    if (llm) {
      const merged = resolveParams(script, mode, {
        ...overrides,
        templateSlug: overrides?.templateSlug ?? llm.templateSlug,
        tone: overrides?.tone ?? llm.tone,
      });
      return {
        analysis: { ...merged.analysis, suggestedTemplate: llm.templateSlug, reason: llm.reason },
        params: merged.params,
        brain: "cli",
      };
    }
    return { ...heuristic, brain: "mock" };
  }

  // "api" mode lands with the real-chat chantier (Anthropic key, AI SDK).
  return { ...heuristic, brain: "mock" };
}
