"use client";
import type { SceneDirection } from "@/lib/concept/types";

export function SceneEditor({scene,disabled,onSave}:{scene:SceneDirection&{index:number;narration:string};disabled:boolean;onSave:(direction:SceneDirection)=>Promise<void>}){
 return <details className="border border-line rounded-lg p-4"><summary className="cursor-pointer text-sm font-medium">Scene {scene.index} · {scene.narration}</summary>
  <form className="space-y-3 mt-4" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void onSave({scene:String(form.get("scene")),motion:String(form.get("motion")),endScene:String(form.get("endScene")??"").trim()||null,overlay:String(form.get("overlay")??"").trim()||null,strike:form.get("strike")==="on",references:form.getAll("references") as SceneDirection["references"]});}}>
   <fieldset disabled={disabled} className="space-y-3">
    <label className="block text-sm">Starting image<textarea name="scene" required maxLength={3000} defaultValue={scene.scene} rows={3} className="block mt-2 w-full bg-surface-2 border border-line rounded p-3"/></label>
    <label className="block text-sm">Movement<textarea name="motion" required maxLength={2000} defaultValue={scene.motion} rows={2} className="block mt-2 w-full bg-surface-2 border border-line rounded p-3"/></label>
    <label className="block text-sm">Ending image · optional<textarea name="endScene" maxLength={3000} defaultValue={scene.endScene??""} rows={2} className="block mt-2 w-full bg-surface-2 border border-line rounded p-3"/></label>
    <div className="flex gap-4 flex-wrap text-sm"><span>Characters</span>{(["narrator","monster","effigy"] as const).map(character=><label key={character} className="flex gap-2"><input type="checkbox" name="references" value={character} defaultChecked={scene.references.includes(character)}/>{character}</label>)}</div>
    <label className="block text-sm">On-screen title · optional<input name="overlay" maxLength={100} defaultValue={scene.overlay??""} className="block w-full mt-2 bg-surface-2 border border-line rounded p-3"/></label>
    <label className="flex gap-2 text-sm"><input name="strike" type="checkbox" defaultChecked={scene.strike}/>Cross out the title</label>
    <button className="text-sm text-accent">Save scene · no generation</button>
   </fieldset>
  </form>
 </details>;
}
