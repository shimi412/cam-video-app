"use client";
import { useEffect, useState } from "react";

type SavedRequest = { fingerprint: string; operation: string; state: string; requestId: string | null; reconciled: boolean; canReconcile: boolean };
export function RequestRecovery({ jobId, onReady }: { jobId: string; onReady: (ready: boolean) => void }) {
  const [requests, setRequests] = useState<SavedRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { onReady(Boolean(requests && !error && !busy && requests.every((r) => r.state === "submitted" || r.state === "complete"))); }, [requests, error, busy, onReady]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/jobs/${jobId}/requests`).then(async (r) => { const data = await r.json(); if (!r.ok) throw new Error(data.error); return data; })
      .then((data) => { if (!cancelled) setRequests(data.requests); }).catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [jobId]);
  async function reconcile(fingerprint: string) {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/jobs/${jobId}/requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fingerprint }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error); setRequests(data.requests);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not recover this request."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Interrupted requests" className="rounded-lg border border-line p-4 space-y-3 text-sm">
    <h3 className="font-medium">Interrupted requests · offline simulation</h3>
    <p className="text-muted">A lost response can hide an accepted request. Check its saved receipt, then resume the preview. An uncertain or failed request keeps its budget reserved.</p>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {!requests && !error && <p role="status" className="text-muted">Checking saved requests…</p>}
    {requests?.length === 0 && <p className="text-muted">No saved provider requests. The interruption happened outside this queue.</p>}
    {requests && <p className="text-muted">{requests.filter((r) => r.state === "complete").length}/{requests.length} requests already complete. Completed work will be reused.</p>}
    <ul className="space-y-3">{requests?.filter((r) => r.state !== "complete").map((r) => <li key={r.fingerprint} className="bg-surface-2 p-3 rounded space-y-2">
      <p className="font-medium">{r.operation} · {r.state === "submitting" ? "Acceptance unknown" : r.state === "submitted" ? "Original request found · ready to resume" : "Failed · new attempt blocked"}</p>
      {r.requestId && <p className="text-xs text-muted break-all">Original ID: {r.requestId}</p>}
      {r.reconciled && <p className="text-accent">Original acceptance verified. Nothing resubmitted.</p>}
      {r.canReconcile && <button disabled={busy} onClick={() => void reconcile(r.fingerprint)} className="text-accent disabled:opacity-40">Check saved receipt for {r.operation}</button>}
      {r.state === "submitting" && !r.canReconcile && <p className="text-muted">This older request has no verifiable acceptance. Manual investigation required; automatic retries are blocked.</p>}
    </li>)}</ul>
    <p className="text-xs text-muted">Simulation records only. Paid recovery and paid generation remain disabled.</p>
  </section>;
}
