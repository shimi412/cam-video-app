/* eslint-disable @next/next/no-img-element -- Local authenticated media, no image optimization service. */
"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Item = { id: string; status: string; title: string; createdAt: string; aspectRatio: string; duration: number | null; voice: string; billedUsd: number|null; live:boolean; url: string; outputUrl: string | null };
const STATUS: Record<string, string> = { estimated: "Draft", confirmed: "Queued", running: "In progress", succeeded: "Completed", failed: "Needs attention" };
export default function ProductionsPage() {
  const [search, setSearch] = useState(""), [query, setQuery] = useState(""), [status, setStatus] = useState("all");
  const [items, setItems] = useState<Item[]>([]), [cursor, setCursor] = useState<string | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState<string | null>(null);
  const load = useCallback(async (next?: string, signal?: AbortSignal) => {
    setBusy(true); setError(null);
    try {
      const params = new URLSearchParams({ q: query, status }); if (next) params.set("cursor", next);
      const response = await fetch(`/api/jobs?${params}`, { signal }); const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load productions.");
      if (signal?.aborted) return;
      setItems((old) => next ? [...old, ...result.items.filter((item: Item) => !old.some((previous) => previous.id === item.id))] : result.items); setCursor(result.nextCursor);
    } catch (error) { if (!signal?.aborted) setError(error instanceof Error ? error.message : "Could not load productions."); }
    finally { if (!signal?.aborted) setBusy(false); }
  }, [query, status]);
  useEffect(() => { const controller = new AbortController(); const start = setTimeout(() => void load(undefined, controller.signal), 0); return () => { clearTimeout(start); controller.abort(); }; }, [load]);
  return <section className="space-y-6">
    <div className="flex justify-between gap-4 flex-wrap"><div><h1 className="text-2xl font-semibold">My videos</h1><p className="text-muted mt-2">Your stories, from the first idea to the final film.</p></div><Link href="/?new=1" className="text-accent">Create video</Link></div>
    <form className="flex gap-3 flex-wrap" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); }}>
      <input aria-label="Search productions" placeholder="Find a video" value={search} maxLength={120} onChange={(e) => setSearch(e.target.value)} className="rounded-lg bg-surface-2 border border-line p-2 flex-1 min-w-48" />
      <select aria-label="Production status" value={status} disabled={busy} onChange={(e) => setStatus(e.target.value)} className="rounded-lg bg-surface-2 border border-line p-2"><option value="all">All statuses</option>{Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <button disabled={busy} className="rounded-lg bg-accent text-white px-4 py-2 disabled:opacity-40">Search</button>
      <button type="button" disabled={busy} onClick={() => void load()} className="text-accent disabled:opacity-40">Refresh</button>
    </form>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {busy && <p role="status">Loading productions…</p>}
    {!busy && !error && !items.length && <p className="text-muted">No productions match this search.</p>}
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <li key={item.id} className="border border-line bg-surface rounded-2xl p-4 space-y-3 shadow-sm">
      <a href={item.url} aria-label={`Open ${item.title}`} className="block aspect-video bg-surface-2 rounded-xl overflow-hidden"><img src={`/api/jobs/${item.id}/thumbnail`} alt="" className="w-full h-full object-cover" /></a><div className="flex justify-between gap-4 text-xs text-muted"><span>{STATUS[item.status] ?? item.status} · {item.aspectRatio}{item.duration ? ` · ${item.duration.toFixed(1)} s` : ""}</span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("en-GB", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" })} Paris</time></div>
      <form className="flex gap-2" onSubmit={async e=>{e.preventDefault();const title=String(new FormData(e.currentTarget).get("title")||"").trim();const response=await fetch(`/api/jobs/${item.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({title})});if(!response.ok){setError("Could not save the title.");return;}setItems(old=>old.map(x=>x.id===item.id?{...x,title}:x));}}><input key={item.title} name="title" aria-label="Video title" defaultValue={item.title} required maxLength={80} className="min-w-0 flex-1 font-semibold bg-transparent rounded px-1"/><button className="text-xs text-accent">Save title</button></form>
      <div className="flex gap-4 text-sm"><a href={item.url} className="text-accent">{item.status === "estimated" ? "Continue draft" : item.status === "succeeded" ? "Open result and files" : "Open production"}</a>{item.outputUrl && <a href={item.outputUrl} download={`cam-film-${item.id}.mp4`} className="text-accent">Download video</a>}</div>
    </li>)}</ul>
    {cursor && <button disabled={busy} onClick={() => void load(cursor)} className="text-accent disabled:opacity-40">Load older productions</button>}
  </section>;
}
