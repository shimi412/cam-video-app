"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { GraphicLayer } from "@/lib/concept/types";
import { sceneCompositionLayout } from "@/lib/concept/composition-layout";
import { graphicLayersSvg } from "@/lib/concept/graphic-layers";
import type { ImageQuality } from "@/lib/concept/image-quality-types";
import { storyboardFeedbackScenes } from "@/lib/concept/storyboard-feedback-scope";
import type { StoryboardFeedback } from "@/lib/concept/storyboard-feedback";

export type Picture={url:string;kind:"image"|"video";width:number;height:number;quality?:ImageQuality};
export type Panel={textOnly?:boolean;characterSheets?:{id:string;role:string;picture:Picture}[];scene:number;narration:string;meaning:string;startScene:string;endScene:string|null;motion:string;actionSeconds:number;visualMode?:"metaphor"|"presenter-text";overlay?:string|null;strike?:boolean;graphicLayers?:GraphicLayer[];start:Picture|null;end:Picture|null;existing:Picture|null;comment?:StoryboardFeedback["comments"][string]|null};
export type StoryboardView={target:string;retrospective:boolean;status:"pending"|"approved"|"rejected";note:string|null;rejectedScene:number|null;panels:Panel[];globalComment?:(NonNullable<Panel["comment"]>&{scenes:number[]})|null};
export type StoryboardFeedbackAction="storyboard-comment"|"storyboard-apply"|"storyboard-withdraw"|"storyboard-revision-quote";
export type StoryboardGlobalAction="storyboard-global-apply"|"storyboard-global-withdraw"|"storyboard-global-revision-quote";
export type SceneRevisionPrice={scene:number|null;scope?:"scene"|"global";scenes?:number[];additionalAmountCents:number;totalAmountCents:number;blockedMessage?:string;expired:boolean};
function SceneLoading({label}:{label:string}){
 const [seconds,setSeconds]=useState(0);
 useEffect(()=>{const started=Date.now();const timer=setInterval(()=>setSeconds(Math.floor((Date.now()-started)/1000)),1000);return()=>clearInterval(timer);},[]);
 return <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-accent/30 bg-surface p-3 text-sm text-accent shadow-sm">
  <span aria-hidden="true" className="h-5 w-5 shrink-0 animate-spin motion-reduce:animate-none rounded-full border-2 border-accent/25 border-t-accent"/>
  <span>{label}</span><span aria-hidden="true" className="ml-auto tabular-nums text-muted">{seconds}s</span>
 </div>;
}
export function Composition({picture,panel}:{picture:Picture;panel:Panel}){
 const layout=sceneCompositionLayout(panel.overlay,panel.graphicLayers,picture.width,picture.height);
 return <div className="relative w-full overflow-hidden rounded-lg" style={{containerType:"inline-size"}}>
  {panel.textOnly?<div aria-label="Animated narration text preview" style={{aspectRatio:`${picture.width}/${picture.height}`,background:"#FFF4DC"}}/>:picture.kind==="video"?<video controls preload="metadata" src={picture.url} className="w-full h-auto"/>:<Image unoptimized src={picture.url} width={picture.width} height={picture.height} alt={`Scene ${panel.scene}: ${panel.meaning}`} className="w-full h-auto"/>}
  {panel.overlay&&<div className="absolute left-[10%] top-[12%] w-[76%] rounded-lg bg-[#fff4dc]/95 p-[2%] text-center font-black leading-tight text-[#3b2416]" style={{top:`${(panel.textOnly?.35:layout.textTop)*100}%`,fontSize:`${layout.fontSize/picture.width*100}cqw`,padding:`${layout.paddingY/picture.width*100}cqw ${layout.paddingX/picture.width*100}cqw`,lineHeight:1.16,textTransform:panel.visualMode==="presenter-text"?"uppercase":undefined,textDecoration:panel.strike?"line-through":undefined,textDecorationColor:"#BC291F"}}>{panel.overlay}</div>}
  {Boolean(panel.graphicLayers?.length)&&<div className="absolute inset-0 pointer-events-none" dangerouslySetInnerHTML={{__html:graphicLayersSvg(panel.graphicLayers!,picture.width,picture.height,`scene-${panel.scene}`,Boolean(panel.overlay))}}/>}
 </div>;
}
export function StoryboardReview({sheet,active,disabled,onReview,onFeedback,onGlobalFeedback,quoteBeforeAnimation=false,generationRunning=false,productionError,revisionPrice,onApproveRevision}:{quoteBeforeAnimation?:boolean;sheet:StoryboardView;active:boolean;disabled:boolean;conversationId:string;onReview:(decision:"approved"|"rejected",note:string)=>Promise<unknown>;onFeedback?:(action:StoryboardFeedbackAction,scene:number,text?:string)=>Promise<unknown>;onGlobalFeedback?:(action:StoryboardGlobalAction,text?:string,scenes?:number[])=>Promise<unknown>;generationRunning?:boolean;productionError?:string|null;revisionPrice?:SceneRevisionPrice|null;onApproveRevision?:()=>Promise<unknown>}){
 const [confirmed,setConfirmed]=useState<string|null>(null),[drafts,setDrafts]=useState<Record<number,string>>({}),[opened,setOpened]=useState<{picture:Picture;panel:Panel}|null>(null);
 const [operation,setOperation]=useState<{scene:number;label:string}|null>(null),[errors,setErrors]=useState<Record<number,string>>({});
 const [globalDraft,setGlobalDraft]=useState<string|undefined>(undefined);
 const [selectedScenes,setSelectedScenes]=useState<number[]|undefined>(undefined);
 const inFlight=useRef(false);
 const globalText=globalDraft??sheet.globalComment?.text??"";
 let selection:number[]=[],selectionError="";
 try{selection=storyboardFeedbackScenes(globalText,sheet.panels.map(p=>p.scene),selectedScenes??(globalText.trim()===sheet.globalComment?.text?sheet.globalComment.scenes:undefined));}
 catch(error){selection=selectedScenes??[];selectionError=error instanceof Error?error.message:"Choose the scenes to update.";}
 const globalUnchanged=globalText.trim()===sheet.globalComment?.text&&JSON.stringify(selection)===JSON.stringify(sheet.globalComment?.scenes);
 const globalRegenerating=sheet.globalComment?.status==="regenerating";
 const globalLoading=operation?.scene===0||globalRegenerating&&!productionError;
 const globalPrice=revisionPrice?.scope==="global"?revisionPrice:null;
 const pending=Boolean(operation)||Boolean(sheet.globalComment&&sheet.globalComment.status!=="applied")||Boolean(globalText.trim()&&!globalUnchanged)||sheet.panels.some(p=>p.comment&&p.comment.status!=="applied"||drafts[p.scene]!==undefined&&drafts[p.scene].trim()!==p.comment?.text&&drafts[p.scene].trim().length>0);
 const run=async(p:Pick<Panel,"scene">,label:string,work:()=>Promise<unknown>)=>{
  if(inFlight.current||disabled)return;
  inFlight.current=true;setOperation({scene:p.scene,label});setErrors(current=>({...current,[p.scene]:""}));setConfirmed(null);
  try{if(await work()===false)throw new Error("This change could not be applied. Your feedback is kept. Please try again.");}
  catch(error){setErrors(current=>({...current,[p.scene]:error instanceof Error?error.message:"This change could not be applied. Your feedback is kept. Please try again."}));}
  finally{inFlight.current=false;setOperation(null);}
 };
 const submitGlobal=async(action:StoryboardGlobalAction)=>{
  if(!onGlobalFeedback)return;
  if(action==="storyboard-global-apply"&&selectionError){setErrors(current=>({...current,0:selectionError}));return;}
  const text=globalText.trim();
  await run({scene:0},action==="storyboard-global-withdraw"?"Withdrawing storyboard feedback…":"Applying your storyboard feedback…",async()=>{
   const result=await onGlobalFeedback(action,action==="storyboard-global-apply"?text:undefined,action==="storyboard-global-apply"?selectedScenes:undefined);
   if(result!==false){setGlobalDraft(action==="storyboard-global-withdraw"?"":text);setSelectedScenes(undefined);}
   return result;
  });
 };
 const submit=async(action:StoryboardFeedbackAction,p:Panel)=>{
  if(!onFeedback)return;
  const text=(drafts[p.scene]??p.comment?.text??"").trim();
  await run(p,action==="storyboard-withdraw"?"Withdrawing this request…":action==="storyboard-revision-quote"?"Preparing the change price…":"Applying your change…",async()=>{
   const result=await onFeedback(action,p.scene,action==="storyboard-apply"?text:undefined);
   if(result!==false)setDrafts(current=>({...current,[p.scene]:action==="storyboard-withdraw"?"":text}));
   return result;
  });
 };
 return <section className="rounded-xl border border-accent/40 bg-surface p-5 space-y-5" aria-label="Storyboard review">
  <div><h2 className="text-xl font-semibold">Your storyboard</h2><p className="text-sm text-muted mt-2">Review each image with its sentence. Text and symbols shown here are included in the video. Comment on a scene to change it.</p></div>
  {sheet.retrospective&&<p className="text-sm text-muted">These images document the existing film.</p>}
  {onGlobalFeedback&&(active||sheet.globalComment)&&<section aria-label="Whole video feedback" aria-busy={globalLoading} className="rounded-xl border border-line bg-surface-2 p-4 space-y-3">
   <label htmlFor="video-feedback" className="block font-semibold">Feedback on the storyboard</label>
   <p className="text-sm text-muted">Give one shared direction for several scenes or the whole storyboard. Name the scene numbers in your comment, or select them below. Each scene also has its own feedback field.</p>
   <textarea id="video-feedback" value={globalText} onChange={e=>{setGlobalDraft(e.target.value);setConfirmed(null);}} disabled={!active||disabled||Boolean(operation)||globalLoading} rows={3} maxLength={2000} placeholder="For example: scenes 6 and 7 should show the comparison together, with the character beside a balance." className="block w-full rounded-lg border border-line bg-surface p-3 text-sm"/>
   {active&&<fieldset disabled={disabled||Boolean(operation)||globalLoading} className="space-y-2"><legend className="text-sm font-medium">Scenes to update</legend><div className="flex flex-wrap gap-2">{sheet.panels.map(panel=><label key={panel.scene} className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm"><input type="checkbox" aria-label={`Include scene ${panel.scene}`} checked={selection.includes(panel.scene)} onChange={e=>{setSelectedScenes((e.target.checked?[...selection,panel.scene]:selection.filter(n=>n!==panel.scene)).sort((a,b)=>a-b));setConfirmed(null);}}/>{panel.scene}</label>)}</div><p className="text-xs text-muted">{selectedScenes?`Only scenes ${selection.join(", ")||"you select"} will be updated.`:"Scene numbers in your comment narrow the change automatically. Otherwise it applies to the whole storyboard."}</p></fieldset>}
   {active&&<div className="flex flex-wrap gap-3 text-sm"><button type="button" disabled={disabled||Boolean(operation)||globalLoading||Boolean(selectionError)||selection.length===0||!globalText.trim()||globalUnchanged&&sheet.globalComment?.status==="applied"} onClick={()=>void submitGlobal("storyboard-global-apply")} className="btn btn-primary btn-sm">{globalLoading?"Updating…":globalUnchanged&&sheet.globalComment?.status==="applied"?"Changes applied":"Apply storyboard feedback"}</button>{sheet.globalComment&&<button type="button" disabled={disabled||Boolean(operation)||globalLoading} onClick={()=>void submitGlobal("storyboard-global-withdraw")} className="btn btn-ghost btn-sm">Withdraw storyboard feedback</button>}</div>}
   {globalLoading&&<SceneLoading label={operation?.scene===0?operation.label:generationRunning?"Updating the affected scenes…":"Image updates queued…"}/>}
   {sheet.globalComment&&!globalLoading&&<p role="status" className="text-sm">{sheet.globalComment.message}</p>}
   {selectionError&&<p role="alert" className="text-sm text-danger">{selectionError}</p>}
   {errors[0]&&<p role="alert" className="text-sm text-danger">{errors[0]}</p>}
   {globalRegenerating&&productionError&&<p role="alert" className="text-sm text-danger">The update stopped. Your images and video feedback are kept. Use Continue my video to resume saved work.</p>}
   {sheet.globalComment?.status==="needs-image-revision"&&globalUnchanged&&!globalLoading&&<button type="button" disabled={disabled||Boolean(operation)} onClick={()=>void submitGlobal("storyboard-global-revision-quote")} className="text-sm text-accent underline">See update price</button>}
   {globalPrice&&!globalUnchanged&&<p role="status" className="text-sm text-muted">Apply your edited feedback to refresh this price.</p>}
   {globalPrice&&globalUnchanged&&onApproveRevision&&!globalLoading&&<div className="rounded-lg border border-accent/30 p-3 space-y-3 text-sm">
    <p className="font-semibold">Update {globalPrice.scenes?.length??sheet.panels.length} {(globalPrice.scenes?.length??sheet.panels.length)===1?"scene":"scenes"} · ${globalPrice.additionalAmountCents/100} USD additional</p><p className="text-muted">Updated preparation total: ${globalPrice.totalAmountCents/100} USD.</p>
    {globalPrice.blockedMessage&&<p role="status">{globalPrice.blockedMessage}</p>}
    <button type="button" disabled={disabled||Boolean(operation)||Boolean(globalPrice.blockedMessage)} onClick={()=>void (globalPrice.expired?submitGlobal("storyboard-global-revision-quote"):run({scene:0},"Starting the image updates…",onApproveRevision))} className="btn btn-primary btn-sm">{globalPrice.expired?"Refresh update price":"Approve price & update images"}</button>
   </div>}
  </section>}
  <ol className="grid sm:grid-cols-2 gap-5">{sheet.panels.map(p=>{
   const text=drafts[p.scene]??p.comment?.text??"";
   const regenerating=p.comment?.status==="regenerating"||globalRegenerating&&sheet.globalComment!.scenes.includes(p.scene);
   const loading=operation?.scene===p.scene||operation?.scene===0&&selection.includes(p.scene)||regenerating&&!productionError;
   const label=operation?.scene===p.scene||operation?.scene===0?operation.label:generationRunning?"Updating this image…":"Image update queued…";
   const cardDisabled=disabled||Boolean(operation)||loading;
   const price=revisionPrice?.scene===p.scene?revisionPrice:null;
   const unchanged=text.trim()===p.comment?.text;
   const pictures=[p.start&&{picture:p.start,label:"Start"},p.end&&{picture:p.end,label:"End"},p.existing&&{picture:p.existing,label:"Preview"}].filter(Boolean) as {picture:Picture;label:string}[];
   return <li key={p.scene} data-scene={p.scene} aria-busy={loading} className="relative rounded-lg border border-line p-4 space-y-3 min-w-0">
    <div className={`space-y-3 transition-opacity motion-reduce:transition-none ${loading?"opacity-40 grayscale pointer-events-none":""}`}>
    <h3 className="font-medium">Scene {p.scene}</h3><p className="text-sm" dir="auto">“{p.narration}”</p>
    <div className={`grid gap-3 ${pictures.length>1?"grid-cols-2":"grid-cols-1"}`}>{pictures.map(({picture,label})=><div key={label} className="min-w-0">
     {pictures.length>1&&<p className="text-xs text-muted mb-2">{label}</p>}
     <button type="button" disabled={loading} className="block w-full max-w-[280px] mx-auto text-left" aria-label={`Enlarge scene ${p.scene} ${label.toLowerCase()}`} onClick={()=>setOpened({picture,panel:p})}><Composition picture={picture} panel={p}/></button>
     {picture.quality?.issues.map(issue=><p key={issue.code} className="text-xs text-danger mt-2">{issue.message}</p>)}
    </div>)}</div>
    {Boolean(p.characterSheets?.length)&&!p.textOnly&&<details className="text-sm"><summary className="cursor-pointer text-muted">Character references</summary><div className="grid grid-cols-2 gap-2 mt-2">{p.characterSheets!.map((c,index)=><button type="button" disabled={loading} key={c.id} aria-label={`Enlarge scene ${p.scene} character ${index+1}`} onClick={()=>setOpened({picture:c.picture,panel:{...p,meaning:`Character ${index+1} reference`,overlay:null,graphicLayers:[]}})}><Image unoptimized src={c.picture.url} width={c.picture.width} height={c.picture.height} alt={`Character ${index+1} reference sheet`} className="w-full h-auto rounded-lg"/></button>)}</div></details>}
    {active&&onFeedback&&<div className="border-t border-line pt-3 space-y-2">
     <label htmlFor={`comment-${p.scene}`} className="block text-sm font-medium">Your feedback</label>
     <textarea id={`comment-${p.scene}`} value={text} onChange={e=>{setDrafts(current=>({...current,[p.scene]:e.target.value}));setConfirmed(null);}} disabled={cardDisabled} maxLength={2000} rows={3} placeholder="What should change in this scene?" className="block w-full rounded-lg border border-line bg-surface-2 p-3 text-sm"/>
     <div className="flex flex-wrap gap-3 text-sm"><button type="button" disabled={cardDisabled||!text.trim()||unchanged&&p.comment?.status==="applied"} onClick={()=>void submit("storyboard-apply",p)} className="btn btn-primary btn-sm">{loading?"Updating…":unchanged&&p.comment?.status==="applied"?"Change applied":"Apply change"}</button>{p.comment&&<button type="button" disabled={cardDisabled} onClick={()=>void submit("storyboard-withdraw",p)} className="btn btn-ghost btn-sm">Withdraw request</button>}</div>
     <p className="text-xs text-muted">Text and supported symbols update without generation costs. Image changes are priced before regeneration.</p>
     {p.comment&&!loading&&<p role="status" className={`text-sm ${p.comment.status==="applied"?"text-accent":"text-muted"}`}>{p.comment.message}</p>}
     {p.comment?.status==="needs-image-revision"&&unchanged&&<button type="button" disabled={cardDisabled} onClick={()=>void submit("storyboard-revision-quote",p)} className="text-accent text-sm underline">See image change price</button>}
    </div>}
    </div>
    {loading&&<SceneLoading label={label}/>}
    {errors[p.scene]&&<p role="alert" className="rounded-lg border border-danger/30 p-3 text-sm text-danger">{errors[p.scene]}</p>}
    {regenerating&&productionError&&<p role="alert" className="text-sm text-danger">The image update stopped. Your previous image and feedback are kept. Use Continue my video to resume saved work.</p>}
    {price&&!unchanged&&<p role="status" className="text-sm text-muted">Apply your edited feedback to refresh this price.</p>}
    {price&&unchanged&&onApproveRevision&&!loading&&<div className="rounded-lg border border-accent/30 bg-surface-2 p-3 space-y-3 text-sm">
     <p className="font-semibold">Update this scene · ${price.additionalAmountCents/100} USD additional</p>
     <p className="text-muted">Updated preparation total: ${price.totalAmountCents/100} USD. Other images are kept.</p>
     {price.blockedMessage&&<p role="status">{price.blockedMessage}</p>}
     <button type="button" disabled={cardDisabled||Boolean(price.blockedMessage)} onClick={()=>void (price.expired?submit("storyboard-revision-quote",p):run(p,"Starting the image update…",onApproveRevision))} className="btn btn-primary btn-sm">{price.expired?"Refresh change price":"Approve price & update image"}</button>
    </div>}
   </li>;
  })}</ol>
  {active&&sheet.status!=="approved"&&<div className="border-t border-line pt-4 space-y-4">
   {pending?<p role="status" className="text-sm text-muted">Apply or withdraw the pending scene changes before approving.</p>:<label className="flex gap-3 text-sm"><input aria-label="Approve storyboard" type="checkbox" checked={confirmed===sheet.target} onChange={e=>setConfirmed(e.target.checked?sheet.target:null)} disabled={disabled}/>I approve these images, text and symbols.</label>}
   <button disabled={disabled||confirmed!==sheet.target||pending} onClick={()=>void onReview("approved","")} className="btn btn-primary">{quoteBeforeAnimation?"Approve storyboard & see video price":"Approve storyboard & animate"}</button>
  </div>}
  {sheet.status==="approved"&&<p className="text-sm text-accent">Storyboard approved.</p>}
  {opened&&<div role="dialog" aria-modal="true" aria-label={`Scene ${opened.panel.scene} preview`} className="fixed inset-0 z-50 bg-black/70 overflow-y-auto p-6" onClick={()=>setOpened(null)}><div className="mx-auto max-w-lg rounded-xl bg-surface p-4" onClick={e=>e.stopPropagation()}><button autoFocus className="btn btn-ghost btn-sm mb-3" onClick={()=>setOpened(null)}>Close preview</button><Composition {...opened}/></div></div>}
 </section>;
}
