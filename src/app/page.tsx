"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PreparationReview } from "./preparation-review";
import { RequestRecovery } from "./request-recovery";
import type { ConceptPreparation } from "@/lib/concept/preparation";
import type { Estimate } from "@/lib/pricing";

type MediaSummary = { id: string; label: string; voice: string; duration: number; shots: number; source: "existing" };
type Example = MediaSummary & { available: boolean; reason: string | null; script: string; voiceUrl: string | null };
type Framing = {
  preparation?: ConceptPreparation | null;
  simulation: boolean;
  media?: MediaSummary | null;
  jobId: string;
  analysis: { wordCount: number; durationSeconds: number; reason: string };
  params: {
    templateSlug: string;
    family: string;
    tone: string;
    tier: string;
    aspectRatio: string;
    durationSeconds: number;
    shotCount: number;
  };
  template: { slug: string; name: string; description: string } | null;
  estimate: Estimate;
  balance: number;
  canConfirm: boolean;
};
type Template = {
  slug: string;
  name: string;
  description: string;
  status: string;
  recipe: { family?: string; thumbnail?: string };
};
type JobStep = { key: string; label: string; status: "pending" | "running" | "done" | "failed" };
type SheetEntry = {
  step: number;
  kind: string;
  falModel: string;
  higgsfieldEquivalent: string;
  prompt: string;
  referenceUrl?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  notes?: string;
};
type JobState = {
  draft?: Framing | null;
  preparation?: ConceptPreparation | null;
  id?: string;
  canResume?: boolean;
  interrupted?: boolean;
  renderReused?: boolean;
  script?: string;
  aspectRatio?: AspectRatio;
  media?: MediaSummary | null;
  simulation?: boolean;
  status: string;
  progress: JobStep[];
  billedUsd: number | null;
  estimateUsd: number | null;
  outputUrl: string | null;
  sheet: SheetEntry[] | null;
  sheetUrl: string | null;
  artifacts?: { label: string; url: string }[];
  error: string | null;
};

type AspectRatio = "9:16" | "16:9" | "1:1";
const ASPECTS: Array<{ value: AspectRatio; label: string }> = [
  { value: "9:16", label: "9:16 · Reels / TikTok / Shorts" },
  { value: "16:9", label: "16:9 · YouTube / X" },
  { value: "1:1", label: "1:1 · Feed" },
];

