"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

type Picture={url:string;kind:"image"|"video";width:number;height:number};
export type StoryboardView={target:string;retrospective:boolean;status:"pending"|"approved"|"rejected";note:string|null;rejectedScene:number|null;
 panels:{scene:number;narration:string;meaning:string;startScene:string;endScene:string|null;motion:string;actionSeconds:number;start:Picture|null;end:Picture|null;existing:Picture|null}[]};
function Frame({picture,label}:{picture:Picture;label:string}){
 return <figure className="min-w-0"><figcaption className="text-xs text-muted mb-2">{label}</figcaption>{picture.kind==="video"
  ?<video controls preload="metadata" src={picture.url} className="w-full max-h-72 object-contain rounded-lg"/>
  :<a href={picture.url} target="_blank" rel="noreferrer" aria-label={`Open ${label} at full size`}><Image unoptimized src={picture.url} width={picture.width} height={picture.height} alt={label} className="w-full h-auto max-h-72 object-contain rounded-lg"/></a>}</figure>;
}
export function StoryboardReview({sheet,active,disabled,conversationId,onReview}:{sheet:StoryboardView;active:boolean;disabled:boolean;conversationId:string;onReview:(decision:"approved"|"rejected",note:string)=>Promise<unknown>}){
 const [confirmed,setConfirmed]=useState(false),[note,setNote]=useState("");
 return <section className="rounded-xl border border-accent/40 bg-surface p-5 space-y-5" aria-label="Storyboard review">
  <div><h2 className="text-xl font-semibold">Storyboard · review the story before animation</h2><p className="text-sm text-muted mt-2">Read the scenes together. Do the images clearly explain the narration? Check the meaning, order and physical action. Budget approval does not approve the storyboard.</p></div>
  {sheet.retrospective&&<p className="text-sm text-muted">These images document the existing film. They are not a storyboard approved before production.</p>}
  {sheet.status==="rejected"&&<div role="status" className="rounded-lg border border-danger/40 p-4"><p className="font-medium text-danger">Changes requested{sheet.rejectedScene?` · Scene ${sheet.rejectedScene}`:""}</p><p className="text-sm mt-2 whitespace-pre-wrap">{sheet.note}</p><p className="text-sm mt-2">The film is not approved for delivery. Review a revised storyboard before any new animation.</p></div>}
  <p className="text-xs text-muted">Select an image to inspect it at full size.</p>
  <ol className="grid sm:grid-cols-3 gap-4">{sheet.panels.map(p=><li key={p.scene} className={`rounded-lg border p-4 space-y-3 ${sheet.rejectedScene===p.scene?"border-danger/60":"border-line"}`}>
   <h3 className="font-medium">Scene {p.scene}</h3><p className="text-sm font-medium" dir="auto">“{p.narration}”</p>
   <div className="grid grid-cols-2 gap-3">{p.start&&<Frame picture={p.start} label={`Scene ${p.scene} · start`}/>} {p.end&&<Frame picture={p.end} label={`Scene ${p.scene} · end`}/>} {p.existing&&<Frame picture={p.existing} label={`Scene ${p.scene} · existing media`}/>}</div>
   <div><p className="text-xs font-semibold text-accent uppercase tracking-wide">What the viewer should understand</p><p className="text-sm mt-1">{p.meaning}</p></div>
   <details><summary className="cursor-pointer text-sm">Action and framing · {p.actionSeconds} s</summary><p className="text-sm text-muted mt-2">Start: {p.startScene}</p><p className="text-sm text-muted mt-2">Movement: {p.motion}</p>{p.endScene&&<p className="text-sm text-muted mt-2">End: {p.endScene}</p>}</details>
  </li>)}</ol>
  {active&&sheet.status==="pending"&&<div className="border-t border-line pt-4 space-y-4">
   <p className="text-sm">Animation is paused until you approve this complete storyboard.</p>
   <label className="flex gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={disabled}/>I approve what every scene communicates, the sequence, and the start and end images.</label>
   <label className="block text-sm">Changes to request<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={2000} rows={3} disabled={disabled} placeholder="For example: Scene 3 does not explain how context changes the interpretation." className="mt-2 block w-full rounded-lg border border-line bg-surface-2 p-3"/></label>
   <div className="flex flex-wrap gap-4"><button disabled={disabled||!confirmed} onClick={()=>void onReview("approved",note)} className="bg-accent text-white rounded-lg px-4 py-2 disabled:opacity-40">Approve storyboard & animate</button><button disabled={disabled||note.trim().length<5} onClick={()=>void onReview("rejected",note)} className="text-danger text-sm disabled:opacity-40">Request changes · stop before animation</button></div>
  </div>}
  {sheet.status==="approved"&&<p className="text-sm text-accent">Storyboard approved. This approval applies to these images and this story only.</p>}
  {sheet.status==="rejected"&&<Link href={`/conversations/${conversationId}`} className="inline-block text-sm text-accent">Return to the conversation to prepare a revised version</Link>}
 </section>;
}
