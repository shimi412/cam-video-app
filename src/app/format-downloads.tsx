"use client";
import { useCallback, useEffect, useState } from "react";
import type { FormatExports } from "@/lib/format-exports";

type View = { state: FormatExports | null; canStart: boolean };
const labels = { "9:16": "Vertical · 1080 × 1920", "1:1": "Square · 1080 × 1080", "16:9": "Landscape · 1920 × 1080" };
export function FormatDownloads({ jobId }: { jobId: string }) {
  const [view, setView] = useState<View | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/jobs/${jobId}/exports`, { signal }); const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load downloads.");
    if (!signal?.aborted) setView(data);
  }, [jobId]);
  const active = view?.state?.status === "queued" || view?.state?.status === "running";
  useEffect(() => {
    const controller = new AbortController();
    const update = () => void load(controller.signal).catch(() => { if (!controller.signal.aborted) setError("Could not refresh downloads. Reload this page to check the saved result."); });
    const start = setTimeout(update, 0), interval = active ? setInterval(update, 2500) : null;
    return () => { clearTimeout(start); if (interval) clearInterval(interval); controller.abort(); };
  }, [load, active]);
  return <section className="border border-line rounded-xl p-5 space-y-3">
    <h3 className="font-semibold">Download in three formats</h3>
    <p className="text-sm text-muted">Keep the same scenes, recording and timing. New films adapt their titles and captions to each format. Historical films keep the original picture with a background around it.</p>
    {(view?.canStart || !view) && <button disabled={busy || !view} onClick={async () => {
      setBusy(true); setError("");
      try {
        const response = await fetch(`/api/jobs/${jobId}/exports`, { method: "POST" }); const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not start exports.");
        await load();
      } catch (err) { setError(err instanceof Error ? err.message : "Could not start exports."); }
      finally { setBusy(false); }
    }} className="px-4 py-2 rounded-lg bg-accent text-white disabled:opacity-40">{busy ? "Preparing…" : view?.state?.status === "failed" ? "Continue free exports" : "Prepare three downloads · $0"}</button>}
    {active && <p role="status" className="text-sm">Preparing formats… {view?.state?.files.length ?? 0}/3 ready. You can return to this production later.</p>}
    {view?.state?.status === "failed" && <p role="alert" className="text-sm text-danger">{view.state.error}</p>}
    {view?.state?.status === "complete" && <div className="flex gap-3 flex-wrap">{view.state.files.map(file => <a key={file.aspect} href={file.url} download={`cam-${jobId}-${file.aspect.replace(":", "x")}.mp4`} className="rounded-lg border border-line px-4 py-3 text-sm text-accent">{labels[file.aspect]}</a>)}</div>}
    {view?.state?.status === "complete" && <p className="text-xs text-muted">Watch each format before publishing. The voice is the recording used for this film.</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </section>;
}
