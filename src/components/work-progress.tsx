"use client";
import {useEffect,useState} from "react";
/** Indeterminate feedback follows the real request lifetime, never simulated stages. */
export function WorkProgress({title="Preparing your scenes",description="CAM is turning your script into a scene plan. Keep this page open; the result will appear here."}:{title?:string;description?:string}){
 const [takingLonger,setTakingLonger]=useState(false);
 useEffect(()=>{const timer=setTimeout(()=>setTakingLonger(true),30000);return()=>clearTimeout(timer);},[]);
 return <div role="status" aria-live="polite" aria-atomic="true" className="rounded-xl border border-accent/30 bg-accent-soft p-5 space-y-4">
  <div className="flex items-start gap-4"><span aria-hidden="true" className="mt-0.5 inline-block h-7 w-7 shrink-0 rounded-full border-[3px] border-accent/20 border-t-accent motion-safe:animate-spin"/><div><p className="font-medium">{title}…</p><p className="text-sm text-muted mt-1">{description}</p></div></div>
  <div aria-hidden="true" className="grid grid-cols-3 gap-2">{[0,1,2].map(i=><div key={i} className="h-1.5 rounded-full bg-accent/35 motion-safe:animate-pulse" style={{animationDelay:`${i*250}ms`}}/>)}</div>
  {takingLonger&&<p className="text-sm text-muted">Still waiting for the result. Longer scripts can take more time. There is no need to click again.</p>}
 </div>;
}
