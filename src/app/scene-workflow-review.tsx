"use client";
import type { Stage, WorkflowView } from "@/lib/concept/scene-workflow";

export type WorkflowChange = { workflow: { scene: number; stage: Stage; target: string; decision: "approved" | "rejected"; note: string } } | { useAnimation: number; target: string };
const names = { direction: "Scene direction", start: "Start image", end: "End image", clip: "Animation" };
const labels: Record<string, string> = { approved: "Approved", pending: "Needs review", missing: "Add a file", blocked: "Waiting for previous step", rejected: "Rejected", stale: "Changed · review again", "not-needed": "Not needed" };
export function SceneWorkflowReview({ workflow, editable, disabled, save, onError }: {
  workflow: WorkflowView; editable: boolean; disabled: boolean; save: (body: FormData | WorkflowChange) => Promise<boolean>; onError: (error: string) => void;
}) {
  return <details className="border border-line rounded-lg p-3" aria-label={`Step-by-step review for scene ${workflow.scene}`}>
    <summary className="cursor-pointer font-medium">Step-by-step scene review · {workflow.completed}/{workflow.required} approved</summary>
    <p className="text-xs text-muted mt-2">Review the direction, then the start image, optional end image and animation. Use existing local files to test these steps. Nothing is generated or charged.</p>
    <ol className="space-y-3 mt-3">{workflow.stages.map((step, index) => <li key={step.stage} className="bg-surface rounded p-3 space-y-2">
      <p className="font-medium">{index + 1}. {names[step.stage]} · {labels[step.status]}</p>
      {step.blockedReason && <p className="text-xs text-muted">{step.blockedReason}</p>}
      {step.required && step.media && (step.media.kind === "video" ? <video aria-label={`Scene ${workflow.scene} animation review`} src={step.media.url} controls muted preload="metadata" className="max-h-44 max-w-full rounded" /> :
        // eslint-disable-next-line @next/next/no-img-element
        <img src={step.media.url} alt={`Scene ${workflow.scene} ${names[step.stage]}`} className="max-h-44 max-w-full rounded object-contain" />)}
      {step.note && <p className="text-xs" dir="auto">{step.note}</p>}
      {editable && step.canReview && <form key={step.target + step.status} className="space-y-2" onSubmit={(e) => {
        e.preventDefault();
        const decision = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
        const note = String(new FormData(e.currentTarget).get("note") ?? "").trim();
        if (decision !== "approved" && decision !== "rejected") return;
        if (decision === "rejected" && !note) { onError("Add a reason for rejecting this step."); return; }
        void save({ workflow: { scene: workflow.scene, stage: step.stage, target: step.target, decision, note } });
      }}>
        <fieldset disabled={disabled} className="space-y-2">
          <label className="block text-xs">Review note<input name="note" aria-label={`Scene ${workflow.scene} ${step.stage} review note`} maxLength={1000} className="block w-full bg-surface-2 border border-line rounded p-2 mt-1" /></label>
          <div className="flex gap-4 text-xs">
            <button type="submit" value="approved" className="text-accent">Approve {names[step.stage].toLowerCase()} · scene {workflow.scene}</button>
            <button type="submit" value="rejected" className="text-danger">Reject {names[step.stage].toLowerCase()} · scene {workflow.scene}</button>
          </div>
        </fieldset>
      </form>}
      {editable && step.stage !== "direction" && step.uploadTarget && step.required && <label className="block text-xs text-muted">{step.media ? "Replace" : "Add"} {names[step.stage].toLowerCase()} · local file, max. 32 MB
        <input type="file" aria-label={`Scene ${workflow.scene} ${step.stage} file`} accept={step.stage === "clip" ? "video/mp4" : "image/png,image/jpeg,image/webp"} disabled={disabled} className="block mt-2 max-w-full text-xs" onChange={(e) => {
          const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
          if (file.size > 32 * 1024 * 1024) { onError("Choose a file smaller than 32 MB."); return; }
          const form = new FormData(); form.set("scene", String(workflow.scene)); form.set("stage", step.stage); form.set("target", step.uploadTarget!); form.set("file", file); void save(form);
        }} />
      </label>}
      {editable && step.stage === "clip" && step.status === "approved" && <button disabled={disabled} onClick={() => void save({ useAnimation: workflow.scene, target: step.target })} className="rounded bg-accent text-white px-3 py-2 text-xs disabled:opacity-40">Use approved animation in preview · scene {workflow.scene}</button>}
    </li>)}</ol>
    <p className="text-xs text-muted mt-3">Changing an earlier approval invalidates later steps and removes a selected animation from the preview. Animation review checks the visuals; synchronization still needs the final narration recording.</p>
  </details>;
}
