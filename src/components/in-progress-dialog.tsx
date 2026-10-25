"use client";
import {useState} from "react";
import Link from "next/link";

export type InProgressVideo={id:string;title:string|null;status:string;live:boolean;href:string};

/** Shimi, 2026-10-25: the home page never traps the client in a video. When a video is remembered as in
 * progress, this dialog offers to continue it, keep it in My videos and start a new one, or delete it. */
export function InProgressDialog({video,onKept,onDeleted,onError}:{video:InProgressVideo;onKept:()=>void;onDeleted:()=>void;onError:(message:string)=>void}){
 const [busy,setBusy]=useState<"keep"|"delete"|null>(null);
 const [confirming,setConfirming]=useState(false);
 const state=video.status==="succeeded"?"finished":video.status==="failed"?"stopped":"in progress";
 const keep=async()=>{setBusy("keep");try{const r=await fetch(`/api/jobs/${video.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({savedToLibrary:true})});if(!r.ok)throw new Error("Could not save this video. Please try again.");onKept();}catch(e){onError(e instanceof Error?e.message:"Could not save this video.");}finally{setBusy(null);}};
 const remove=async()=>{setBusy("delete");try{const r=await fetch(`/api/jobs/${video.id}`,{method:"DELETE"});if(!r.ok)throw new Error("Could not delete this video. Please try again.");onDeleted();}catch(e){onError(e instanceof Error?e.message:"Could not delete this video.");}finally{setBusy(null);}};
 return <section role="dialog" aria-modal="false" aria-labelledby="in-progress-title" className="rounded-xl border border-accent/40 bg-surface p-5 space-y-4 shadow-sm">
  <div><h2 id="in-progress-title" className="text-xl font-semibold">You have a video {state}</h2>
   <p className="text-sm text-muted mt-1">{video.title||"Your video"} · {video.status==="succeeded"?"ready to download":video.status==="failed"?"stopped":"its progress is saved"}. Continue it, keep it in My videos and start a new one, or delete it.</p></div>
  {!confirming?<div className="flex flex-wrap gap-3 items-center">
   <Link href={video.href} className="rounded-lg bg-accent px-4 py-2 text-white">Continue this video</Link>
   <button type="button" disabled={busy!==null} onClick={()=>void keep()} className="rounded-lg border border-line px-4 py-2 text-accent disabled:opacity-40">{busy==="keep"?"Saving…":"Keep it in My videos & start a new one"}</button>
   <button type="button" disabled={busy!==null} onClick={()=>setConfirming(true)} className="rounded-lg px-4 py-2 text-danger disabled:opacity-40">Delete this video</button>
  </div>:<div className="rounded-lg border border-danger/40 p-4 space-y-3">
   <p className="text-sm">Delete “{video.title||"Your video"}”? Its scenes and versions are removed and any amount still reserved for it is released to your balance. This cannot be undone.</p>
   <div className="flex flex-wrap gap-3"><button type="button" disabled={busy!==null} onClick={()=>void remove()} className="rounded-lg bg-danger px-4 py-2 text-white disabled:opacity-40">{busy==="delete"?"Deleting…":"Yes, delete it"}</button><button type="button" disabled={busy!==null} onClick={()=>setConfirming(false)} className="rounded-lg border border-line px-4 py-2 disabled:opacity-40">Keep it</button></div>
  </div>}
 </section>;
}
