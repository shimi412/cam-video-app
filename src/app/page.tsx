"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type EstimateLine = { label: string; quantity: number; billedUsd: number };
type Framing = {
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
  estimate: { lines: EstimateLine[]; totalBilledUsd: number };
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
  status: string;
  progress: JobStep[];
  billedUsd: number | null;
  estimateUsd: number | null;
  outputUrl: string | null;
  sheet: SheetEntry[] | null;
  sheetUrl: string | null;
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
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [templateSlug, setTemplateSlug] = useState<string>("");
  const [tone, setTone] = useState<"serious" | "energetic" | "calm">("serious");
  const [tier, setTier] = useState<"standard" | "premium">("standard");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [script, setScript] = useState("");
  const [framing, setFraming] = useState<Framing | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((list: Template[]) => {
        const active = list.filter((t) => t.status === "active");
        setTemplates(active);
        if (active.length > 0) setTemplateSlug((s) => s || active[0].slug);
      })
      .catch(() => undefined);
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
          overrides: mode === "manual" ? { templateSlug, tone, tier, aspectRatio } : { aspectRatio },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Framing failed");
      setFraming(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!framing) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${framing.jobId}/confirm`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Confirmation failed");
      setJob({ status: "running", progress: [], billedUsd: null, estimateUsd: null, outputUrl: null, sheet: null, sheetUrl: null, error: null });
      pollRef.current = setInterval(async () => {
        const r = await fetch(`/api/jobs/${framing.jobId}`);
        const j: JobState = await r.json();
        setJob(j);
        if (j.status === "succeeded" || j.status === "failed") stopPolling();
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    stopPolling();
    setFraming(null);
    setJob(null);
    setScript("");
    setError(null);
  }

  const inputDisabled = framing !== null;
  const selectedTemplate = templates.find((t) => t.slug === templateSlug);
  const framedTemplate = framing ? templates.find((t) => t.slug === framing.params.templateSlug) : undefined;
  const isVertical = (framing?.params.aspectRatio ?? aspectRatio) === "9:16";

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
      <section className="bg-surface border border-line rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">1. Your script</h2>
          <div className="flex rounded-lg border border-line overflow-hidden text-sm">
            {(["auto", "manual"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                disabled={inputDisabled}
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
              disabled={inputDisabled}
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
                  disabled={inputDisabled}
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
                  disabled={inputDisabled}
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
                  disabled={inputDisabled}
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
          disabled={inputDisabled}
          rows={7}
          placeholder="Paste the script generated by your monitoring app…"
          className="w-full bg-surface-2 border border-line rounded-lg p-3 text-sm placeholder:text-muted/60 focus:outline-none focus:border-accent disabled:opacity-60"
        />
        {!framing && (
          <button
            onClick={frame}
            disabled={loading || script.trim().length < 40}
            className="bg-accent hover:bg-accent/90 disabled:opacity-40 text-white rounded-lg px-5 py-2 text-sm font-medium"
          >
            {loading ? "Framing…" : "Frame my request"}
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
          <h2 className="font-medium">2. Framing &amp; price</h2>
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
                <span>~{framing.params.durationSeconds}s ({framing.params.shotCount} shots)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Tone / tier</span>
                <span className="capitalize">{framing.params.tone} · {framing.params.tier}</span>
              </div>
              {mode === "auto" && (
                <p className="text-muted pt-2 border-t border-line">{framing.analysis.reason}</p>
              )}
            </div>
            <div className="bg-surface-2 border border-line rounded-lg p-4 text-sm">
              <table className="w-full">
                <tbody>
                  {framing.estimate.lines.map((l) => (
                    <tr key={l.label}>
                      <td className="text-muted py-0.5">{l.label} × {l.quantity}</td>
                      <td className="text-right font-mono">${l.billedUsd.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-line">
                    <td className="pt-2 font-medium">Estimated total</td>
                    <td className="pt-2 text-right font-mono font-semibold text-accent">
                      ${framing.estimate.totalBilledUsd.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          {!framing.canConfirm && (
            <p className="text-danger text-sm">
              Insufficient credits (balance ${framing.balance.toFixed(2)}). Top up in Admin.
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={confirm}
              disabled={loading || !framing.canConfirm}
              className="bg-accent hover:bg-accent/90 disabled:opacity-40 text-white rounded-lg px-5 py-2 text-sm font-medium"
            >
              Confirm &amp; produce — ${framing.estimate.totalBilledUsd.toFixed(2)}
            </button>
            <button onClick={reset} className="text-muted hover:text-foreground text-sm px-3">
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* Step 3: production progress + result */}
      {job && (
        <section className="bg-surface border border-line rounded-xl p-5 space-y-4">
          <h2 className="font-medium">3. Production</h2>
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
              <video
                src={job.outputUrl}
                controls
                className={`rounded-lg border border-line bg-black ${isVertical ? "max-h-[75vh] mx-auto" : "w-full"}`}
              />
              <p className="text-sm text-muted">
                Billed <span className="font-mono text-foreground">${job.billedUsd?.toFixed(2)}</span>
                {" "}(estimate ${job.estimateUsd?.toFixed(2)}) — deducted from your credits.
              </p>
            </div>
          )}

          {(job.status === "succeeded" || job.status === "failed") && (
            <button
              onClick={reset}
              className="bg-surface-2 border border-line hover:border-accent rounded-lg px-5 py-2 text-sm"
            >
              New production
            </button>
          )}
        </section>
      )}

      {/* Dry-run: production sheet (debug view of the exact fal.ai requests) */}
      {job?.status === "succeeded" && job.sheet && job.sheet.length > 0 && (
        <section className="bg-surface border border-line rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium">Production sheet (dry-run)</h2>
              <p className="text-sm text-muted mt-1">
                The exact requests the pipeline would have sent to fal.ai (dry-run mode only).
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
                    fal.ai: <span className="font-mono text-foreground">{e.falModel}</span>
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
