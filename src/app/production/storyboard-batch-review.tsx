"use client";
import Image from "next/image";
import {ExpandingTextarea} from "@/components/expanding-textarea";
import {useRef,useState} from "react";
import {Composition,type StoryboardView,type Picture,type Panel} from "./storyboard-review";
import {storyboardFeedbackScenes} from "@/lib/concept/storyboard-feedback-scope";

type Action={action:"storyboard-lock";target:string;scene:number;text:string}|{action:"storyboard-global-lock";target:string;text:string;scenes:number[]}|{action:"storyboard-batch-apply";target:string}|{action:"storyboard-withdraw";target:string;scene:number}|{action:"storyboard-global-withdraw";target:string};
type Price={scope?:string;additionalAmountCents:number;blockedMessage?:string;expired:boolean};
export function StoryboardBatchReview({sheet,active,reviewActive=active,quoteBeforeAnimation=true,disabled,productionError,revisionPrice,onAction,onApproveRevision,onReview}:{sheet:StoryboardView;active:boolean;reviewActive?:boolean;quoteBeforeAnimation?:boolean;disabled:boolean;productionError?:string|null;revisionPrice?:Price|null;onAction:(action:Action)=>Promise<unknown>;onApproveRevision:()=>Promise<unknown>;onReview:()=>Promise<unknown>}){
 const [drafts,setDrafts]=useState<Record<string,string>>({}),[editing,setEditing]=useState<Record<string,boolean>>({}),[selection,setSelection]=useState<number[]|undefined>();
 const [busy,setBusy]=useState<string|null>(null),[errors,setErrors]=useState<Record<string,string>>({}),[confirmed,setConfirmed]=useState<string|null>(null);
 const [opened,setOpened]=useState<{picture:Picture;panel:Panel}|null>(null);
 const flight=useRef(false);
 const comments:Record<string,NonNullable<StoryboardView["panels"][number]["comment"]>|null>={global:sheet.globalComment??null,...Object.fromEntries(sheet.panels.map(p=>[p.scene,p.comment??null]))};
 const text=(key:string)=>drafts[key]??comments[key]?.text??"";
 const locked=(key:string)=>Boolean(comments[key]&&!editing[key]&&text(key).trim()===comments[key]?.text);
 const dirty=Object.keys(comments).some(k=>editing[k]||Boolean(text(k).trim()&&text(k).trim()!==comments[k]?.text));
 const queued=Object.values(comments).filter(c=>c&&["locked","revision-quoted"].includes(c.status)).length;
 const applied=Object.values(comments).filter(c=>c?.status==="applied").length;
 const unresolved=Object.values(comments).some(c=>c&&c.status!=="applied");
 const working=Object.values(comments).some(c=>c?.status==="regenerating")&&!productionError;
 const run=async(key:string,work:()=>Promise<unknown>)=>{
  if(flight.current||disabled)return;flight.current=true;setBusy(key);setErrors(e=>({...e,[key]:""}));setConfirmed(null);
  try{if(await work()===false)throw Error("The request could not be completed. Your feedback is kept.");}
  catch(e){setErrors(v=>({...v,[key]:e instanceof Error?e.message:"Your feedback is kept. Please try again."}));}
  finally{flight.current=false;setBusy(null);}
 };
 const lock=async(key:string)=>run(key,async()=>{
  const value=text(key).trim();
  const scenes=key==="global"?storyboardFeedbackScenes(value,sheet.panels.map(p=>p.scene),selection??(value===sheet.globalComment?.text?sheet.globalComment.scenes:undefined)):[];
  const result=await onAction(key==="global"?{action:"storyboard-global-lock",target:sheet.target,text:value,scenes}:{action:"storyboard-lock",target:sheet.target,scene:Number(key),text:value});
  if(result!==false){setEditing(e=>({...e,[key]:false}));setDrafts(d=>({...d,[key]:value}));}return result;
 });
 const field=(key:string)=>{
  const comment=comments[key],isLocked=locked(key),loading=busy===key||comment?.status==="regenerating"&&!productionError;
  return <div className="space-y-2" aria-busy={loading}>
   <label htmlFor={`feedback-${key}`} className="block text-sm font-medium">{key==="global"?"Feedback on the whole storyboard":"Your feedback"}</label>
   <ExpandingTextarea id={`feedback-${key}`} rows={3} maxLength={2000} value={text(key)} disabled={!active||disabled||Boolean(busy)||isLocked||loading} onChange={e=>{setDrafts(d=>({...d,[key]:e.target.value}));setConfirmed(null);}} placeholder={key==="global"?"A shared direction for the storyboard, or name the scenes concerned.":"What should change in this scene?"} className="w-full rounded-lg border border-line bg-surface p-3 text-sm disabled:opacity-70"/>
   {active&&<div className="flex gap-3 text-sm">
    {isLocked?<button disabled={disabled||Boolean(busy)||loading} onClick={()=>{setEditing(e=>({...e,[key]:true}));setConfirmed(null);}} className="btn btn-ghost btn-sm">Edit feedback</button>:<button disabled={disabled||Boolean(busy)||!text(key).trim()} onClick={()=>void lock(key)} className="btn btn-primary btn-sm">Lock feedback</button>}
    {comment&&<button disabled={disabled||Boolean(busy)||loading} className="btn btn-ghost btn-sm" onClick={()=>void run(key,async()=>{const result=await onAction(key==="global"?{action:"storyboard-global-withdraw",target:sheet.target}:{action:"storyboard-withdraw",target:sheet.target,scene:Number(key)});if(result!==false){setDrafts(d=>({...d,[key]:""}));setEditing(e=>({...e,[key]:false}));}return result;})}>Remove feedback</button>}
   </div>}
   {loading&&<p role="status" className="flex items-center gap-2 text-sm"><span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent"/>{busy===key?"Saving feedback…":"Updating this scene…"}</p>}
   {comment&&!loading&&<p role="status" className={`text-sm ${comment.status==="failed"?"text-danger":"text-muted"}`}>{comment.status==="regenerating"&&productionError?"This update stopped. Your feedback and previous images are kept. Other feedback remains editable.":comment.status==="applied"?(key==="global"?`Changes applied. ${comment.message}`:"Change applied. Review the updated scene before approving the storyboard."):comment.message}</p>}
   {errors[key]&&<p role="alert" className="text-sm text-danger">{errors[key]}</p>}
  </div>;
 };
 return <section aria-label="Storyboard review" className="rounded-xl border border-accent/40 bg-surface p-5 space-y-5">
  <h2 className="text-xl font-semibold">Your storyboard</h2>
  <p className="text-sm text-muted">{active?"1. Write and lock your feedback. 2. Apply all feedback together. Locking saves your instructions without changing any image. Any additional price is shown before generation.":reviewActive?"Review the requested changes below, including the planned movement. Confirm to update the complete film using your approved budget.":"Your saved storyboard and feedback."}</p>
  <div className="rounded-lg border border-line bg-surface-2 p-4 space-y-3" aria-label="Whole video feedback">
   {field("global")}
   {!locked("global")&&active&&<fieldset disabled={disabled||Boolean(busy)}><legend className="text-xs text-muted">Optional: select the scenes concerned. Otherwise, name them in your comment or address the whole storyboard.</legend><div className="flex flex-wrap gap-3 mt-2">{sheet.panels.map(p=><label key={p.scene} className="text-sm"><input type="checkbox" aria-label={`Include scene ${p.scene}`} checked={(selection??sheet.globalComment?.scenes??[]).includes(p.scene)} onChange={e=>setSelection(prev=>{const selected=prev??sheet.globalComment?.scenes??[];return(e.target.checked?[...selected,p.scene]:selected.filter(n=>n!==p.scene)).sort((a,b)=>a-b);})}/> {p.scene}</label>)}</div></fieldset>}
  </div>
  <ol className="grid sm:grid-cols-2 gap-5">{sheet.panels.map(panel=>{
   const updating=panel.comment?.status==="regenerating"&&!productionError||sheet.globalComment?.status==="regenerating"&&sheet.globalComment.scenes.includes(panel.scene)&&!productionError;
   const pictures=panel.textOnly?[panel.start??panel.end??panel.existing??{url:"",kind:"image" as const,width:720,height:1280}]:[panel.start,panel.end,panel.existing].filter(Boolean) as NonNullable<typeof panel.start>[];
   return <li key={panel.scene} data-scene={panel.scene} aria-busy={updating} className="rounded-lg border border-line p-4 space-y-3 min-w-0">
    <h3 className="font-semibold">Scene {panel.scene}</h3><p className="text-sm">“{panel.narration}”</p>{reviewActive&&!active&&<p className="text-sm text-muted"><span className="font-medium">Planned movement: </span>{panel.motion}</p>}
    <div className={`grid gap-2 ${pictures.length>1?"grid-cols-2":"grid-cols-1"} ${updating?"opacity-40 grayscale":""}`}>{pictures.map((picture,i)=><div key={i} className="w-full max-w-[280px] mx-auto"><button className="block w-full" type="button" aria-label={`Enlarge scene ${panel.scene} ${i===0?"start":"end"}`} onClick={()=>setOpened({picture,panel})}><Composition picture={picture} panel={panel}/></button></div>)}</div>
    {Boolean(panel.characterSheets?.length)&&!panel.textOnly&&<details className="text-sm"><summary className="cursor-pointer text-muted">Character references</summary><div className="grid grid-cols-2 gap-2 mt-2">{panel.characterSheets!.map((c,i)=><button type="button" key={c.id} aria-label={`Enlarge scene ${panel.scene} character ${i+1}`} onClick={()=>setOpened({picture:c.picture,panel:{...panel,meaning:"Character reference",overlay:null,graphicLayers:[]}})}><Image unoptimized src={c.picture.url} width={c.picture.width} height={c.picture.height} alt={`Character ${i+1} reference sheet`} className="w-full h-auto rounded-lg"/></button>)}</div></details>}
    {field(String(panel.scene))}
   </li>;
  })}</ol>
  {active&&(queued>0||dirty||working||busy==="batch"||Boolean(errors.batch))&&<div className="sticky bottom-3 rounded-xl border border-accent/40 bg-surface p-4 shadow-lg space-y-3" aria-label="Apply feedback batch">
   {dirty&&<p role="status" className="text-sm">Lock your edited feedback before applying the batch.</p>}
   {busy==="batch"&&<p role="status">Analyzing your feedback and planning the changes…</p>}
   {errors.batch&&<p role="alert" className="text-danger text-sm">{errors.batch}</p>}
   {revisionPrice&&!dirty&&queued>0?<><p className="font-semibold">All requested image changes · ${revisionPrice.additionalAmountCents/100} USD additional</p>{revisionPrice.blockedMessage&&<p>{revisionPrice.blockedMessage}</p>}<button disabled={disabled||Boolean(busy)||Boolean(revisionPrice.blockedMessage)} onClick={()=>void run("batch",()=>revisionPrice.expired?onAction({action:"storyboard-batch-apply",target:sheet.target}):onApproveRevision())} className="btn btn-primary">{revisionPrice.expired?"Refresh changes price":"Approve price & apply all changes"}</button></>:<button disabled={disabled||Boolean(busy)||dirty||!queued||working} onClick={()=>void run("batch",()=>onAction({action:"storyboard-batch-apply",target:sheet.target}))} className="btn btn-primary">Apply all feedback{queued?` (${queued})`:""}</button>}
  </div>}
  {active&&applied>0&&!unresolved&&!dirty&&!busy&&<p role="status" className="rounded-lg bg-surface-2 p-4 text-accent">All feedback has been applied. Review the updated storyboard, then confirm below to continue to the video price.</p>}
  {reviewActive&&sheet.status!=="approved"&&<div className="border-t border-line pt-4 space-y-3">
   {unresolved||dirty?<p className="text-sm text-muted">Resolve or remove outstanding feedback before approving the storyboard.</p>:<label className="flex gap-3 text-sm"><input type="checkbox" aria-label="Approve storyboard" checked={confirmed===sheet.target} onChange={e=>setConfirmed(e.target.checked?sheet.target:null)}/>I approve these images, text and symbols.</label>}
   <button disabled={disabled||Boolean(busy)||confirmed!==sheet.target||unresolved||dirty} onClick={()=>void onReview()} className="btn btn-primary">{quoteBeforeAnimation?"Approve storyboard & see video price":"Approve changes & update film"}</button>
  </div>}
  {opened&&<div role="dialog" aria-modal="true" aria-label={`Scene ${opened.panel.scene} preview`} className="fixed inset-0 z-50 bg-black/70 overflow-y-auto p-6" onClick={()=>setOpened(null)}><div className="mx-auto max-w-lg rounded-xl bg-surface p-4" onClick={e=>e.stopPropagation()}><button autoFocus className="btn btn-ghost btn-sm mb-3" onClick={()=>setOpened(null)}>Close preview</button><Composition {...opened}/></div></div>}
 </section>;
}
