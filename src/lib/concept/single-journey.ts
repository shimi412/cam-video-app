import type { CamQuote } from "../providers/cam-pricing";
import { firstVersionPriceCents, revisionPriceCents } from "../customer-price";

/** Shimi's product decision of 2026-10-23 for Clay: script, one estimate (delay and price), one approval, a
 * complete first version produced with no intermediate human validation, then whole-film feedback, a revision
 * quote, the next complete version, and so on until the client approves a version and downloads it. Films
 * created before carry `journey: "staged"` and keep their storyboard, budget, visual and finishing gates. */
export const SINGLE_JOURNEY = "single-v1" as const;
export type Journey = "staged" | typeof SINGLE_JOURNEY;

/** About 45 minutes for a typical 8-scene film (live Clay runs of 2026-10-22: storyboard in about ten minutes,
 * clips about four minutes each, finishing a few minutes), rounded to five minutes, never under fifteen. */
export function estimatedMinutes(sceneCount: number): number {
  if (!Number.isFinite(sceneCount) || sceneCount < 0) throw new Error("Invalid scene count.");
  return Math.max(15, Math.round((10 + 4.5 * sceneCount) / 5) * 5);
}

/** Estimated supplier cost of a quote in USD: fal dollars plus Higgsfield credits at the configured rate. */
export function supplierCostUsd(quote: Pick<CamQuote, "caps">, higgsfieldCreditUsd: number): number {
  if (!Number.isFinite(higgsfieldCreditUsd) || higgsfieldCreditUsd < 0) throw new Error("Invalid credit rate.");
  return quote.caps.usd / 1e6 + quote.caps["higgsfield-credit"] / 1e6 * higgsfieldCreditUsd;
}

/** First complete version: the grid applied to the whole estimated supplier cost (media plus AI allowances). */
export function firstVersionAmountCents(quote: Pick<CamQuote, "caps">, higgsfieldCreditUsd: number, allowanceUsd: number): number {
  return firstVersionPriceCents(supplierCostUsd(quote, higgsfieldCreditUsd) + allowanceUsd);
}

/** A revision is priced on its additional estimated supplier cost only (new media lines plus the feedback
 * allowance), cost x2 rounded up, on top of the amount already held for the previous versions. */
export function revisionAmountCents(previous: Pick<CamQuote, "caps">, next: Pick<CamQuote, "caps">, higgsfieldCreditUsd: number, allowanceUsd: number, heldCents: number): { additionalCents: number; amountCents: number; additionalSupplierUsd: number } {
  if (!Number.isSafeInteger(heldCents) || heldCents < 0) throw new Error("Invalid held amount.");
  const additionalSupplierUsd = Math.max(0, supplierCostUsd(next, higgsfieldCreditUsd) - supplierCostUsd(previous, higgsfieldCreditUsd)) + allowanceUsd;
  const additionalCents = revisionPriceCents(additionalSupplierUsd);
  return { additionalCents, amountCents: heldCents + additionalCents, additionalSupplierUsd };
}

/** Every spend of a version stays inside its approved price: an automatic replacement or rework is allowed only
 * while the estimated supplier cost of the whole version remains at or below the amount the client approved. */
export function withinApprovedPrice(quote: Pick<CamQuote, "caps">, higgsfieldCreditUsd: number, approvedCents: number): boolean {
  return supplierCostUsd(quote, higgsfieldCreditUsd) <= approvedCents / 100;
}
