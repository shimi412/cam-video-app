"use client";

import { useEffect, useState } from "react";
import type { ConceptPreparation } from "@/lib/concept/preparation";
import type { PreviewVoice } from "@/lib/concept/preview-inputs";
import type { SceneDirection } from "@/lib/concept/types";

export function PreparationReview({ preparation, jobId, disabled, onChange, onBusy }: {
  preparation: ConceptPreparation; jobId?: string; disabled?: boolean;
  onChange?: (preparation: ConceptPreparation) => void; onBusy?: (busy: boolean) => void;
}) {
  const [options, setOptions] = useState<{ imports: boolean; voices: { id: PreviewVoice; label: string }[] }>({ imports: false, voices: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  useEffect(() => { onBusy?.(busy || editing !== null); }, [busy, editing, onBusy]);
  useEffect(() => {
    if (jobId) fetch("/api/preview-options").then((r) => r.json()).then(setOptions).catch(() => setError("Preview options could not load. Reload to try again."));
  }, [jobId]);
  const editable = Boolean(jobId && options.imports && onChange);
  async function save(body: FormData | { previewVoice: string } | { removeScene: number } | { scene: number; direction: SceneDirection } | { resetDirection: number }) {
    setBusy(true); setError(null);
    try {
      const isUpload = body instanceof FormData;
      const response = await fetch(`/api/jobs/${jobId}/preparation`, { method: isUpload ? "POST" : "PATCH", headers: isUpload ? undefined : { "Content-Type": "application/json" }, body: isUpload ? body : JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save this scene.");
      onChange?.(data.preparation);
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save this scene."); return false; }
    finally { setBusy(false); }
  }
  return <section aria-label="Script preparation" className="bg-surface-2 border border-line rounded-xl p-4 space-y-4">
    <div>
      <h3 className="font-medium">Your scenes and voice</h3>
      <p className="text-sm text-muted mt-1">{preparation.shots.length} scenes · {preparation.measuredScenes ? "" : "about "}{preparation.durationSeconds.toFixed(1)} seconds, including pauses. {preparation.measuredScenes ? "Scene lengths follow the recorded voice. Subtitle word positions are approximate." : "Timing will follow the narration."}</p>
    </div>
    {preparation.voice.cam && <div className="border border-line rounded-lg p-3 text-sm space-y-2">
      <p className="font-medium">CAM voice · {preparation.voice.cam.name} identified</p>
      <p className="text-muted">{preparation.voice.cam.referenceKind === "provider-sample" ? `${preparation.voice.cam.name} is the target voice for new CAM videos. Listen to the provider’s existing sample. No reading of your script has been generated.` : `This saved preparation used ${preparation.voice.cam.name}. Listen to its original CAM reference recording.`}</p>
      {preparation.voice.cam.referenceUrl ? <audio aria-label={`${preparation.voice.cam.name} ${preparation.voice.cam.referenceKind === "provider-sample" ? "provider sample" : "CAM reference"}`} controls preload="none" src={preparation.voice.cam.referenceUrl} className="w-full" /> : <p className="text-muted">The voice sample is unavailable.</p>}
    </div>}
    <div className="border border-line rounded-lg p-3 text-sm space-y-2">
      <p className="font-medium">{preparation.voice.preview === "silent" ? "Preview voice" : `Test voice · ${preparation.voice.name}`}</p>
      {editable && <label className="block">Choose preview audio
        <select aria-label="Preview audio" value={preparation.voice.preview} disabled={busy || disabled || editing !== null} onChange={(e) => void save({ previewVoice: e.target.value })} className="block w-full mt-1 rounded-lg bg-surface border border-line px-3 py-2">
          <option value="silent">Silent · no voice</option>
          {options.voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.label} · $0</option>)}
        </select>
      </label>}
      <p className="text-muted">{preparation.voice.message}</p>
    </div>
    {preparation.generation && <div className="border border-line rounded-lg p-3 text-sm space-y-2">
      <p className="font-medium">Automatic generation prepared</p>
      <p className="text-muted">{preparation.generation.images} images · {preparation.generation.clips} clips · 1 {preparation.voice.cam?.name ?? "CAM"} reading{preparation.generation.reusedScenes > 0 ? ` · ${preparation.generation.reusedScenes} imported scenes kept` : ""}. Requests are prepared locally. Nothing has been sent or charged.</p>
      <p className="text-muted">Review the proposed scenes below. Paid generation remains disabled while the voice, images and budget need approval.</p>
      {preparation.generation.downloadUrl && <a href={preparation.generation.downloadUrl} download="cam-generation-plan.json" className="text-accent">Download generation plan</a>}
    </div>}
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
          <div className="bg-surface rounded p-3 space-y-2">
            <p className="text-xs text-accent">{shot.editorialStatus === "example-plan" ? "CAM example direction" : shot.editorialStatus === "edited-draft" ? "Your direction · review before generation" : "Automatic suggestion · review before generation"}</p>
            <p className="text-sm">{shot.scene}</p>
            <p className="text-xs text-muted">{shot.motion}</p>
            {shot.endScene && <p className="text-xs text-muted">End frame: {shot.endScene}</p>}
            {shot.overlay && <p className="text-xs text-muted" dir="auto">Title: {shot.overlay}</p>}
          </div>
          {editable && editing !== shot.index && <button disabled={busy || disabled || editing !== null} onClick={() => setEditing(shot.index)} className="text-accent text-xs disabled:opacity-40">Edit scene {shot.index}</button>}
          {editable && editing === shot.index && <form className="space-y-3" onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const ok = await save({ scene: shot.index, direction: {
              scene: String(data.get("scene")), motion: String(data.get("motion")),
              references: data.getAll("references") as SceneDirection["references"],
              endScene: String(data.get("endScene")).trim() || null,
              overlay: String(data.get("overlay")).trim() || null, strike: data.get("strike") === "on",
            } });
            if (ok) setEditing(null);
          }}>
            <fieldset disabled={busy} className="space-y-3">
              <label className="block text-xs">Scene description<textarea name="scene" aria-label={`Scene ${shot.index} description`} required maxLength={3000} defaultValue={shot.scene} className="block mt-1 w-full rounded bg-surface border border-line p-2 min-h-24" /></label>
              <label className="block text-xs">Movement<textarea name="motion" aria-label={`Scene ${shot.index} movement`} required maxLength={2000} defaultValue={shot.motion} className="block mt-1 w-full rounded bg-surface border border-line p-2 min-h-20" /></label>
              <fieldset className="text-xs flex flex-wrap gap-3"><legend className="mb-1">Characters and objects to keep</legend>{(["narrator", "monster", "effigy"] as const).map((ref) => <label key={ref}><input type="checkbox" name="references" value={ref} defaultChecked={shot.references.includes(ref)} className="mr-1" />{ref}</label>)}</fieldset>
              <label className="block text-xs">End frame, if the object changes<textarea name="endScene" maxLength={3000} defaultValue={shot.endScene ?? ""} className="block mt-1 w-full rounded bg-surface border border-line p-2" /></label>
              <label className="block text-xs">Title added during editing<input name="overlay" maxLength={100} defaultValue={shot.overlay ?? ""} className="block mt-1 w-full rounded bg-surface border border-line p-2" /></label>
              <label className="block text-xs"><input type="checkbox" name="strike" defaultChecked={shot.strike} className="mr-1" />Cross out this title</label>
              <div className="flex gap-4 text-xs">
                <button disabled={busy} type="submit" className="rounded bg-accent text-white px-3 py-2 disabled:opacity-40">Save direction</button>
                <button disabled={busy} type="button" onClick={() => setEditing(null)}>Cancel edit</button>
                {shot.editorialStatus === "edited-draft" && <button disabled={busy} type="button" onClick={async () => { if (await save({ resetDirection: shot.index })) setEditing(null); }} className="text-accent">Restore suggestion</button>}
              </div>
            </fieldset>
          </form>}
          {shot.media ? <div className="space-y-2">
            {shot.media.kind === "video" ? <video src={shot.media.url} controls muted className="max-h-40 max-w-full rounded bg-black" /> :
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shot.media.url} alt={`Imported visual for scene ${shot.index}`} className="max-h-40 max-w-full rounded object-contain" />}
            <p className="text-xs text-muted">Imported {shot.media.kind}{shot.media.duration ? ` · ${shot.media.duration.toFixed(1)} s` : ""}</p>
            {editable && <button disabled={busy || disabled || editing !== null} onClick={() => void save({ removeScene: shot.index })} className="text-xs text-accent disabled:opacity-40">Remove visual from scene {shot.index}</button>}
          </div> : <p className="text-xs text-muted">Visual to prepare · {shot.references.join(", ")}</p>}
          {editable && <label className="block text-xs text-muted">{shot.media ? "Replace visual" : "Add visual"} · PNG, JPEG, WebP or MP4 · max. 32 MB
            <input type="file" aria-label={`Visual for scene ${shot.index}`} accept="image/png,image/jpeg,image/webp,video/mp4" disabled={busy || disabled || editing !== null} className="block mt-2 max-w-full text-xs file:mr-3 file:rounded file:border-0 file:bg-accent file:text-white file:px-3 file:py-2 disabled:opacity-40" onChange={(event) => {
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
