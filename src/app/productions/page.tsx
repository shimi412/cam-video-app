/* eslint-disable @next/next/no-img-element -- Local authenticated media, no image optimization service. */
"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Toast } from "@/components/toast";

type Item = { id: string; status: string; stage: "draft"|"finished"|"downloaded"; title: string; createdAt: string; aspectRatio: string; duration: number | null; voice: string; billedUsd: number|null; live:boolean; url: string; outputUrl: string | null };
const STATUS: Record<string, string> = { draft: "Draft", finished: "Finished", downloaded: "Downloaded" };
export default function ProductionsPage() {
  const [search, setSearch] = useState(""), [query, setQuery] = useState(""), [status, setStatus] = useState("all");
  const [items, setItems] = useState<Item[]>([]), [cursor, setCursor] = useState<string | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState<string | null>(null), [toast, setToast] = useState<string | null>(null);
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
    <div className="flex justify-between gap-4 flex-wrap"><div><p className="kicker">Your videos</p><h1 className="page-title">My videos</h1><p className="text-muted mt-2">The videos you chose to save.</p></div><Link href="/?new=1" className="btn btn-primary self-start">Create video</Link></div>
    <form className="flex gap-3 flex-wrap" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); }}>
      <input aria-label="Search productions" placeholder="Find a video" value={search} maxLength={120} onChange={(e) => setSearch(e.target.value)} className="input flex-1 min-w-48" />
      <select aria-label="Production status" value={status} disabled={busy} onChange={(e) => setStatus(e.target.value)} className="input w-auto"><option value="all">All statuses</option>{Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <button disabled={busy} className="btn btn-primary">Search</button>
      <button type="button" disabled={busy} onClick={() => void load()} className="btn btn-ghost">Refresh</button>
    </form>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {busy && <p role="status" className="sr-only">Loading productions…</p>}
    {busy && !items.length && <ul aria-hidden="true" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <li key={i} className="card space-y-3"><div className="skel aspect-video h-auto m-0 rounded-xl" /><div className="skel w-3/5" /><div className="skel" /><div className="skel w-2/5" /></li>)}</ul>}
    {!busy && !error && !items.length && <p className="text-muted">{query || status !== "all" ? "No saved videos match this search." : "No saved videos yet. Click Save to My videos on a production to keep it here."}</p>}
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <li key={item.id} className="card space-y-3 appear">
      <a href={item.url} aria-label={`Open ${item.title}`} className="block aspect-video bg-surface-2 rounded-xl overflow-hidden"><img src={`/api/jobs/${item.id}/thumbnail`} alt="" className="w-full h-full object-cover" /></a><div className="flex justify-between gap-4 text-xs text-muted"><span>{STATUS[item.stage] ?? item.status} · {item.aspectRatio}{item.duration ? ` · ${item.duration.toFixed(1)} s` : ""}</span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("en-GB", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" })} Paris</time></div>
      <form className="flex gap-2" onSubmit={async e=>{e.preventDefault();const title=String(new FormData(e.currentTarget).get("title")||"").trim();const response=await fetch(`/api/jobs/${item.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({title})});if(!response.ok){setError("Could not save the title.");return;}setItems(old=>old.map(x=>x.id===item.id?{...x,title}:x));}}><input key={item.title} name="title" aria-label="Video title" defaultValue={item.title} required maxLength={80} className="min-w-0 flex-1 font-semibold bg-transparent rounded px-1"/><button className="btn btn-ghost btn-sm">Save title</button></form>
      <div className="flex gap-3 text-sm flex-wrap items-center"><button type="button" className="btn btn-ghost btn-sm" onClick={async()=>{try{const response=await fetch(`/api/jobs/${item.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({savedToLibrary:false})});if(!response.ok)throw new Error();setItems(old=>old.filter(video=>video.id!==item.id));setToast("Removed");}catch{setError("Could not remove this video. Please try again.");}}}>Remove</button><a href={item.url} className="btn btn-secondary btn-sm">{item.status === "estimated" ? "Continue draft" : item.status === "succeeded" ? "Open result and files" : "Open production"}</a>{item.outputUrl && <a href={item.outputUrl} download={`cam-film-${item.id}.mp4`} className="btn btn-primary btn-sm">Download video</a>}</div>
    </li>)}</ul>
    {cursor && <button disabled={busy} onClick={() => void load(cursor)} className="btn btn-secondary">Load older productions</button>}
    <Toast message={toast} onHide={() => setToast(null)} />
  </section>;
}
