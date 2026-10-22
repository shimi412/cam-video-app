import type { Selection } from "@/lib/concept/model-selection";

export function ProductionModelSelection({selection}:{selection:Selection;isAdmin:boolean}) {
 return <section className="rounded-xl border border-line bg-surface p-5 space-y-4" aria-label="Production analysis">
  <div><h2 className="font-medium">Production analysis</h2><p className="text-sm text-muted mt-1">Each scene is checked before production. {selection.workflow==="draft-first"?"480p draft and human review before 1080p completion. ":""}Minimum source quality: {selection.minimumResolution}. Your storyboard approval is still required before animation.</p></div>
  {selection.scenes.length===0?<p className="text-sm">Existing scenes will be reused. No new animation is quoted.</p>:<ol className="space-y-3">{selection.scenes.map(scene=>{
   const chosen=scene.candidates.find(c=>c.model===scene.selected)!;
   return <li key={scene.operation} className="rounded-lg border border-line p-4 space-y-2"><p className="font-medium text-sm">Scene {scene.scene} · {chosen.resolution}</p><p className="text-sm text-muted">{scene.reason}</p>{scene.localText&&<p className="text-sm text-muted">Text is animated during editing, with no additional AI generation.</p>}
   </li>;
  })}</ol>}
  <p className="text-xs text-muted">These are compatibility checks, not a guarantee of visual quality. The selected workflow is fully quoted: one final attempt, or one draft plus one completion. Rejected drafts stop production; extra attempts require a new quote. No paid trial runs automatically.</p>
 </section>;
}
