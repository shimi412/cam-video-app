"use client";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {WorkProgress} from "@/components/work-progress";
/** Option C (Shimi, 2026-10-26): the three categories share this creation form (studio mode). The copy names the
 * category, never the production method. Reference images are uploaded to the video right after it is created. */
export const CATEGORY_COPY={clay:{title:"Create a Clay animation",line:"A narrator in a warm clay studio, scene after scene.",kicker:"Clay animation"},motion:{title:"Create a motion design video",line:"Words and shapes in motion, carried by your narration.",kicker:"Motion design"},comics:{title:"Create an Attack video",line:"A comic-book world, expressive panels and a camera that carries your story.",kicker:"Attack video"}} as const;
export type FilmCategory=keyof typeof CATEGORY_COPY;
export const filmCategory=(value:string|null|undefined):FilmCategory=>value==="clay"||value==="motion"?value:"comics";
const MAX_FILES=10,MAX_BYTES=100*1024*1024,MAX_TOTAL=1024*1024*1024;
export function ComicStartForm({category,heading=true}:{category:FilmCategory|null;heading?:boolean}){
 const router=useRouter(),request=useRef<string|null>(null);
 const [title,setTitle]=useState(""),[script,setScript]=useState(""),[files,setFiles]=useState<File[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[step,setStep]=useState("");
 const copy=category?CATEGORY_COPY[category]:null,locked=!category;
 function pick(list:FileList|null){const chosen=Array.from(list??[]).filter(f=>f.type.startsWith("image/"));if(chosen.some(f=>f.size>MAX_BYTES)||[...files,...chosen].reduce((a,f)=>a+f.size,0)>MAX_TOTAL){setError("Each image must be under 100 MB, 1 GB in total.");return;}setError("");setFiles(prev=>[...prev,...chosen].slice(0,MAX_FILES));}
 async function submit(e:React.FormEvent){e.preventDefault();if(busy||!category)return;setBusy(true);setError("");request.current??=crypto.randomUUID();
  try{setStep("Reading your script");const r=await fetch("/api/comics",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:request.current,title,script,category})}),v=await r.json();if(!r.ok)throw Error(v.error);
   if(files.length){setStep(`Attaching ${files.length} image${files.length>1?"s":""}`);const body=new FormData();for(const f of files)body.append("files",f,f.name);const up=await fetch(`/api/comics/${v.id}/references`,{method:"POST",body});if(!up.ok)throw Error((await up.json().catch(()=>({})))?.error??"Your images could not be attached.");}
   router.push(`/comics/${v.id}`);
  }catch(err){setError(err instanceof Error?err.message:"Could not prepare this price.");setBusy(false);}}
 return <div className="space-y-6">
  {heading&&copy&&<><div><p className="kicker">Step 1 · Your script</p><h1 className="page-title">{copy.title}</h1></div><p>{copy.line}</p></>}
  {heading&&<ol aria-label="Video journey" className="flex flex-wrap gap-3 text-sm">{["Script & estimate","Production","Review & feedback","Download"].map((s,i)=><li key={s}>{i+1}. {s}</li>)}</ol>}
  <form className={`card space-y-5 ${locked?"opacity-60":""}`} onSubmit={submit}>
   {locked&&<p role="status" className="rounded-lg p-3 text-sm" style={{background:"var(--accent-soft)"}}>Choose a video format above to start.</p>}
   <label className="block">Video title<input required maxLength={80} value={title} disabled={busy||locked} onChange={e=>{request.current=null;setTitle(e.target.value);}} className="input block mt-2"/></label>
   <label className="block">Your script<textarea required minLength={20} maxLength={12000} rows={10} disabled={busy||locked} value={script} onChange={e=>{request.current=null;setScript(e.target.value);}} className="input block mt-2"/></label>
   <div className="block"><p className="text-sm">Reference images <span className="text-muted">(optional)</span></p>
    <label className="mt-2 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line p-6 text-center cursor-pointer hover:bg-surface-2" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy&&!locked)pick(e.dataTransfer.files);}}>
     <input type="file" accept="image/*" multiple className="sr-only" disabled={busy||locked} onChange={e=>{pick(e.target.files);e.target.value="";}}/>
     <span className="text-2xl" aria-hidden="true">🖼</span><span className="text-sm">Drop images here or click to choose</span><span className="text-xs text-muted">Logos, photos, screenshots or visuals you want in the film. PNG or JPG, up to {MAX_FILES} files, 1 GB in total.</span>
    </label>
    {files.length>0&&<ul className="mt-2 flex flex-wrap gap-2">{files.map((f,i)=><li key={f.name+i} className="pill">{f.name} <button type="button" aria-label={`Remove ${f.name}`} className="ml-1" onClick={()=>setFiles(files.filter((_,k)=>k!==i))}>×</button></li>)}</ul>}
   </div>
   <p>We read your script and show you the estimated delay and the price of the complete first version. Nothing is produced before you approve that estimate.</p>
   <button disabled={busy||locked} className="btn btn-primary">Review estimate</button>
  </form>
  {busy&&<WorkProgress title={step||"Reading your script"} description="Estimating the delay and price of your film."/>}
  {error&&<p role="alert" className="text-red-600">{error}</p>}
 </div>;
}
