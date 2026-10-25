"use client";

import { VideoJourney, SINGLE_JOURNEY_STEPS } from "@/components/video-journey";
import { InProgressDialog, type InProgressVideo } from "@/components/in-progress-dialog";
import { WorkProgress } from "@/components/work-progress";
import Link from "next/link";
import { CategoryCard } from "@/components/category-card";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PreparationReview } from "./preparation-review";
import { RequestRecovery } from "./request-recovery";
import { FormatDownloads } from "./format-downloads";
import type { ConceptPreparation } from "@/lib/concept/preparation";
import type { Estimate } from "@/lib/pricing";

type MediaSummary = { id: string; label: string; voice: string; duration: number; shots: number; source: "existing" };
type Example = MediaSummary & { available: boolean; reason: string | null; script: string; voiceUrl: string | null };
type Framing = {
  conversationId?: string;
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
  title?: string | null;
  conversationId?: string;
  draft?: Framing | null;
  live?: boolean;
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
type StoryboardLaunchCost = { token: string; estimatedAmountCents: number; maximumAmountCents: number; sceneCount: number; imageCount: number; expiresAt: number };
const ASPECTS: Array<{ value: AspectRatio; label: string }> = [
  { value: "9:16", label: "9:16 · Reels / TikTok / Shorts" },
  { value: "16:9", label: "16:9 · YouTube / X" },
  { value: "1:1", label: "1:1 · Feed" },
];

export default function StudioPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [pricingReady,setPricingReady]=useState(false);
  const [pricingMode,setPricingMode]=useState<string|null>(null);
  // Single journey (Shimi, 2026-10-23): Start analyses the script and returns ONE estimate (delay and price);
  // approving it reserves the price and launches the complete film. No preparation allowance, no token.
  const [estimate,setEstimate]=useState<{jobId:string;quote:string;customerQuote:string;amountCents:number;expiresAt:number;minutes:number;sceneCount:number;availableCents:number}|null>(null);
  const [connected, setConnected] = useState<boolean|null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [example, setExample] = useState<Example | null>(null);
  const [previewSource, setPreviewSource] = useState<"planning" | "existing">("planning");
  const [framing, setFraming] = useState<Framing | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [loading, setLoading] = useState(false);
  const [preparationBusy, setPreparationBusy] = useState(false);
  const [requestsReady, setRequestsReady] = useState(false);
  const [restoring, setRestoring] = useState(true);
  // A remembered video in progress is offered, never forced (Shimi, 2026-10-25).
  const [inProgress, setInProgress] = useState<InProgressVideo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollEpoch = useRef(0);
  const framingAttempt = useRef<{body:string;id:string;token?:string}|null>(null);
  const launchInFlight = useRef(false);
  const [launchCost, setLaunchCost] = useState<{input:string;cost:StoryboardLaunchCost}|null>(null);
  const [launchCostError, setLaunchCostError] = useState<{input:string;message:string}|null>(null);
  const [costRevision, setCostRevision] = useState(0);
  // Automatic direction for new films; retain the existing-film demo contract internally.
  const mode = previewSource === "existing" ? "manual" : "auto";
  const overrides = previewSource === "existing" ? {templateSlug:"cam-clay",tone:"serious",tier:"premium",aspectRatio} : {aspectRatio};
  const launchInput = JSON.stringify({script,mode,previewSource,overrides});
  const currentLaunchCost = launchCost?.input === launchInput ? launchCost.cost : null;
  const single = Boolean(connected) && pricingMode === "tiers-v2" && previewSource === "planning";

  // Price disclosure only. Typing, loading and refreshing never launch media.
  useEffect(() => {
    if (single || !connected || !pricingReady || !templatesLoaded || restoring || loading || framing || job || script.trim().length < 40) return;
    const controller = new AbortController();
    let renewal: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      void fetch("/api/productions/preparation", {method:"POST",headers:{"Content-Type":"application/json"},body:launchInput,signal:controller.signal})
        .then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error ?? "Preparation pricing is temporarily unavailable."); return value as StoryboardLaunchCost; })
        .then(cost => {
          if (controller.signal.aborted) return;
          setLaunchCost({input:launchInput,cost});
          setLaunchCostError(null);
          renewal = setTimeout(() => setCostRevision(value => value + 1), Math.max(1000,cost.expiresAt-Date.now()-1000));
        })
        .catch(cause => { if (!controller.signal.aborted) setLaunchCostError({input:launchInput,message:cause instanceof Error?cause.message:"Preparation pricing is temporarily unavailable."}); });
    }, 600);
    return () => { clearTimeout(timer); clearTimeout(renewal); controller.abort(); };
  }, [single,connected,pricingReady,templatesLoaded,restoring,loading,framing,job,script,launchInput,costRevision]);

  const stopPolling = useCallback(() => {
    pollEpoch.current += 1;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const watchJob = useCallback((id: string, remembered = false) => {
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
        if(next.live){
          if(remembered){setInProgress({id,title:next.title??null,status:next.status??"running",live:true,href:`/production/${id}`});setRestoring(false);stopPolling();return;}
          router.push(`/production/${id}`);stopPolling();return;
        }
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
  }, [stopPolling,router]);

  useEffect(() => {
    // Read browser-only persistence after hydration; cancel on a quick navigation.
    const restore = setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      const source = query.get("source");
      if (source && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(source)) {
        void fetch(`/api/jobs/${source}`).then(async response => { if (!response.ok) throw Error("This script could not be loaded."); return response.json() as Promise<JobState>; })
          .then(saved => { setScript(saved.script??"");setTitle(saved.title??"");if(saved.aspectRatio)setAspectRatio(saved.aspectRatio);try { localStorage.removeItem("cam-last-job"); } catch { /* Optional persistence. */ } })
          .catch(cause=>setError(cause.message)).finally(()=>setRestoring(false));
        return;
      }
      let id: string | null = query.get("job");
      try {
        if (query.get("new") === "1") { localStorage.removeItem("cam-last-job"); id = null; }
        else if (id) localStorage.setItem("cam-last-job", id);
        else id = localStorage.getItem("cam-last-job");
      } catch { /* Explicit links also work without browser storage. */ }
      if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) watchJob(id, !query.get("job"));
      else setRestoring(false);
    }, 0);
    return () => { clearTimeout(restore); stopPolling(); };
  }, [watchJob, stopPolling]);

  useEffect(() => {
    const refreshPricing=()=>{void fetch("/api/account").then(r=>{if(!r.ok)throw Error("Could not open your workspace. Reload this page.");return r.json();}).then(d=>{setConnected(d.connected===true);setPricingReady(d.pricingReady===true);setPricingMode(typeof d.pricingMode==="string"?d.pricingMode:null);}).catch(e=>setError(e.message));};
    refreshPricing();
    window.addEventListener("focus",refreshPricing);
    return ()=>window.removeEventListener("focus",refreshPricing);
  }, []);

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
      })
      .catch(() => setError("Could not load video styles. Please reload the page."))
      .finally(() => setTemplatesLoaded(true));
  }, []);

  async function frame() {
    if (launchInFlight.current) return;
    if (connected && !single && (!currentLaunchCost || currentLaunchCost.expiresAt <= Date.now())) {
      setCostRevision(value => value + 1);
      return;
    }
    launchInFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const body = JSON.stringify({script,mode,previewSource,title:title.trim()||undefined,overrides});
      if(framingAttempt.current?.body!==body)framingAttempt.current={body,id:crypto.randomUUID(),token:connected&&!single?currentLaunchCost!.token:undefined};
      else if(connected&&!single&&!framingAttempt.current.token)framingAttempt.current.token=currentLaunchCost!.token;
      const res = await fetch("/api/productions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({...JSON.parse(body),requestId:framingAttempt.current.id,storyboardLaunchToken:framingAttempt.current.token}),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "STORYBOARD_LAUNCH_EXPIRED" || data.code === "STORYBOARD_LAUNCH_CHANGED") { framingAttempt.current=null; setCostRevision(value=>value+1); }
        if (data.code === "STORYBOARD_LAUNCH_REPRICE_REQUIRED") {
          // Keep the saved script/job and its AI result. A fresh price needs a
          // deliberate click, never an automatic resubmission or a new job.
          if(framingAttempt.current)framingAttempt.current.token=undefined;
          setLaunchCost(null);
          setCostRevision(value=>value+1);
        }
        throw new Error(data.error ?? "Could not prepare your storyboard.");
      }
      if (data.journey === "single-v1" && data.approved === false && data.estimate) { setEstimate({ jobId: data.jobId, ...data.estimate }); return; }
      if (!data.simulation) { router.push(`/production/${data.jobId}`); return; }
      setFraming(data);
      window.history.replaceState(null, "", `/?job=${data.jobId}`);
      try { localStorage.setItem("cam-last-job", data.jobId); } catch { /* Optional draft persistence. */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      launchInFlight.current = false;
      setLoading(false);
    }
  }

  /** One approval: reserves the estimated price on the wallet and launches the complete first version. */
  async function approveEstimate() {
    if (!estimate || launchInFlight.current) return;
    launchInFlight.current = true; setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/jobs/${estimate.jobId}/live`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", quote: estimate.quote, customerQuote: estimate.customerQuote }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Your video could not be started. Your script and estimate are saved.");
      try { localStorage.setItem("cam-last-job", estimate.jobId); } catch { /* Optional persistence. */ }
      router.push(`/production/${estimate.jobId}`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { launchInFlight.current = false; setLoading(false); }
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
    setEstimate(null);
    setJob(null);
    setScript("");
    setPreviewSource("planning");
    setError(null);
  }

  const inputDisabled = framing !== null || job !== null || estimate !== null || restoring || loading || inProgress !== null;
  const settingsDisabled = inputDisabled || previewSource === "existing";
  const framedTemplate = framing ? templates.find((t) => t.slug === framing.params.templateSlug) : undefined;

  if(connected===null)return error?<p role="alert">{error}</p>:<WorkProgress title="Opening CAM" description="Loading your workspace."/>;
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div><p className="kicker">Step 1 · Your script</p><h1 className="page-title">Create a video</h1>
        <p className="text-muted mt-2">
          {single ? "Paste your script. You get one estimate, delay and price; approve it and your complete film is produced. Then watch it and ask for changes until you approve a version." : connected ? "Prepare your storyboard, review the images, then approve the animation price to create your film." : "Prepare your script, review the recording and scenes, then assemble a free preview. Paid generation is disabled in this version."}
        </p></div>
        {/* Category cards (Shimi, 2026-10-25): the illustrations are owner-provided PNGs; a gradient stands in while a file is missing. */}
        <nav aria-label="Video category" className="cats">
          <CategoryCard title="Clay animation" line="A narrator in a warm clay studio." image="/categories/clay.png" tone="clay" selected/>
          <CategoryCard title="Motion design" line="Words and shapes in motion." image="/categories/motion.png" tone="motion" href="/motion/new"/>
          <CategoryCard title="Attack video" line="Comics panels, bold and fast." image="/categories/attack.png" tone="attack" href="/comics/new"/>
        </nav>
      </div>

      {inProgress && <InProgressDialog video={inProgress} onKept={()=>{try{localStorage.removeItem("cam-last-job");}catch{/* Optional persistence. */}setInProgress(null);}} onDeleted={()=>{try{localStorage.removeItem("cam-last-job");}catch{/* Optional persistence. */}setInProgress(null);}} onError={message=>setError(message)}/>}
      {(framing?.conversationId || job?.conversationId) && <a href={`/conversations/${framing?.conversationId || job?.conversationId}`} className="inline-block text-accent text-sm">Open conversation, references and video versions</a>}
      {!job && !framing && <><label className="block text-sm font-medium">Video title<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={80} placeholder="Give your video a short name" className="input block mt-2"/></label></>}
      {/* Step 1: script */}
      {example && !connected && !framing && !job && !restoring && <section className="card border-accent/40 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="section-title">Try the existing CAM film</h2>
            <p className="text-sm text-muted mt-1">12 animated clips, the original recording and timed subtitles. Rebuilt locally in 9:16, with no generation charge.</p>
          </div>
          <span className="text-accent font-mono whitespace-nowrap">$0.00</span>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          {([['narrator', 'Narrator'], ['monster', 'Monster'], ['effigy', 'Effigy']] as const).map(([id, label]) => <div key={id} className="text-center text-xs text-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/recipes/cam-clay/${id}.png`} alt={label} className="w-16 h-20 object-contain bg-surface-2 rounded-lg mb-1" />{label}
          </div>)}
          {example.voiceUrl && <label className="text-xs text-muted space-y-1"><span className="block">Listen to original · existing recording</span><audio aria-label="Existing original voice recording" controls preload="none" src={example.voiceUrl} className="h-9 max-w-full" /></label>}
        </div>
        {example.available ? <div className="flex items-center gap-3">
          <button disabled={previewSource === "existing"} onClick={() => { setScript(example.script); setPreviewSource("existing"); setAspectRatio("9:16"); setError(null); }} className="btn btn-primary btn-sm">{previewSource === "existing" ? "Existing film selected" : "Load CAM example"}</button>
          {previewSource === "existing" && <button onClick={() => { setPreviewSource("planning"); setScript(""); }} className="btn btn-ghost btn-sm">Use my own script</button>}
        </div> : <p role="status" className="text-sm text-muted">{example.reason}</p>}
      </section>}
      {templatesLoaded && templates.length === 0 && (
        <div role="status" className="card text-sm text-muted">
          New CAM video styles are being prepared. Production will be available once the first style is ready.
        </div>
      )}
      <VideoJourney step={0} {...(single?{steps:SINGLE_JOURNEY_STEPS,hint:"Approve the estimate once. Your complete film is produced, then you watch it and ask for changes until you approve a version."}:{})}/>
      <section className="card space-y-4 appear">
        <div className="flex items-center justify-between">
          <h2 className="section-title">1. Your script</h2>

        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <label className="space-y-1">
            <span className="text-muted">Format</span>
            <select
              value={aspectRatio}
              disabled={settingsDisabled}
              onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
              className="input"
            >
              {ASPECTS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </label>
        </div>

        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          disabled={settingsDisabled}
          rows={7}
          placeholder="Paste the narration for your film…"
          className="input"
        />
        <p className="input-count">{script.length} characters</p>
        {connected && !single && !framing && !job && script.trim().length >= 40 && <div className="text-sm" aria-live="polite">
          {currentLaunchCost ? <><p>Storyboard preparation allowance: <strong>${currentLaunchCost.maximumAmountCents/100} USD</strong></p><p className="mt-1 text-xs text-muted">Starting analyses your script and prepares the storyboard within this amount. If its image needs cost more, you see the revised price first. Preparation is included in your final total.</p></> : launchCostError?.input===launchInput ? <p>{launchCostError.message} <button type="button" className="text-accent underline" onClick={()=>setCostRevision(value=>value+1)}>Check again</button></p> : <p role="status" className="text-muted">Checking preparation cost…</p>}
        </div>}
        {!framing && !job && !estimate && (
          <button
            onClick={frame}
            disabled={loading || restoring || (connected&&(!pricingReady||(!single&&!currentLaunchCost))) || templates.length === 0 || script.trim().length < 40}
            className="btn btn-primary"
          >
            {loading ? <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white motion-safe:animate-spin"/>{single ? "Analysing your script…" : "Preparing storyboard…"}</span> : single ? "Get my estimate" : connected ? "Start my video" : previewSource === "existing" ? "Prepare existing film · $0" : "Frame my request"}
          </button>
        )}
      </section>

      {estimate && <section aria-label="Your video estimate" className="card border-accent/40 space-y-4 appear">
        <h2 className="section-title">Your video estimate</h2>
        <p className="text-sm text-muted">Your script is analysed: {estimate.sceneCount} scenes. Approving starts the whole film; you will watch the complete version and ask for changes from there.</p>
        <div className="grid sm:grid-cols-2 gap-4"><div className="rounded-lg border border-line p-4"><p className="text-sm text-muted">Estimated delay</p><p className="text-3xl font-semibold">about {estimate.minutes} minutes</p></div><div className="rounded-lg border border-line p-4"><p className="text-sm text-muted">Price of your film</p><p className="text-3xl font-semibold">${estimate.amountCents/100} USD</p><p className="text-xs text-muted mt-2">Reserved on approval, charged once you approve a version. Available: ${(estimate.availableCents/100).toFixed(2)} USD.</p></div></div>
        {estimate.availableCents < estimate.amountCents && <p role="status" className="text-sm">Your balance is too low for this film. <Link href="/credits" className="text-accent underline">View your balance</Link>, then approve.</p>}
        <div className="flex flex-wrap gap-4 items-center">
          <button onClick={() => void approveEstimate()} disabled={loading || estimate.availableCents < estimate.amountCents} className="btn btn-primary">{loading ? "Starting your video…" : "Approve & start my video"}</button>
          <button onClick={() => { setEstimate(null); void frame(); }} disabled={loading} className="btn btn-ghost btn-sm">Refresh the estimate</button>
          <button onClick={reset} disabled={loading} className="btn btn-ghost btn-sm">Change my script</button>
        </div>
      </section>}

      {loading && !estimate && <WorkProgress title={single ? "Analysing your script" : "Preparing your storyboard"} description={single ? "Reading your script scene by scene and pricing your film. Nothing is generated yet." : "Organizing your scenes and preparing the images. Your storyboard opens automatically."}/>}

      {connected&&!pricingReady&&<p role="status" className="card text-sm">Your CAM credit pricing is being set up by Bina. You can write your script; production will be available once your price is configured.</p>}

      {error && (
        <div className="border border-danger/40 bg-danger/10 text-danger rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Step 2: framing + estimate */}
      {framing && !job && (
        <section className="card space-y-4 appear">
          <h2 className="section-title">{framing.preparation?.quote ? "2. Scene plan & quote preparation" : "2. Framing & price"}</h2>
          {framing.simulation && <p className="text-sm text-muted">{framing.media ? "Existing animated characters and the original recording will be assembled locally. No new media will be generated. No credits will be deducted." : "Free local preview. Choose a test voice and add visuals below. The prices are provisional estimates for future generation; this preview costs $0."}</p>}
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
              className="btn btn-primary"
            >
              {framing.media ? "Rebuild existing film · $0" : framing.simulation ? "Run free preview" : `Confirm & produce · $${framing.estimate.totalBilledUsd.toFixed(2)}`}
            </button>
            <button onClick={reset} disabled={loading || preparationBusy} className="btn btn-ghost">
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* Step 3: production progress + result */}
      {job && (
        <section className="card space-y-4 appear">
          <h2 className="section-title">3. Production</h2>
          {job.canResume && <div role="status" className="bg-surface-2 border border-accent/40 rounded-lg p-4 space-y-3">
            <p className="text-sm">{job.interrupted ? "This preview was interrupted. Resume it using the saved script and media." : "You can retry this local preview after fixing the issue below."} A completed render will be reused if its files are unchanged. No credits will be charged.</p>
            <button onClick={resume} disabled={loading || !requestsReady} className="btn btn-primary btn-sm">{loading ? "Resuming…" : "Resume free preview"}</button>
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
              <div className="stage"><video
                src={job.outputUrl}
                controls
                className="max-h-[60vh] max-w-full w-auto mx-auto"
              /></div>
              {job.simulation ? <p className="text-sm text-muted">{job.media ? "Film rebuilt from the existing CAM characters and original recording, with timed subtitles. No credits were deducted. A new script needs its own voice and scenes." : job.preparation?.narration?.selected ? "Preview assembled with the reviewed imported recording and supplied word timings. Missing scene visuals remain placeholders. No credits were deducted." : "Free preview complete. Added visuals and the selected test voice are included; empty scenes remain placeholders. Subtitle word positions are approximate. No credits were deducted."}</p> : <p className="text-sm text-muted">
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
                <p>Voice, word timing, approved images, animation and montage have been connected and checked offline. The audio here is a local test recording.</p>
                <video aria-label="Complete offline production test" controls preload="metadata" src={job.artifacts.find((a) => a.label === "Offline sequence test video (test voice)")!.url} className="rounded-lg max-h-80 max-w-full mx-auto bg-black" />
                <p className="text-muted">This test uses marked calibration images and simulated approvals. Word timing is approximate. A new narration recording, creative review and real provider quotes are still required. No paid request or trial was started.</p>
              </details>}
              {job.id && <FormatDownloads jobId={job.id} />}
              {job.artifacts && <details className="border border-line rounded-lg p-4"><summary className="cursor-pointer text-sm font-medium">Audio, subtitles and production documents</summary><div className="flex flex-wrap gap-3 text-sm mt-3">{job.artifacts.map((artifact) => <a key={artifact.url} href={artifact.url} target="_blank" className="text-accent hover:underline">{artifact.label} ↗</a>)}</div></details>}
            </div>
          )}

          {(job.status === "succeeded" || job.status === "failed" || job.interrupted) && (
            <button
              onClick={reset}
              className="btn btn-secondary"
            >
              New production
            </button>
          )}
        </section>
      )}
      {job?.preparation && (job.status === "succeeded" ? <details className="card space-y-4"><summary className="cursor-pointer font-medium">Review the scenes and recording used</summary><PreparationReview preparation={job.preparation} /></details> : <PreparationReview preparation={job.preparation} />)}

      {/* Dry-run: production sheet (debug view of the exact fal.ai requests) */}
      {job?.status === "succeeded" && job.sheet && job.sheet.length > 0 && (
        <details className="card space-y-4 appear">
          <summary className="cursor-pointer font-medium">Production notes and media sources</summary>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="section-title">{job.media ? "Reused media" : "Production sheet (dry-run)"}</h2>
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
                    className="btn btn-ghost btn-sm"
                  >
                    Copy prompt
                  </button>
                </div>
              </details>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
