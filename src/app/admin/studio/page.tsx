"use client";
import {useCallback,useEffect,useState} from "react";
type Mission={id:string;jobId:string;category:string;version:number;title:string;script:string;feedback:{text:string;scene?:number;seconds?:number}[];priceCents:number;state:string;notes:string|null;createdAt:string;deliveredAt:string|null};
/** Option C (2026-10-26): the film behind each mission, as the admin needs it to price the next version. */
type Film={phase:string;version:number;pendingStudioQuote:boolean;quotedUsd:number|null;delayMinutes:number|null;lockedNotes:{text:string;targets:number[]}[]};
type Category="clay"|"motion"|"comics";type Mode="engine"|"studio";type Fulfilment=Record<Category,Mode>;
const CATEGORIES:{key:Category;label:string}[]=[{key:"comics",label:"Attack"},{key:"clay",label:"Clay"},{key:"motion",label:"Motion"}];
const feedbackLine=(f:{text:string;scene?:number;seconds?:number})=>`${f.scene?`Scene ${f.scene}: `:f.seconds!==undefined?`At ${f.seconds.toFixed(1)} s: `:""}${f.text}`;
const noteLine=(n:{text:string;targets:number[]})=>`${n.targets.length===1?`Scene ${n.targets[0]}: `:""}${n.text}`;
function CopyButton({label,text}:{label:string;text:string}){
 const [done,setDone]=useState(false);
 return <button type="button" className="rounded-lg border border-line px-3 py-1 text-xs" onClick={()=>{void navigator.clipboard.writeText(text).then(()=>{setDone(true);setTimeout(()=>setDone(false),1500);});}}>{done?"Copied":label}</button>;
}
export default function StudioPage(){
 const [missions,setMissions]=useState<Mission[]>([]);const [films,setFilms]=useState<Record<string,Film>>({});const [fulfilment,setFulfilment]=useState<Fulfilment|null>(null);const [busy,setBusy]=useState<string|null>(null);const [error,setError]=useState<string|null>(null);
 const load=useCallback(()=>{fetch("/api/admin/studio").then(r=>r.json()).then(d=>{setMissions(d.missions??[]);setFilms(d.films??{});if(d.fulfilment)setFulfilment(d.fulfilment);}).catch(()=>{});},[]);
 useEffect(()=>{load();const t=setInterval(load,15000);return()=>clearInterval(t);},[load]);
 const act=async(id:string,form:FormData)=>{setBusy(id);setError(null);form.set("id",id);const r=await fetch("/api/admin/studio",{method:"POST",body:form});const d=await r.json().catch(()=>({}));if(!r.ok)setError(d.error??"The action failed.");setBusy(null);load();};
 const switchMode=async(category:Category,mode:Mode)=>{setBusy(category);setError(null);const r=await fetch("/api/admin/studio/fulfilment",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({category,mode})});const d=await r.json().catch(()=>({}));if(!r.ok)setError(d.error??"The mode could not be saved.");else if(d.fulfilment)setFulfilment(d.fulfilment);setBusy(null);};
 // The latest mission of each film carries the quote form: the film is in review and the client's notes are locked.
 const latest=new Set(Object.values(missions.reduce<Record<string,Mission>>((acc,m)=>{if(!acc[m.jobId]||acc[m.jobId].version<m.version)acc[m.jobId]=m;return acc;},{})).map(m=>m.id));
 return <main className="mx-auto max-w-5xl p-6 space-y-6">
  <h1 className="text-2xl font-semibold">Studio missions</h1>
  <p className="text-sm text-muted">Each row is one client version to produce. Upload the finished MP4 (9:16); the client then reviews it on their page. Clients see only “in production” and “ready”. When the client applies feedback, set the price and delay of the next version here.</p>
  {error&&<p role="alert" className="text-danger">{error}</p>}
  <section className="rounded-xl border border-line p-4 space-y-3">
   <h2 className="font-semibold">Fulfilment per category</h2>
   <p className="text-sm text-muted">Engine: the in-app engine produces the versions. Studio: the category goes through the studio creation screen; each approved version becomes a mission delivered here. The mode is fixed when a film is created; running films keep theirs.</p>
   <div className="flex flex-wrap gap-6">{CATEGORIES.map(c=><label key={c.key} className="flex items-center gap-2 text-sm">{c.label}<select aria-label={`${c.label} fulfilment`} className="rounded-lg border border-line px-2 py-1" disabled={!fulfilment||busy===c.key} value={fulfilment?.[c.key]??"engine"} onChange={e=>void switchMode(c.key,e.target.value as Mode)}><option value="engine">engine</option><option value="studio">studio</option></select></label>)}</div>
  </section>
  {missions.length===0&&<p>No mission yet.</p>}
  {missions.map(m=>{const film=films[m.jobId],notes=film?.lockedNotes??[],canQuote=m.state==="delivered"&&latest.has(m.id)&&film?.phase==="review"&&notes.length>0;
   return <section key={m.id} className={`rounded-xl border p-4 space-y-3 ${film?.pendingStudioQuote&&latest.has(m.id)?"border-accent":"border-line"}`}>
   <div className="flex flex-wrap items-baseline gap-3"><h2 className="font-semibold">{m.title} · {m.category} · V{m.version}</h2><span className="text-sm">{(m.priceCents/100).toFixed(0)} $</span><span className={`text-sm ${m.state==="delivered"?"text-accent":"text-muted"}`}>{m.state}</span><span className="text-xs text-muted">{new Date(m.createdAt).toLocaleString()}</span>{film?.pendingStudioQuote&&latest.has(m.id)&&<span className="text-sm font-medium text-accent">Client waiting for the price of V{film.version+1}</span>}</div>
   <details><summary className="cursor-pointer text-sm">Script <CopyButton label="Copy script" text={m.script}/></summary><pre className="whitespace-pre-wrap text-sm bg-surface-2 p-3 rounded-lg">{m.script}</pre></details>
   {m.feedback.length>0&&<div className="text-sm"><p className="font-medium">Client feedback for this version <CopyButton label="Copy notes" text={m.feedback.map(feedbackLine).join("\n")}/></p><ul className="list-disc pl-5">{m.feedback.map((f,i)=><li key={i}>{feedbackLine(f)}</li>)}</ul></div>}
   {m.state!=="delivered"&&<form className="flex flex-wrap items-center gap-3" onSubmit={e=>{e.preventDefault();void act(m.id,new FormData(e.currentTarget));}}>
    {m.state==="queued"&&<button type="button" disabled={busy===m.id} className="rounded-lg border border-line px-3 py-2 text-sm" onClick={()=>{const f=new FormData();f.set("action","start");void act(m.id,f);}}>Mark in production</button>}
    <input type="file" name="film" accept="video/mp4" required className="text-sm"/>
    <input type="text" name="notes" placeholder="Notes shown to the client (optional)" className="rounded-lg border border-line px-3 py-2 text-sm min-w-72"/>
    <button type="submit" disabled={busy===m.id} className="rounded-lg bg-accent px-4 py-2 text-white disabled:opacity-40">Deliver version</button>
   </form>}
   {m.state==="delivered"&&<p className="text-sm">Delivered {m.deliveredAt?new Date(m.deliveredAt).toLocaleString():""}{m.notes?` · notes: ${m.notes}`:""}</p>}
   {canQuote&&<div className="space-y-2 text-sm border-t border-line pt-3">
    <p className="font-medium">Client notes on V{film.version} (locked) <CopyButton label="Copy notes" text={notes.map(noteLine).join("\n")}/> <CopyButton label="Copy script + notes" text={`${m.script}\n\nClient notes on V${film.version}:\n${notes.map(noteLine).join("\n")}`}/></p>
    <ul className="list-disc pl-5">{notes.map((n,i)=><li key={i}>{noteLine(n)}</li>)}</ul>
    {film.quotedUsd!==null&&<p className="text-muted">Quoted: {film.quotedUsd} $, {film.delayMinutes} min. The client sees this card now; a new quote replaces it.</p>}
    <form className="flex flex-wrap items-center gap-3" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);f.set("action","quote");void act(m.jobId,f);}}>
     <span>Next version (V{film.version+1}):</span>
     <label className="flex items-center gap-1">price (USD)<input type="number" name="priceUsd" min={0} max={1000} step={1} required defaultValue={film.quotedUsd??5} className="rounded-lg border border-line px-2 py-1 w-24"/></label>
     <label className="flex items-center gap-1">delay (minutes)<input type="number" name="delayMinutes" min={1} max={10080} step={1} required defaultValue={film.delayMinutes??45} className="rounded-lg border border-line px-2 py-1 w-24"/></label>
     <button type="submit" disabled={busy===m.jobId} className="rounded-lg bg-accent px-4 py-2 text-white disabled:opacity-40">Send price to client</button>
    </form>
   </div>}
  </section>;})}
 </main>;
}
