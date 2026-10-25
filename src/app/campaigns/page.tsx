"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, jsonBody } from "@/lib/client-http";
type Campaign = { id: string; title: string; audience: string; objective: string };
export default function CampaignsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Campaign[]>([]), [form, setForm] = useState({ title: "", topic: "", audience: "", objective: "" }), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const attempt = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => { const abort = new AbortController(); api<{items: Campaign[]}>("/api/campaigns", { signal: abort.signal }).then((data) => setItems(data.items)).catch((e) => { if (!abort.signal.aborted) setError(e.message); }); return () => abort.abort(); }, []);
  async function create() { setBusy(true); setError(""); try { const key = JSON.stringify(form); if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() }; const result = await api<Campaign>("/api/campaigns", jsonBody({ ...form, id: attempt.current.id })); router.push(`/campaigns/${result.id}`); } catch (e) { setError(e instanceof Error ? e.message : "Campaign could not be saved."); setBusy(false); } }
  return <section className="space-y-6"><div><h1 className="text-2xl font-semibold">Campaigns</h1><p className="text-muted mt-2">Turn a topic into three editable video briefs, then track each production in its conversation.</p></div>{error && <p role="alert" className="text-danger">{error}</p>}
    <form onSubmit={(e) => { e.preventDefault(); void create(); }} className="card space-y-4"><h2 className="section-title">New campaign</h2>{([ ["title", "Campaign title", 160], ["topic", "Topic and available evidence", 2000], ["audience", "Audience", 300], ["objective", "Objective / call to action", 500] ] as const).map(([key, label, max]) => <label className="block text-sm" key={key}>{label}<textarea rows={key === "topic" ? 3 : 1} required minLength={key === "topic" ? 10 : 3} maxLength={max} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="input mt-2"/></label>)}<p className="text-xs text-muted">Creates three editorial outlines locally. Add and verify the evidence, then write the narration before producing a video.</p><button disabled={busy} className="btn btn-primary">{busy ? "Preparing…" : "Prepare 3 briefs · $0"}</button></form>
    <ul className="grid gap-3 sm:grid-cols-2">{items.map((item) => <li key={item.id}><Link href={`/campaigns/${item.id}`} className="card card-interactive block space-y-2"><h2 className="font-medium">{item.title}</h2><p className="text-sm text-muted">{item.audience}</p><p className="text-sm">{item.objective}</p></Link></li>)}</ul>
  </section>;
}
