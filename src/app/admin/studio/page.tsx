"use client";
import {useCallback,useEffect,useState} from "react";
type Mission={id:string;jobId:string;category:string;version:number;title:string;script:string;feedback:{text:string;scene?:number;seconds?:number}[];priceCents:number;state:string;notes:string|null;createdAt:string;deliveredAt:string|null};
type Category="clay"|"motion"|"comics";type Mode="engine"|"studio";type Fulfilment=Record<Category,Mode>;
const CATEGORIES:{key:Category;label:string;wired:boolean}[]=[{key:"comics",label:"Attack",wired:true},{key:"clay",label:"Clay",wired:false},{key:"motion",label:"Motion",wired:false}];
export default function StudioPage(){
 const [missions,setMissions]=useState<Mission[]>([]);const [fulfilment,setFulfilment]=useState<Fulfilment|null>(null);const [busy,setBusy]=useState<string|null>(null);const [error,setError]=useState<string|null>(null);
 const load=useCallback(()=>{fetch("/api/admin/studio").then(r=>r.json()).then(d=>{setMissions(d.missions??[]);if(d.fulfilment)setFulfilment(d.fulfilment);}).catch(()=>{});},[]);
 useEffect(()=>{load();const t=setInterval(load,15000);return()=>clearInterval(t);},[load]);
 const act=async(id:string,form:FormData)=>{setBusy(id);setError(null);form.set("id",id);const r=await fetch("/api/admin/studio",{method:"POST",body:form});const d=await r.json().catch(()=>({}));if(!r.ok)setError(d.error??"Delivery failed.");setBusy(null);load();};
 const switchMode=async(category:Category,mode:Mode)=>{setBusy(category);setError(null);const r=await fetch("/api/admin/studio/fulfilment",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({category,mode})});const d=await r.json().catch(()=>({}));if(!r.ok)setError(d.error??"The mode could not be saved.");else if(d.fulfilment)setFulfilment(d.fulfilment);setBusy(null);};
 return <main className="mx-auto max-w-5xl p-6 space-y-6">
  <h1 className="text-2xl font-semibold">Studio missions</h1>
  <p className="text-sm text-muted">Each row is one client version to produce. Upload the finished MP4 (9:16); the client then reviews it on their page. Clients see only “in production” and “ready”.</p>
  {error&&<p role="alert" className="text-danger">{error}</p>}
  <section className="rounded-xl border border-line p-4 space-y-3">
   <h2 className="font-semibold">Fulfilment per category</h2>
   <p className="text-sm text-muted">Engine: the in-app engine produces the versions. Studio: each approved version becomes a mission for the local executor (Claude Code), delivered here. The mode is fixed when a film is created; running films keep theirs.</p>
   <div className="flex flex-wrap gap-6">{CATEGORIES.map(c=><label key={c.key} className="flex items-center gap-2 text-sm">{c.label}<select aria-label={`${c.label} fulfilment`} className="rounded-lg border border-line px-2 py-1" disabled={!fulfilment||busy===c.key} value={fulfilment?.[c.key]??"engine"} onChange={e=>void switchMode(c.key,e.target.value as Mode)}><option value="engine">engine</option><option value="studio">studio</option></select>{!c.wired&&<span className="text-xs text-muted">(client journey not wired yet: the setting is saved, the engine still runs)</span>}</label>)}</div>
  </section>
  {missions.length===0&&<p>No mission yet.</p>}
  {missions.map(m=><section key={m.id} className="rounded-xl border border-line p-4 space-y-3">
   <div className="flex flex-wrap items-baseline gap-3"><h2 className="font-semibold">{m.title} · {m.category} · V{m.version}</h2><span className="text-sm">{(m.priceCents/100).toFixed(0)} $</span><span className={`text-sm ${m.state==="delivered"?"text-accent":"text-muted"}`}>{m.state}</span><span className="text-xs text-muted">{new Date(m.createdAt).toLocaleString()}</span></div>
   <details><summary className="cursor-pointer text-sm">Script</summary><pre className="whitespace-pre-wrap text-sm bg-surface-2 p-3 rounded-lg">{m.script}</pre></details>
   {m.feedback.length>0&&<div className="text-sm"><p className="font-medium">Client feedback for this version</p><ul className="list-disc pl-5">{m.feedback.map((f,i)=><li key={i}>{f.scene?`Scene ${f.scene}: `:f.seconds!==undefined?`At ${f.seconds.toFixed(1)} s: `:""}{f.text}</li>)}</ul></div>}
   {m.state!=="delivered"&&<form className="flex flex-wrap items-center gap-3" onSubmit={e=>{e.preventDefault();void act(m.id,new FormData(e.currentTarget));}}>
    {m.state==="queued"&&<button type="button" disabled={busy===m.id} className="rounded-lg border border-line px-3 py-2 text-sm" onClick={()=>{const f=new FormData();f.set("action","start");void act(m.id,f);}}>Mark in production</button>}
    <input type="file" name="film" accept="video/mp4" required className="text-sm"/>
    <input type="text" name="notes" placeholder="Notes shown to the client (optional)" className="rounded-lg border border-line px-3 py-2 text-sm min-w-72"/>
    <button type="submit" disabled={busy===m.id} className="rounded-lg bg-accent px-4 py-2 text-white disabled:opacity-40">Deliver version</button>
   </form>}
   {m.state==="delivered"&&<p className="text-sm">Delivered {m.deliveredAt?new Date(m.deliveredAt).toLocaleString():""}{m.notes?` · notes: ${m.notes}`:""}</p>}
  </section>)}
 </main>;
}
