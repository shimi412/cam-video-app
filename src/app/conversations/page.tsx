"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, jsonBody } from "@/lib/client-http";
type Item = { id: string; title: string | null; createdAt: string };
export default function ConversationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]), [title, setTitle] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const attempt = useRef<{ title: string; id: string } | null>(null);
  useEffect(() => { const abort = new AbortController(); api<{items: Item[]}>("/api/conversations", { signal: abort.signal }).then((data) => setItems(data.items)).catch((e) => { if (!abort.signal.aborted) setError(e.message); }); return () => abort.abort(); }, []);
  async function create() {
    setBusy(true); setError("");
    try { if (attempt.current?.title !== title) attempt.current = { title, id: crypto.randomUUID() };
      const item = await api<Item>("/api/conversations", jsonBody(attempt.current)); router.push(`/conversations/${item.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create conversation."); setBusy(false); }
  }
  return <section className="space-y-6"><div><h1 className="text-2xl font-semibold">Conversations</h1><p className="text-muted mt-2">Keep the brief, reference documents and video versions together in one shared CAM conversation.</p></div>
    <form className="flex gap-3 flex-wrap" onSubmit={(e) => { e.preventDefault(); void create(); }}><input aria-label="Conversation title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required placeholder="Name this conversation" className="flex-1 min-w-48 bg-surface-2 border border-line rounded-lg p-3"/><button disabled={busy || !title.trim()} className="bg-accent text-white rounded-lg px-4 py-2 disabled:opacity-40">{busy ? "Creating…" : "New conversation"}</button></form>
    {error && <p role="alert" className="text-danger">{error}</p>}
    <ul className="space-y-3">{items.map((item) => <li key={item.id}><Link href={`/conversations/${item.id}`} className="block border border-line bg-surface rounded-xl p-4 hover:border-accent"><p className="font-medium">{item.title || "Untitled conversation"}</p><p className="text-muted text-xs mt-2">{new Date(item.createdAt).toLocaleDateString("en-GB", { timeZone: "Europe/Paris" })}</p></Link></li>)}</ul>
    {!items.length && !error && <p className="text-muted">Start a conversation to collect your brief and references.</p>}
  </section>;
}
