"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, jsonBody } from "@/lib/client-http";
type Brief = { id: string; position: number; title: string; angle: string; script: string; conversationId: string | null };
type View = { campaign: { title: string; topic: string; audience: string; objective: string }; briefs: Brief[] };
function BriefCard({ brief, campaignId }: { brief: Brief; campaignId: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ title: brief.title, angle: brief.angle, script: brief.script }), [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [error, setError] = useState("");
  async function save(open = false) { setBusy(true); setNotice(""); setError(""); try { const path = `/api/campaigns/${campaignId}/briefs/${brief.id}`; await api(path, { ...jsonBody(form), method: "PATCH" }); if (open) { const result = await api<{ url: string }>(path, { method: "POST" }); router.push(result.url); } else setNotice("Brief saved."); } catch (e) { setError(e instanceof Error ? e.message : "Could not save brief."); } finally { setBusy(false); } }
  return <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="border border-line bg-surface rounded-xl p-5 space-y-3"><p className="text-accent text-xs">BRIEF {brief.position} OF 3</p><label className="block text-sm">Title<input required minLength={3} maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input mt-2"/></label><label className="block text-sm">Angle and evidence<textarea required minLength={10} maxLength={6000} rows={5} value={form.angle} onChange={(e) => setForm({ ...form, angle: e.target.value })} className="input mt-2"/></label><label className="block text-sm">Narration draft<textarea maxLength={6000} rows={6} value={form.script} onChange={(e) => setForm({ ...form, script: e.target.value })} placeholder="Write the exact words the narrator will read…" className="input mt-2"/></label><p className="text-xs text-muted">Changes update this brief. Existing production scripts keep their original version.</p>{error && <p role="alert" className="text-danger text-sm">{error}</p>}{notice && <p role="status" className="text-success text-sm">{notice}</p>}<div className="flex gap-4 text-sm flex-wrap"><button disabled={busy} className="btn btn-secondary btn-sm">Save brief</button><button type="button" disabled={busy} onClick={() => void save(true)} className="btn btn-primary btn-sm">{brief.conversationId ? "Open conversation" : "Start conversation"}</button></div></form>;
}
export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params), [data, setData] = useState<View | null>(null), [error, setError] = useState("");
  useEffect(() => { const abort = new AbortController(); api<View>(`/api/campaigns/${id}`, { signal: abort.signal }).then(setData).catch((e) => { if (!abort.signal.aborted) setError(e.message); }); return () => abort.abort(); }, [id]);
  if (!data) return <p role={error ? "alert" : "status"}>{error || "Loading campaign…"}</p>;
  return <section className="space-y-6"><div><Link href="/campaigns" className="text-accent text-sm">All campaigns</Link><h1 className="text-2xl font-semibold mt-2">{data.campaign.title}</h1><p className="text-muted mt-2">{data.campaign.audience} · {data.campaign.objective}</p><p className="text-sm mt-3 whitespace-pre-wrap">{data.campaign.topic}</p></div><div className="grid gap-4 lg:grid-cols-3">{data.briefs.map((brief) => <BriefCard key={brief.id} brief={brief} campaignId={id}/>)}</div></section>;
}
