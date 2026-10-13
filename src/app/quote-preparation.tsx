"use client";
import { useState } from "react";
import type { QuotePreparation } from "@/lib/concept/quote-preparation";
import type { ConceptPreparation } from "@/lib/concept/preparation";

const amount = (value: number | null) => value === null ? "" : (value / 1_000_000).toFixed(6).replace(/\.?0+$/, "");
const currency = (unit: string) => unit === "usd" ? "USD" : "Higgsfield credits";
export function QuotePreparationPanel({ quote, jobId, editable, disabled, onChange, onBusy }: {
  quote: QuotePreparation; jobId?: string; editable: boolean; disabled: boolean;
  onChange?: (prep: ConceptPreparation) => void; onBusy: (busy: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return <section aria-label="Quote preparation" className="border border-line rounded-lg p-3 text-sm space-y-3">
    <h4 className="font-medium">Quote preparation · free preview $0</h4>
    <p className="text-muted">Provider prices have not been requested. Enter planning estimates if available, then download the worksheet. Dollars and Higgsfield credits are kept separate.</p>
    {(quote.state === "stale" || quote.state === "expired") && <p role="status" className="text-accent">{quote.state === "stale" ? "The scenes or approvals changed. The previous estimate is out of date." : "The planning estimate is over 24 hours old. Review the amounts again."} Download the worksheet to retain the previous version.</p>}
    <p className="text-muted">{quote.missingPrices} prices missing · {quote.importedScenes.length} complete imported scenes reused. Animation durations stay provisional until the final Bram recording is synchronized.</p>
    <div className="flex flex-wrap gap-4">{quote.totals.map((total) => <div key={total.unit}>
      <p className="font-medium">{currency(total.unit)}: {total.total === null ? "Incomplete" : amount(total.total)}</p>
      {total.missing > 0 && <p className="text-xs text-muted">Entered subtotal: {amount(total.subtotal)} · {total.missing} missing</p>}
      {total.cap !== null && <p className={`text-xs ${total.overCap ? "text-danger" : "text-muted"}`}>Planning ceiling: {amount(total.cap)}{total.overCap ? " · exceeded" : ""}</p>}
    </div>)}</div>
    {quote.note && <p className="text-xs text-muted" dir="auto">Source or assumption: {quote.note}</p>}
    {error && <p role="alert" className="text-danger">{error}</p>}
    <details>
      <summary className="cursor-pointer text-accent">Review quantities and enter planning amounts</summary>
      <form key={quote.basis + (quote.savedAt ?? "")} className="space-y-3 mt-3" onSubmit={async (e) => {
        e.preventDefault(); const form = new FormData(e.currentTarget); setError(null); onBusy(true);
        try {
          const amounts = Object.fromEntries(quote.lines.filter((line) => !line.reuse).map((line) => [line.fingerprint, String(form.get(line.fingerprint) ?? "")]));
          const r = await fetch(`/api/jobs/${jobId}/quote`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ basis: quote.basis, amounts, caps: { usd: String(form.get("usdCap") ?? ""), "higgsfield-credit": String(form.get("creditCap") ?? "") }, note: String(form.get("note") ?? "") }) });
          const data = await r.json(); if (!r.ok) throw new Error(data.error); onChange?.(data.preparation);
        } catch (e) { setError(e instanceof Error ? e.message : "Could not save the worksheet."); }
        finally { onBusy(false); }
      }}>
        <fieldset disabled={!editable || disabled} className="space-y-3">
          {quote.lines.map((line) => <label key={line.id} className="block text-xs border-b border-line pb-2">
            <span>{line.label} · {line.reuse ? "approved local file reused · 0" : `${line.quantity} ${line.quantityUnit}${line.provisionalDuration ? " (provisional)" : ""}`}</span>
            {line.blocked && <span className="text-danger block">Scene exceeds the animation limit. Split it before requesting a quote.</span>}
            {!line.reuse && <><span className="block text-muted">Total for this step, in {currency(line.unit)}</span><input name={line.fingerprint} aria-label={`${line.label} estimate`} inputMode="decimal" pattern="(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,6})?" placeholder="Price missing" defaultValue={amount(line.amount)} className="block mt-1 w-full bg-surface border border-line rounded px-3 py-2" /></>}
          </label>)}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs">Planning ceiling · USD<input name="usdCap" aria-label="USD planning ceiling" inputMode="decimal" defaultValue={amount(quote.totals[0].cap)} className="block mt-1 w-full bg-surface border border-line rounded p-2" /></label>
            <label className="text-xs">Planning ceiling · Higgsfield credits<input name="creditCap" aria-label="Higgsfield planning ceiling" inputMode="decimal" defaultValue={amount(quote.totals[1].cap)} className="block mt-1 w-full bg-surface border border-line rounded p-2" /></label>
          </div>
          <label className="block text-xs">Source or assumption (required for entered prices)<textarea name="note" aria-label="Estimate source or assumption" maxLength={1000} defaultValue={quote.note} className="block mt-1 w-full bg-surface border border-line rounded p-2" /></label>
          {editable && <button type="submit" className="rounded bg-accent text-white px-3 py-2 disabled:opacity-40">Save planning estimate</button>}
        </fieldset>
      </form>
    </details>
    <a href={quote.downloadUrl} download="cam-quote-preparation.json" className="inline-block text-accent">Download quote worksheet</a>
    <p className="text-xs text-muted">Saving this worksheet does not reserve a budget or authorize spending. A complete provider quote and explicit approval are still required. Paid generation remains disabled.</p>
  </section>;
}
