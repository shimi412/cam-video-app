import { fal } from "@fal-ai/client";

export type ProviderHealth = { provider: string; ok: boolean; detail: string };

/** Explicit diagnostics only: no prompts, client files or inference requests. */
export async function checkAnthropic(model: string): Promise<ProviderHealth> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { provider: "anthropic", ok: false, detail: "API key missing" };
  try {
    const response = await fetch(`https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`, {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(15_000),
    });
    return { provider: "anthropic", ok: response.ok, detail: response.ok ? `Model accessible: ${model}. Generation not tested.` : `Model lookup returned HTTP ${response.status}` };
  } catch {
    return { provider: "anthropic", ok: false, detail: "Model lookup could not complete" };
  }
}

export async function checkFal(): Promise<ProviderHealth> {
  if (!process.env.FAL_KEY) return { provider: "fal", ok: false, detail: "API key missing" };
  try {
    fal.config({ credentials: process.env.FAL_KEY });
    await fal.storage.upload(new File(["x"], "credential-check.txt", { type: "text/plain" }));
    return { provider: "fal", ok: true, detail: "Storage authentication succeeded. Inference access and balance not tested." };
  } catch (error) {
    const failure = error as { status?: unknown; body?: { detail?: unknown } };
    const status = typeof failure.status === "number" ? ` (HTTP ${failure.status})` : "";
    const detail = typeof failure.body?.detail === "string" ? failure.body.detail.toLowerCase() : "";
    const creditRestriction = /balance|credit|funds/.test(detail) ? "; account credit restriction reported" : "";
    // Never echo provider response bodies or credentials into logs.
    return { provider: "fal", ok: false, detail: `Storage check failed${status}${creditRestriction}. Inference not tested.` };
  }
}

export async function checkRunway(): Promise<ProviderHealth> {
  const key = process.env.RUNWAYML_API_SECRET;
  if (!key) return { provider: "runway", ok: false, detail: "API key missing" };
  try {
    const response = await fetch("https://api.dev.runwayml.com/v1/organization", {
      headers: { Authorization: `Bearer ${key}`, "X-Runway-Version": "2024-11-06" },
      signal: AbortSignal.timeout(15_000),
    });
    return { provider: "runway", ok: response.ok, detail: response.ok ? "Organization accessible. Generation not tested." : `Organization lookup returned HTTP ${response.status}` };
  } catch {
    return { provider: "runway", ok: false, detail: "Organization lookup could not complete" };
  }
}