export default function StudioPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [templateSlug, setTemplateSlug] = useState<string>("");
  const [tone, setTone] = useState<"serious" | "energetic" | "calm">("serious");
  const [tier, setTier] = useState<"standard" | "premium">("standard");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [script, setScript] = useState("");
  const [example, setExample] = useState<Example | null>(null);
  const [previewSource, setPreviewSource] = useState<"planning" | "existing">("planning");
  const [framing, setFraming] = useState<Framing | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [loading, setLoading] = useState(false);
  const [preparationBusy, setPreparationBusy] = useState(false);
  const [requestsReady, setRequestsReady] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollEpoch = useRef(0);

  const stopPolling = useCallback(() => {
    pollEpoch.current += 1;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const watchJob = useCallback((id: string) => {
    stopPolling();
    const epoch = pollEpoch.current;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch(`/api/jobs/${id}`);
        if (epoch !== pollEpoch.current) return;
        if (!response.ok) {
          if (response.status === 404) {
            try { localStorage.removeItem("cam-last-job"); } catch { /* Storage may be disabled. */ }
            setError("This saved production is no longer available. You can start a new one.");
            setRestoring(false);
            stopPolling();
            return;
          }
          throw new Error("Could not retrieve this production. Reload to try again.");
        }
        const next: JobState = await response.json();
        if (epoch !== pollEpoch.current) return;
        if (next.status === "estimated" && next.draft) { setFraming(next.draft); setJob(null); stopPolling(); }
        else setJob(next);
        setScript(next.script ?? "");
        if (next.aspectRatio) setAspectRatio(next.aspectRatio);
        setError(null);
        setRestoring(false);
        if (next.status === "succeeded" || next.status === "failed") stopPolling();
      } catch (error) { if (epoch === pollEpoch.current) { setError(error instanceof Error ? error.message : "Connection lost. Reconnecting to the production…"); setRestoring(false); } }
      finally { pending = false; }
    };
    pollRef.current = setInterval(() => void refresh(), 1500);
    void refresh();
  }, [stopPolling]);

  useEffect(() => {
    // Read browser-only persistence after hydration; cancel on a quick navigation.
    const restore = setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      let id: string | null = query.get("job");
      try {
        if (query.get("new") === "1") { localStorage.removeItem("cam-last-job"); id = null; }
        else if (id) localStorage.setItem("cam-last-job", id);
        else id = localStorage.getItem("cam-last-job");
      } catch { /* Explicit links also work without browser storage. */ }
      if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) watchJob(id);
      else setRestoring(false);
    }, 0);
    return () => { clearTimeout(restore); stopPolling(); };
  }, [watchJob, stopPolling]);

  useEffect(() => {
    fetch("/api/examples/cam-clay").then((r) => {
      if (!r.ok) throw new Error("Could not check existing media");
      return r.json();
    }).then(setExample).catch(() => setError("Could not check the existing CAM film. Planning previews remain available."));
    fetch("/api/templates")
      .then((r) => r.json())
      .then((list: Template[]) => {
        const active = list.filter((t) => t.status === "active");
        setTemplates(active);
        if (active.length > 0) setTemplateSlug((s) => s || active[0].slug);
      })
      .catch(() => setError("Could not load video styles. Please reload the page."))
      .finally(() => setTemplatesLoaded(true));
  }, []);

  async function frame() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/productions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          mode,
          previewSource,
          overrides: mode === "manual" ? { templateSlug, tone, tier, aspectRatio } : { aspectRatio },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Framing failed");
      setFraming(data);
      window.history.replaceState(null, "", `/?job=${data.jobId}`);
      try { localStorage.setItem("cam-last-job", data.jobId); } catch { /* Optional draft persistence. */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!framing || preparationBusy) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${framing.jobId}/confirm`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Confirmation failed");
      setJob({ simulation: framing.simulation, media: framing.media, status: "running", progress: [], billedUsd: null, estimateUsd: null, outputUrl: null, sheet: null, sheetUrl: null, error: null });
      try { localStorage.setItem("cam-last-job", framing.jobId); } catch { /* Current session still works. */ }
      watchJob(framing.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function resume() {
    if (!job?.id) return;
    stopPolling();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${job.id}/resume`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === "already-running") { watchJob(job.id); return; }
        throw new Error(data.error ?? "Could not resume this preview.");
      }
      setJob({ ...job, status: "running", canResume: false, interrupted: false, error: null });
      watchJob(job.id);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not resume this preview."); }
    finally { setLoading(false); }
  }

  function reset() {
    stopPolling();
    window.history.replaceState(null, "", "/");
    try { localStorage.removeItem("cam-last-job"); } catch { /* No saved job when storage is disabled. */ }
    setFraming(null);
    setJob(null);
    setScript("");
    setPreviewSource("planning");
    setError(null);
  }

  const inputDisabled = framing !== null || job !== null || restoring;
  const settingsDisabled = inputDisabled || previewSource === "existing";
  const selectedTemplate = templates.find((t) => t.slug === templateSlug);
  const framedTemplate = framing ? templates.find((t) => t.slug === framing.params.templateSlug) : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Studio</h1>
        <p className="text-muted mt-1">
          Paste a script from your monitoring app. The studio frames it, shows the price, and
          produces the video after your confirmation.
        </p>
      </div>

      {/* Step 1: script + mode */}
      {example && !framing && !job && !restoring && <section className="bg-surface border border-accent/40 rounded-xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-medium">Try the existing CAM film</h2>
            <p className="text-sm text-muted mt-1">12 animated clips, the original Dylan recording and timed subtitles. Rebuilt locally in 9:16, with no generation charge.</p>
          </div>
          <span className="text-accent font-mono whitespace-nowrap">$0.00</span>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          {([['narrator', 'Narrator'], ['monster', 'Monster'], ['effigy', 'Effigy']] as const).map(([id, label]) => <div key={id} className="text-center text-xs text-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/recipes/cam-clay/${id}.png`} alt={label} className="w-16 h-20 object-contain bg-surface-2 rounded-lg mb-1" />{label}
          </div>)}
          {example.voiceUrl && <label className="text-xs text-muted space-y-1"><span className="block">Listen to Dylan · existing recording</span><audio aria-label="Existing Dylan voice recording" controls preload="none" src={example.voiceUrl} className="h-9 max-w-full" /></label>}
        </div>
        {example.available ? <div className="flex items-center gap-3">
          <button disabled={previewSource === "existing"} onClick={() => { setScript(example.script); setPreviewSource("existing"); setMode("manual"); setTemplateSlug("cam-clay"); setAspectRatio("9:16"); setTone("serious"); setTier("premium"); setError(null); }} className="bg-accent text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">{previewSource === "existing" ? "Existing film selected" : "Load CAM example"}</button>
          {previewSource === "existing" && <button onClick={() => { setPreviewSource("planning"); setScript(""); }} className="text-muted hover:text-foreground text-sm">Use my own script</button>}
        </div> : <p role="status" className="text-sm text-muted">{example.reason}</p>}
      </section>}
      {templatesLoaded && templates.length === 0 && (
        <div role="status" className="bg-surface border border-line rounded-xl p-5 text-sm text-muted">
          New CAM video styles are being prepared. Production will be available once the first style is ready.
        </div>
      )}
      <section className="bg-surface border border-line rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">1. Your script</h2>
          <div className="flex rounded-lg border border-line overflow-hidden text-sm">
            {(["auto", "manual"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                disabled={settingsDisabled}
                className={`px-4 py-1.5 capitalize ${
                  mode === m ? "bg-accent text-white" : "bg-surface-2 text-muted hover:text-foreground"
                } disabled:opacity-60`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <label className="space-y-1">
            <span className="text-muted">Format</span>
            <select
              value={aspectRatio}
              disabled={settingsDisabled}
              onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
              className="w-full bg-surface-2 border border-line rounded-md px-2 py-1.5"
            >
              {ASPECTS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </label>
          {mode === "manual" && (
            <>
              <label className="space-y-1">
                <span className="text-muted">Tone</span>
                <select
                  value={tone}
                  disabled={settingsDisabled}
                  onChange={(e) => setTone(e.target.value as typeof tone)}
                  className="w-full bg-surface-2 border border-line rounded-md px-2 py-1.5"
                >
                  <option value="serious">Serious</option>
                  <option value="calm">Calm</option>
                  <option value="energetic">Energetic</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-muted">Quality tier</span>
                <select
                  value={tier}
                  disabled={settingsDisabled}
                  onChange={(e) => setTier(e.target.value as typeof tier)}
                  className="w-full bg-surface-2 border border-line rounded-md px-2 py-1.5"
                >
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                </select>
              </label>
            </>
          )}
        </div>

        {mode === "manual" && (
          <div className="space-y-2 text-sm">
            <span className="text-muted">Video model</span>
            <div className="grid grid-cols-5 gap-2">
              {templates.map((t) => (
                <button
                  key={t.slug}
                  type="button"
                  disabled={settingsDisabled}
                  onClick={() => setTemplateSlug(t.slug)}
                  className={`text-left rounded-lg border overflow-hidden bg-surface-2 ${
                    templateSlug === t.slug ? "border-accent ring-1 ring-accent" : "border-line hover:border-accent/60"
                  } disabled:opacity-60`}
                >
                  {t.recipe.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.recipe.thumbnail} alt={t.name} className="w-full aspect-[9/16] object-cover" />
                  )}
                  <div className="px-2 py-1.5 text-xs leading-tight">{t.name}</div>
                </button>
              ))}
            </div>
            {selectedTemplate && <p className="text-muted text-xs">{selectedTemplate.description}</p>}
          </div>
        )}

        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          disabled={settingsDisabled}
          rows={7}
          placeholder="Paste the script generated by your monitoring app…"
          className="w-full bg-surface-2 border border-line rounded-lg p-3 text-sm placeholder:text-muted/60 focus:outline-none focus:border-accent disabled:opacity-60"
        />
        {!framing && !job && (
          <button
            onClick={frame}
            disabled={loading || restoring || templates.length === 0 || script.trim().length < 40}
            className="bg-accent hover:bg-accent/90 disabled:opacity-40 text-white rounded-lg px-5 py-2 text-sm font-medium"
          >
            {loading ? "Framing…" : previewSource === "existing" ? "Prepare existing film · $0" : "Frame my request"}
          </button>
        )}
      </section>

      {error && (
        <div className="border border-danger/40 bg-danger/10 text-danger rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Step 2: framing + estimate */}
      {framing && !job && (
        <section className="bg-surface border border-line rounded-xl p-5 space-y-4">
          <h2 className="font-medium">{framing.preparation?.quote ? "2. Scene plan & quote preparation" : "2. Framing & price"}</h2>
          {framing.simulation && <p className="text-sm text-muted">{framing.media ? "Existing animated characters and the original Dylan recording will be assembled locally. No new media will be generated. No credits will be deducted." : "Free local preview. Choose a test voice and add visuals below. The prices are provisional estimates for future generation; this preview costs $0."}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface-2 border border-line rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between items-center gap-3">
                <span className="text-muted">Video model</span>
                <span className="font-medium flex items-center gap-2">
                  {framedTemplate?.recipe.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={framedTemplate.recipe.thumbnail} alt="" className="w-6 h-6 rounded object-cover" />
                  )}
                  {framing.template?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Format</span>
                <span>{framing.params.aspectRatio}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Duration</span>
                <span>{framing.preparation?.measuredScenes ? "" : "~"}{(framing.preparation?.durationSeconds ?? framing.params.durationSeconds).toFixed(1)}s ({framing.preparation?.shots.length ?? framing.params.shotCount} shots)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Tone / tier</span>
                <span className="capitalize">{framing.params.tone} · {framing.params.tier}</span>
              </div>
              {framing.media && <p className="text-muted border-t border-line pt-2">Voice: {framing.media.voice}</p>}
              {mode === "auto" && (
                <p className="text-muted pt-2 border-t border-line">{framing.analysis.reason}</p>
              )}
            </div>
            <div className="bg-surface-2 border border-line rounded-lg p-4 text-sm">
              {framing.preparation?.quote ? <div className="space-y-2">
                <p className="font-medium text-accent">Free local preview · $0</p>
                <p className="text-muted">Future generation needs a complete provider quote. Prepare it below using the current scenes and approved files.</p>
                <p className="text-muted">{framing.preparation.quote.missingPrices} prices missing. Saving a planning estimate does not authorize spending.</p>
              </div> : <table className="w-full">
                <tbody>
                  {framing.estimate.lines.map((l) => (
                    <tr key={l.label}>
                      <td className="text-muted py-0.5">{l.label} × {l.quantity}</td>
                      <td className="text-right font-mono">${l.billedUsd.toFixed(2)}</td>
                    </tr>
                  ))}
                  {framing.estimate.unpriced?.map((label) => <tr key={label}><td className="text-muted py-0.5">{label}</td><td className="text-right">Pending</td></tr>)}
                  <tr className="border-t border-line">
                    <td className="pt-2 font-medium">{framing.estimate.unpriced?.length ? "Provisional subtotal · unpriced steps excluded" : "Estimated total"}</td>
                    <td className="pt-2 text-right font-mono font-semibold text-accent">
                      ${framing.estimate.totalBilledUsd.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>}
            </div>
          </div>
          {!framing.canConfirm && (
            <p className="text-danger text-sm">
              Insufficient credits (balance ${framing.balance.toFixed(2)}). Top up in Admin.
            </p>
          )}
          {framing.preparation && <PreparationReview preparation={framing.preparation} jobId={framing.jobId} disabled={loading} onBusy={setPreparationBusy} onChange={(preparation) => setFraming((current) => current ? { ...current, preparation } : current)} />}
          {framing.preparation?.shots.some((shot) => shot.media && shot.review?.status !== "approved") && <p className="text-sm text-muted">Approve each imported visual, or remove it, before starting the preview.</p>}
          <div className="flex gap-3">
            <button
              onClick={confirm}
              disabled={loading || preparationBusy || framing.preparation?.readiness?.canPreview === false || !framing.canConfirm || framing.preparation?.shots.some((shot) => shot.media && shot.review?.status !== "approved")}
              className="bg-accent hover:bg-accent/90 disabled:opacity-40 text-white rounded-lg px-5 py-2 text-sm font-medium"
            >
              {framing.media ? "Rebuild existing film · $0" : framing.simulation ? "Run free preview" : `Confirm & produce · $${framing.estimate.totalBilledUsd.toFixed(2)}`}
            </button>
            <button onClick={reset} disabled={loading || preparationBusy} className="text-muted hover:text-foreground text-sm px-3">
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* Step 3: production progress + result */}
      {job && (
        <section className="bg-surface border border-line rounded-xl p-5 space-y-4">
          <h2 className="font-medium">3. Production</h2>
          {job.canResume && <div role="status" className="bg-surface-2 border border-accent/40 rounded-lg p-4 space-y-3">
            <p className="text-sm">{job.interrupted ? "This preview was interrupted. Resume it using the saved script and media." : "You can retry this local preview after fixing the issue below."} A completed render will be reused if its files are unchanged. No credits will be charged.</p>
            <button onClick={resume} disabled={loading || !requestsReady} className="bg-accent text-white rounded-lg px-4 py-2 text-sm disabled:opacity-40">{loading ? "Resuming…" : "Resume free preview"}</button>
          </div>}
          {job.canResume && job.id && <RequestRecovery key={job.id} jobId={job.id} onReady={setRequestsReady} />}
          <ul className="space-y-2 text-sm">
            {(job.progress ?? []).map((s) => (
              <li key={s.key} className="flex items-center gap-3">
                <span
                  className={`w-2 h-2 rounded-full ${
                    s.status === "done"
                      ? "bg-success"
                      : s.status === "running"
                        ? "bg-accent animate-pulse"
                        : s.status === "failed"
                          ? "bg-danger"
                          : "bg-line"
                  }`}
                />
                <span className={s.status === "pending" ? "text-muted" : ""}>{s.label}</span>
              </li>
            ))}
          </ul>

          {job.status === "failed" && (
            <p className="text-danger text-sm">
              Production failed — nothing was billed. {job.error}
            </p>
          )}

          {job.status === "succeeded" && job.outputUrl && (
            <div className="space-y-3">
              {job.renderReused && <p className="text-sm text-muted">The saved render was recovered and its quality checks completed.</p>}
              <video
                src={job.outputUrl}
                controls
                className="rounded-lg border border-line bg-black max-h-[60vh] max-w-full w-auto mx-auto"
              />
              {job.simulation ? <p className="text-sm text-muted">{job.media ? "Film rebuilt from the existing CAM characters and Dylan recording, with timed subtitles. No credits were deducted. A new script needs its own voice and scenes." : job.preparation?.narration?.selected ? "Preview assembled with the reviewed imported recording and supplied word timings. Missing scene visuals remain placeholders. No credits were deducted." : "Free preview complete. Added visuals and the selected test voice are included; empty scenes remain placeholders. Subtitle word positions are approximate. No credits were deducted."}</p> : <p className="text-sm text-muted">
                Billed <span className="font-mono text-foreground">${job.billedUsd?.toFixed(2)}</span>
                {" "}(estimate ${job.estimateUsd?.toFixed(2)}) — deducted from your credits.
              </p>}
              {job.preparation?.voice.preview && job.preparation.voice.preview !== "silent" && job.artifacts?.some((a) => a.label === "Listen to test voice") && <div className="text-sm space-y-2">
                <p>Test narration · {job.preparation.voice.name} · $0</p>
                <audio aria-label="Local test narration" controls src={job.artifacts.find((a) => a.label === "Listen to test voice")!.url} className="w-full" />
              </div>}
              {job.artifacts?.some((a) => a.label === "Listen to imported recording") && <div className="space-y-2 text-sm">
                <p>Reviewed imported recording · $0</p>
                <audio aria-label="Rendered imported recording" controls src={job.artifacts.find((a) => a.label === "Listen to imported recording")!.url} className="w-full" />
              </div>}
              {job.artifacts?.some((a) => a.label === "Offline sequence test video (test voice)") && <details className="border border-line rounded-lg p-4 text-sm space-y-3">
                <summary className="cursor-pointer font-medium text-accent">Complete production test · $0</summary>
                <p>Voice, word timing, approved images, animation and montage have been connected and checked offline. The target request uses Bram; the audio here is the selected Mac test voice.</p>
                <video aria-label="Complete offline production test" controls preload="metadata" src={job.artifacts.find((a) => a.label === "Offline sequence test video (test voice)")!.url} className="rounded-lg max-h-80 max-w-full mx-auto bg-black" />
                <p className="text-muted">This test uses marked calibration images and simulated approvals. Word timing is approximate. A new Bram recording, creative review and real provider quotes are still required. No paid request or trial was started.</p>
              </details>}
              {job.artifacts && <div className="flex flex-wrap gap-3 text-sm">{job.artifacts.map((artifact) => <a key={artifact.url} href={artifact.url} target="_blank" className="text-accent hover:underline">{artifact.label} ↗</a>)}</div>}
            </div>
          )}

          {(job.status === "succeeded" || job.status === "failed" || job.interrupted) && (
            <button
              onClick={reset}
              className="bg-surface-2 border border-line hover:border-accent rounded-lg px-5 py-2 text-sm"
            >
              New production
            </button>
          )}
        </section>
      )}
      {job?.preparation && <PreparationReview preparation={job.preparation} />}

      {/* Dry-run: production sheet (debug view of the exact fal.ai requests) */}
      {job?.status === "succeeded" && job.sheet && job.sheet.length > 0 && (
        <section className="bg-surface border border-line rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium">{job.media ? "Reused media" : "Production sheet (dry-run)"}</h2>
              <p className="text-sm text-muted mt-1">
                {job.media ? "Existing voice and clips used in this montage. Their file fingerprints are saved with the production." : "Planned prompts and references for review. No generation requests were sent. Voice selection and final images require validation."}
              </p>
            </div>
            {job.sheetUrl && (
              <a
                href={job.sheetUrl}
                target="_blank"
                className="text-sm text-accent hover:underline whitespace-nowrap"
              >
                Open as markdown ↗
              </a>
            )}
          </div>
          <div className="space-y-3">
            {job.sheet.map((e) => (
              <details key={e.step} className="bg-surface-2 border border-line rounded-lg">
                <summary className="px-4 py-2.5 text-sm cursor-pointer select-none flex items-center gap-3">
                  <span className="font-mono text-muted">#{e.step}</span>
                  <span className="uppercase text-xs tracking-wide bg-accent-soft text-accent rounded px-1.5 py-0.5">
                    {e.kind}
                  </span>
                  <span className="text-muted truncate">{e.higgsfieldEquivalent}</span>
                </summary>
                <div className="px-4 pb-4 space-y-2 text-sm">
                  <p className="text-muted">
                    Source: <span className="font-mono text-foreground">{e.falModel}</span>
                    {e.durationSeconds ? ` · ${e.durationSeconds}s` : ""}
                    {e.aspectRatio ? ` · ${e.aspectRatio}` : ""}
                  </p>
                  {e.referenceUrl && (
                    <p className="text-muted">
                      Reference:{" "}
                      <a href={e.referenceUrl} target="_blank" className="text-accent hover:underline">
                        keyframe ↗
                      </a>
                    </p>
                  )}
                  {e.notes && <p className="text-muted">{e.notes}</p>}
                  <pre className="bg-background border border-line rounded-md p-3 whitespace-pre-wrap text-xs">
                    {e.prompt}
                  </pre>
                  <button
                    onClick={() => navigator.clipboard.writeText(e.prompt)}
                    className="text-xs text-accent hover:underline"
                  >
                    Copy prompt
                  </button>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
