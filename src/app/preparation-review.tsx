"use client";

import { useEffect, useState } from "react";
import type { ConceptPreparation } from "@/lib/concept/preparation";
import type { PreviewVoice } from "@/lib/concept/preview-inputs";

export function PreparationReview({ preparation, jobId, disabled, onChange, onBusy }: {
  preparation: ConceptPreparation; jobId?: string; disabled?: boolean;
  onChange?: (preparation: ConceptPreparation) => void; onBusy?: (busy: boolean) => void;
}) {
  const [options, setOptions] = useState<{ imports: boolean; voices: { id: PreviewVoice; label: string }[] }>({ imports: false, voices: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (jobId) fetch("/api/preview-options").then((r) => r.json()).then(setOptions).catch(() => setError("Preview options could not load. Reload to try again."));
  }, [jobId]);
  const editable = Boolean(jobId && options.imports && onChange);
  async function save(body: FormData | { previewVoice: string } | { removeScene: number }) {
    setBusy(true); onBusy?.(true); setError(null);
    try {
      const isUpload = body instanceof FormData;
      const response = await fetch(`/api/jobs/${jobId}/preparation`, { method: isUpload ? "POST" : "PATCH", headers: isUpload ? undefined : { "Content-Type": "application/json" }, body: isUpload ? body : JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save this scene.");
      onChange?.(data.preparation);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save this scene."); }
    finally { setBusy(false); onBusy?.(false); }
  }
  return <section aria-label="Script preparation" className="bg-surface-2 border border-line rounded-xl p-4 space-y-4">
    <div>
      <h3 className="font-medium">Your scenes and voice</h3>
      <p className="text-sm text-muted mt-1">{preparation.shots.length} scenes · {preparation.measuredScenes ? "" : "about "}{preparation.durationSeconds.toFixed(1)} seconds, including pauses. {preparation.measuredScenes ? "Scene lengths follow the recorded voice. Subtitle word positions are approximate." : "Timing will follow the narration."}</p>
    </div>
    <div className="border border-line rounded-lg p-3 text-sm space-y-2">
      <p className="font-medium">{preparation.voice.preview === "silent" ? "Preview voice" : `Test voice · ${preparation.voice.name}`}</p>
      {editable && <label className="block">Choose preview audio
        <select aria-label="Preview audio" value={preparation.voice.preview} disabled={busy || disabled} onChange={(e) => void save({ previewVoice: e.target.value })} className="block w-full mt-1 rounded-lg bg-surface border border-line px-3 py-2">
          <option value="silent">Silent · no voice</option>
          {options.voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.label} · $0</option>)}
        </select>
      </label>}
      <p className="text-muted">{preparation.voice.message}</p>
    </div>
    <div className="flex flex-wrap gap-4">
      {preparation.references.filter((reference) => reference.id !== "logo").map((reference) => <div key={reference.id} className="text-xs text-muted text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={reference.url} alt={`CAM ${reference.id} reference`} className="w-16 h-20 object-contain rounded-lg mb-1 bg-surface" />
        <span className="capitalize">{reference.id}</span>
      </div>)}
    </div>
    <p className="text-sm text-muted">Add an image or clip to each scene. Empty scenes use a visible placeholder. Images keep their framing; short clips hold their final frame. Clip audio is removed so the narration stays clear.</p>
    {busy && <p role="status" className="text-sm text-accent">Saving locally…</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <details open={editable}>
      <summary className="text-sm text-accent cursor-pointer">{editable ? "Prepare scenes" : "Review scenes"} · {preparation.shots.filter((s) => s.media).length}/{preparation.shots.length} visuals added</summary>
      <ol className="mt-3 space-y-3 max-h-[38rem] overflow-y-auto">
        {preparation.shots.map((shot) => <li key={shot.index} className="border border-line rounded-lg p-3 text-sm space-y-2">
          <p className="text-muted">Scene {shot.index} · {shot.start.toFixed(1)}–{shot.end.toFixed(1)} s</p>
          <p dir="auto">{shot.narration}</p>
          {shot.editorialStatus === "example-plan" && <p className="text-xs text-muted">{shot.scene}</p>}
          {shot.media ? <div className="space-y-2">
            {shot.media.kind === "video" ? <video src={shot.media.url} controls muted className="max-h-40 max-w-full rounded bg-black" /> :
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shot.media.url} alt={`Imported visual for scene ${shot.index}`} className="max-h-40 max-w-full rounded object-contain" />}
            <p className="text-xs text-muted">Imported {shot.media.kind}{shot.media.duration ? ` · ${shot.media.duration.toFixed(1)} s` : ""}</p>
            {editable && <button disabled={busy || disabled} onClick={() => void save({ removeScene: shot.index })} className="text-xs text-accent disabled:opacity-40">Remove visual from scene {shot.index}</button>}
          </div> : <p className="text-xs text-muted">Visual to prepare · {shot.references.join(", ")}</p>}
          {editable && <label className="block text-xs text-muted">{shot.media ? "Replace visual" : "Add visual"} · PNG, JPEG, WebP or MP4 · max. 32 MB
            <input type="file" aria-label={`Visual for scene ${shot.index}`} accept="image/png,image/jpeg,image/webp,video/mp4" disabled={busy || disabled} className="block mt-2 max-w-full text-xs file:mr-3 file:rounded file:border-0 file:bg-accent file:text-white file:px-3 file:py-2 disabled:opacity-40" onChange={(event) => {
              const file = event.target.files?.[0]; event.target.value = "";
              if (!file) return;
              if (file.size > 32 * 1024 * 1024) { setError("Choose a file smaller than 32 MB."); return; }
              const form = new FormData(); form.set("scene", String(shot.index)); form.set("file", file); void save(form);
            }} />
          </label>}
        </li>)}
      </ol>
    </details>
  </section>;
}
