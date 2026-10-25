"use client";
import { useState } from "react";
import type { ConceptPreparation } from "@/lib/concept/preparation";

export function NarrationReview({ preparation, jobId, editable, disabled, onChange, onBusy, onEditing }: {
  preparation: ConceptPreparation; jobId?: string; editable: boolean; disabled: boolean;
  onChange?: (value: ConceptPreparation) => void; onBusy: (value: boolean) => void; onEditing: (value: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null), [dirty, setDirty] = useState(false);
  const voice = preparation.narration;
  async function save(body: FormData | Record<string, unknown>) {
    onBusy(true); setError(null);
    try {
      const upload = body instanceof FormData;
      const response = await fetch(`/api/jobs/${jobId}/narration`, { method: upload ? "POST" : "PATCH", headers: upload ? undefined : { "Content-Type": "application/json" }, body: upload ? body : JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not save the recording.");
      onChange?.(result.preparation); setDirty(false); onEditing(false);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save the recording."); }
    finally { onBusy(false); }
  }
  return <details className="border border-line rounded-lg p-3 text-sm space-y-3" open={Boolean(voice)}>
    <summary className="cursor-pointer font-medium text-accent">Use an existing voice recording · $0</summary>
    <p>Import a recording you already have, for your film. Listen, check the words and timing, then choose it for this preview. No voice will be generated or purchased.</p>
    {voice && <div className="space-y-3">
      <p className="font-medium">{voice.speaker === "bram" ? "Production recording" : voice.speaker === "test" ? "Test recording" : "Other recording"} · {voice.duration.toFixed(2)} s · {voice.selected ? "Selected for this preview" : "Not selected"}</p>
      <p className="text-muted" dir="auto">Source: {voice.sourceNote}</p>
      <audio key={voice.id} aria-label="Imported voice recording" controls preload="metadata" src={voice.url} className="w-full" />
      {voice.issue && <p role="alert" className="text-danger">{voice.issue}</p>}
      <p>{voice.hasTiming ? "Word timings supplied locally. Check them while listening." : "Add the start and end of every word before reviewing this recording."}</p>
      {editable && <details className="space-y-3">
        <summary className="text-accent cursor-pointer">Edit word timings · {voice.words.length} words</summary>
        <p className="text-xs text-muted">Seconds from the start of this audio. Every word must be present, in order, with no overlap. These entries are not automatic speech recognition.</p>
        <form key={voice.target} onChange={() => { setDirty(true); onEditing(true); }} onSubmit={(event) => {
          event.preventDefault(); const form = new FormData(event.currentTarget);
          void save({ action: "timing", id: voice.id, target: voice.target, timing: { audioSha256: voice.audioSha256, scriptSha256: voice.scriptSha256,
            words: voice.words.map((word, i) => ({ word: word.word, start: Number(form.get(`start-${i}`)), end: Number(form.get(`end-${i}`)) })) } });
        }} className="space-y-3">
          <fieldset disabled={disabled} className="space-y-3">
            <div className="max-h-72 overflow-auto"><table className="w-full text-xs"><thead><tr><th className="text-left">Word</th><th>Start (s)</th><th>End (s)</th></tr></thead>
              <tbody>{voice.words.map((word, i) => <tr key={i}><td dir="auto">{i + 1}. {word.word}</td>
                <td><input aria-label={`Word ${i + 1} start`} name={`start-${i}`} type="number" min="0" max={voice.duration} step="0.001" required defaultValue={word.start ?? ""} className="w-24 m-1 p-1 bg-surface border border-line rounded" /></td>
                <td><input aria-label={`Word ${i + 1} end`} name={`end-${i}`} type="number" min="0.001" max={voice.duration} step="0.001" required defaultValue={word.end ?? ""} className="w-24 m-1 p-1 bg-surface border border-line rounded" /></td></tr>)}</tbody></table></div>
            <button type="submit" className="btn btn-secondary btn-sm">Save word timings</button>
            {dirty && <button type="reset" className="btn btn-ghost btn-sm ml-4" onClick={() => { setDirty(false); onEditing(false); }}>Discard timing edits</button>}
          </fieldset>
        </form>
        <label className="block text-xs">Or import word timings as JSON
          <input type="file" accept="application/json,.json" aria-label="Import word timings" disabled={disabled || dirty} onChange={async (event) => {
            const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
            if (file.size > 512 * 1024) { setError("The timing file must be under 512 KB."); return; }
            try { const timing = JSON.parse(await file.text()); void save({ action: "timing", id: voice.id, target: voice.target, timing }); }
            catch { setError("Use a valid word timing JSON file."); }
          }} className="block mt-2" />
        </label>
        <button disabled={disabled || dirty} className="text-xs text-accent" onClick={() => {
          const content = JSON.stringify({ audioSha256: voice.audioSha256, scriptSha256: voice.scriptSha256, words: voice.words }, null, 2);
          const url = URL.createObjectURL(new Blob([content], { type: "application/json" })), link = document.createElement("a");
          link.href = url; link.download = "cam-word-timings.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}>Download timing template</button>
      </details>}
      <p className="font-medium">Recording review: {voice.review.status}</p>
      {voice.review.note && <p dir="auto">{voice.review.note}</p>}
      {editable && <form key={voice.target + voice.review.status} onSubmit={(event) => {
        event.preventDefault(); const data = new FormData(event.currentTarget), decision = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
        if (decision !== "approved" && decision !== "rejected") return;
        void save({ action: "review", target: voice.target, decision, note: String(data.get("note")), listened: data.get("listened") === "on", checkedWords: data.get("checkedWords") === "on" });
      }}><fieldset disabled={disabled || dirty || Boolean(voice.issue)} className="space-y-2">
        <label className="block"><input name="listened" type="checkbox" className="mr-2" />I listened to this entire recording.</label>
        <label className="block"><input name="checkedWords" type="checkbox" className="mr-2" />I checked every word and its timing against the audio.</label>
        <label className="block text-xs">Review note (required to reject)<input name="note" aria-label="Voice review note" maxLength={1000} className="block w-full mt-1 p-2 bg-surface border border-line rounded" /></label>
        <div className="flex gap-4"><button value="approved" disabled={!voice.hasTiming} className="btn btn-primary btn-sm">Approve recording and timing</button><button value="rejected" className="btn btn-danger btn-sm">Reject recording</button></div>
      </fieldset></form>}
      {editable && <div className="flex gap-4"><button disabled={disabled || dirty || !voice.canUse} onClick={() => void save({ action: "select", target: voice.target })} className="btn btn-primary btn-sm">Use reviewed recording in preview</button>
        <button disabled={disabled || dirty} onClick={() => void save({ action: "remove", id: voice.id })} className="btn btn-ghost btn-sm">Remove recording</button></div>}
      <p className="text-xs text-muted">The app checks the file and timing consistency. The speaker identity is declared by the uploader. This review does not enable paid generation.</p>
    </div>}
    {editable && <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); form.set("currentId", voice?.id ?? ""); void save(form); }}>
      <fieldset disabled={disabled || dirty} className="space-y-3">
        <label className="block text-xs">{voice ? "Replace recording" : "Audio file"} · mono/stereo · max. 64 MB, 10 min<input name="file" type="file" aria-label="Voice recording file" accept="audio/*" required className="block mt-2" /></label>
        <label className="block">Declared speaker<select name="speaker" aria-label="Declared speaker" defaultValue="test" className="block mt-1 p-2 bg-surface border border-line rounded"><option value="bram">Production recording</option><option value="test">Test voice</option><option value="other">Other voice</option></select></label>
        <label className="block text-xs">Where this recording came from<input name="sourceNote" aria-label="Recording source" maxLength={500} required className="block mt-1 p-2 w-full bg-surface border border-line rounded" /></label>
        <button className="btn btn-secondary btn-sm">Import recording</button>
      </fieldset>
    </form>}
    {dirty && <p role="status">Save or discard word timing edits before continuing.</p>}
    {error && <p role="alert" className="text-danger">{error}</p>}
  </details>;
}
