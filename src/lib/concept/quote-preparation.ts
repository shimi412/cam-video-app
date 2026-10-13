import { z } from "zod";
import { Hash, sha256 } from "./checkpoints";
import type { generationPlan } from "./generation-plan";
import type { WorkflowView } from "./scene-workflow";
import type { ProductionParams } from "../brain";

const Amount = z.number().int().nonnegative().max(1_000_000_000_000);
export const QuoteDraftSchema = z.object({
  basis: Hash, amounts: z.record(Hash, Amount), caps: z.object({ usd: Amount.nullable(), "higgsfield-credit": Amount.nullable() }),
  note: z.string().trim().max(1000), savedAt: z.iso.datetime(), expiresAt: z.number().int().positive(),
  source: z.literal("manual-planning-estimate"),
}).strict();
export type QuoteDraft = z.infer<typeof QuoteDraftSchema>;
export const DecimalAmount = z.string().trim().max(20).refine((s) => s === "" || /^(?:0|[1-9]\d{0,6})(?:\.\d{1,6})?$/.test(s), "Use a positive amount with at most six decimals.");
export function microAmount(text: string): number | null {
  const clean = DecimalAmount.parse(text);
  if (!clean) return null;
  const [whole, fraction = ""] = clean.split(".");
  return Amount.parse(Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0")));
}
export function decimalAmount(value: number | null) {
  return value === null ? "" : `${Math.floor(value / 1_000_000)}.${String(value % 1_000_000).padStart(6, "0")}`.replace(/\.?0+$/, "");
}

/** A worksheet for requesting quotes. Manual numbers are never provider
 * evidence, budget approvals, customer prices, or authorization to submit. */
export function prepareQuote(jobId: string, plan: ReturnType<typeof generationPlan>, workflows: WorkflowView[], params: ProductionParams, now = Date.now()) {
  const rows = plan.operations.map((op) => {
    const stage = op.kind === "video" ? "clip" : op.kind === "image" ? op.id.endsWith("-end") ? "end" : "start" : null;
    const step = workflows.find((w) => w.scene === op.scene)?.stages.find((s) => s.stage === stage);
    const reuse = step?.status === "approved";
    const unit = op.transport === "higgsfield-mcp" ? "higgsfield-credit" as const : "usd" as const;
    const label = op.kind === "voice" ? "Bram reading" : op.kind === "alignment" ? "Word timing" : `Scene ${op.scene} · ${stage === "start" ? "start image" : stage === "end" ? "end image" : "animation"}`;
    const fingerprint = sha256(JSON.stringify({ operation: op, step: step ? { target: step.target, parent: step.uploadTarget, status: step.status, media: step.media?.sha256, token: step.token } : null, voiceEvidence: plan.voiceEvidence }));
    return { id: op.id, fingerprint, operationFingerprint: op.fingerprint, scene: op.scene, label, model: op.model,
      unit, quantity: reuse ? 0 : op.kind === "video" ? Number(op.input.duration) : 1,
      quantityUnit: op.kind === "video" ? "seconds" : op.kind === "voice" ? "reading" : op.kind === "alignment" ? "transcription" : "image",
      reuse: Boolean(reuse), provisionalDuration: op.kind === "video" && plan.timingBasis !== "reviewed-voice-alignment",
      blocked: op.gates.includes("split-scene"), requires: op.gates, bindings: op.bindings, input: op.input };
  });
  const basis = sha256(JSON.stringify({ version: 1, jobId, plan: plan.fingerprint, voice: plan.voice,
    rows, workflows, importedMedia: params.sceneMedia ?? {}, importedReviews: params.sceneReviews ?? {} }));
  const stored = params.quoteDraft ? QuoteDraftSchema.parse(params.quoteDraft) : null;
  const state = !stored ? "unsaved" : stored.basis !== basis ? "stale" : stored.expiresAt <= now ? "expired" : "current";
  const current = state === "current" ? stored : null;
  const lines = rows.map((row) => ({ ...row, amount: row.reuse ? 0 : current?.amounts[row.fingerprint] ?? null }));
  const totals = (["usd", "higgsfield-credit"] as const).map((unit) => {
    const items = lines.filter((line) => line.unit === unit), missing = items.filter((line) => line.amount === null).length;
    const subtotal = items.reduce((sum, line) => sum + (line.amount ?? 0), 0);
    if (!Number.isSafeInteger(subtotal)) throw new Error("Quote total overflow.");
    const cap = current?.caps[unit] ?? null;
    return { unit, subtotal, total: missing ? null : subtotal, missing, cap, overCap: cap !== null && subtotal > cap };
  });
  return { version: 1, basis, state, source: "planning-only", providerQuoteComplete: false, paidGenerationAuthorized: false, canReserve: false,
    previewCostUsd: 0, note: current?.note ?? "", savedAt: stored?.savedAt ?? null, expiresAt: stored?.expiresAt ?? null,
    previousEstimate: state === "stale" || state === "expired" ? stored : null,
    lines, totals, importedScenes: plan.reusedScenes,
    missingPrices: lines.filter((line) => line.amount === null).length,
    downloadUrl: `/api/jobs/${jobId}/quote` as string,
    blockers: ["Provider quotes and evidence still required", "Paid generation disabled", "A new Bram reading and final synchronization still require review",
      ...(rows.some((r) => r.provisionalDuration) ? ["Animation durations are provisional until Bram is recorded and aligned"] : []),
      ...(totals.some((t) => t.overCap) ? ["Entered estimates exceed a planning ceiling"] : [])],
  } as const;
}
export type QuotePreparation = ReturnType<typeof prepareQuote>;

export function saveQuoteDraft(quote: QuotePreparation, input: { basis: string; amounts: Record<string, string>; caps: { usd: string; "higgsfield-credit": string }; note: string }, now = Date.now()): QuoteDraft {
  if (input.basis !== quote.basis) throw new Error("This scene plan changed. Reload the worksheet before saving.");
  const amounts: Record<string, number> = {};
  for (const [key, text] of Object.entries(input.amounts)) {
    const line = quote.lines.find((line) => line.fingerprint === key && !line.reuse);
    if (!line) throw new Error("The estimate contains an unknown or reused step.");
    const value = microAmount(text); if (value !== null) amounts[key] = value;
  }
  if (Object.keys(amounts).length && !input.note.trim()) throw new Error("Add the source or assumption behind these planning estimates.");
  return QuoteDraftSchema.parse({ basis: quote.basis, amounts,
    caps: { usd: microAmount(input.caps.usd), "higgsfield-credit": microAmount(input.caps["higgsfield-credit"]) },
    note: input.note, savedAt: new Date(now).toISOString(), expiresAt: now + 86400_000, source: "manual-planning-estimate" });
}
