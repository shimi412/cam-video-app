"use client";
import {VideoJourney} from "@/components/video-journey";
import {FinishingControls} from "../finishing-controls";
import type {FinishingSettings} from "@/lib/concept/finishing-review";
import {feedbackStage} from "@/lib/concept/review-stages";
import {FilmFeedback} from "../film-feedback";
import type {FilmComment} from "@/lib/concept/film-feedback";
import { use,useEffect,useCallback,useState,useRef } from "react";
import { productionStatus } from "@/lib/production-status";
import { WorkProgress } from "@/components/work-progress";
import Link from "next/link";
import {Toast} from "@/components/toast";
import Image from "next/image";
import { api,jsonBody } from "@/lib/client-http";
import type { SceneDirection } from "@/lib/concept/types";
import { FormatDownloads } from "@/app/format-downloads";
import type { CamQuote } from "@/lib/providers/cam-pricing";
import { StoryboardBatchReview } from "../storyboard-batch-review";
import { type StoryboardView } from "../storyboard-review";
import { SingleJourney } from "../single-journey";
type Scene=SceneDirection&{index:number;narration:string};
type View={journey?:"staged"|"single-v1";filmVersion?:number;estimate?:{amountCents:number;minutes:number;sceneCount:number}|null;automaticRecovery?:boolean;backgroundManaged?:boolean;finishing?:{settings:FinishingSettings;pending:boolean}|null;filmCorrection?:{comment:string;comments?:string[];scenes:number[];status:"quoted"|"working"|"applied";summary?:string|null;version?:number|null}|null;filmCorrectionPrice?:{additionalAmountCents:number}|null;filmComments?:Omit<FilmComment,"actor">[];needsPreviewContinuation?:boolean;revisionQuote?:{scene:number|null;scope?:"global"|"scene"|"batch";scenes?:number[];alreadyReservedCents:number;additionalAmountCents:number}|null;storyboardFirst:boolean;needsProductionBudget:boolean;availableForQuoteCents:number;wallet:{available:number;reserved:number;balance:number};savedToLibrary:boolean;recovery?:{scenes?:number[];target:string;scene:number;additionalUsd:number|null}|null;progress?:ReturnType<typeof productionStatus>;budgetBlocked:boolean;title?:string|null;isAdmin:boolean;customerQuote:{id:string;amountCents:number;expiresAt:number}|null;storyboardProposalUrl?:string|null;storyboard:StoryboardView|null;repairProgress?:{capUsdMicros:number;reservedUsdMicros:number;costsSettled:false;trials:{name:string;scene:number;quoteUsdMicros:number;requests:number;completed:number;reviews:("approved"|"rejected")[]}[]}|null;repairQuote?:{expired:boolean;expiresAt:number;caps:{usd:number};lines:{id:string;description:string;maximum:number}[]}|null;finishingReview?:{message:string;variants:{name:string;url:string}[];listeningUrl:string;waveformUrl:string;sourceTailNeedsListening:boolean}|null;id:string;script:string;conversationId:string;format:string;scenes:Scene[];status:string;outputUrl:string|null;busy:boolean;quote:CamQuote|null;approved:boolean;renewing:boolean;finished:boolean;error:string|null;phase:string;costsPending:number;review:{stage:string;scene:number|null;target:string;media:string|null;audio:string|null;duration?:number;width?:number;height?:number}|null;requests:{operation:string;state:string;requestId:string|null}[]};

export default function Production({params}:{params:Promise<{id:string}>}){
 const {id}=use(params),[data,setData]=useState<View|null>(null),[error,setError]=useState(""),[working,setWorking]=useState(false),[checked,setChecked]=useState<string|null>(null);
 const [observedAt,setObservedAt]=useState(0);
 const [pendingAction,setPendingAction]=useState<string|null>(null),[actionFailure,setActionFailure]=useState("");
 const [finishingDirty,setFinishingDirty]=useState(false),[feedbackDirty,setFeedbackDirty]=useState(false);
 const previewVideo=useRef<HTMLVideoElement>(null);
 const currentStep=useRef<HTMLDivElement>(null),storyboardSection=useRef<HTMLDetailsElement>(null);
 const [storyboardChoice,setStoryboardChoice]=useState<{step:string;open:boolean}|null>(null);
 const stepKey=!data?"loading":data.finished?"finished":data.needsProductionBudget||data.renewing&&!data.revisionQuote?"budget":data.storyboard?.status!=="approved"?"storyboard":data.needsPreviewContinuation?"continue-preview":data.review?.stage==="finishing-film"?`finishing:${data.review.target}`:data.review?.stage==="draft-film"?`preview:${data.review.target}`:data.error&&!data.automaticRecovery?"paused":"producing";
 const storyboardOpen=storyboardChoice?.step===stepKey?storyboardChoice.open:stepKey==="storyboard";
 const lastStep=useRef<string|null>(null);
 useEffect(()=>{
  if(stepKey==="loading")return;
  const previous=lastStep.current;lastStep.current=stepKey;
  if(previous===stepKey)return;
  // Focus once per meaningful step, never on every polling update.
  const target=stepKey==="storyboard"?storyboardSection.current:currentStep.current;
  target?.focus({preventScroll:true});target?.scrollIntoView?.({block:"start",behavior:"instant"});
 },[stepKey]);
 function returnToStoryboard(){setStoryboardChoice({step:stepKey,open:true});storyboardSection.current?.scrollIntoView?.({block:"start",behavior:"smooth"});storyboardSection.current?.focus({preventScroll:true});}
 const [saving,setSaving]=useState(false),[toast,setToast]=useState<string|null>(null);
 const [feedbackWorking,setFeedbackWorking]=useState(false);
 const feedbackInFlight=useRef(false),loadSequence=useRef(0);
 const quoteAttempt=useRef<string|null>(null),loadedQuote=useRef<string|null>(null);
 const load=useCallback(async()=>{const sequence=++loadSequence.current;const result=await api<View>(`/api/jobs/${id}/live`);if(sequence!==loadSequence.current)return result;setData(result);setObservedAt(Date.now());if(!result.budgetBlocked)setError(previous=>previous.startsWith("This complete quote exceeds the workspace spending ceiling.")?"":previous);if(result.quote?.id&&result.quote.id!==loadedQuote.current){loadedQuote.current=result.quote.id;setError("");}return result;},[id]);
 useEffect(()=>{let cancelled=false;const sequenceRef=loadSequence;const refresh=()=>{if(feedbackInFlight.current)return;void load().catch(e=>{if(!cancelled)setError(e.message);});};refresh();const timer=setInterval(refresh,3000);return()=>{cancelled=true;sequenceRef.current++;clearInterval(timer);};},[load]);
 async function act(body:unknown){const action=(body as {action?:string}).action??null;setPendingAction(action);setActionFailure("");setWorking(true);setError("");try{await api(`/api/jobs/${id}/live`,jsonBody(body));setChecked(null);await load();return true;}catch(e){setError(e instanceof Error?e.message:"Request failed.");if(action==="recovery-quote")setActionFailure("The replacement price could not be prepared. Your completed scenes are saved. No replacement was started.");await load().catch(()=>{});return false;}finally{setPendingAction(null);setWorking(false);}}
 async function sceneAction(body:unknown,preparePriceForScene?:number|"global"){
  if(feedbackInFlight.current)throw new Error("A scene change is already being processed.");
  feedbackInFlight.current=true;loadSequence.current++;setFeedbackWorking(true);setError("");
  try{
   await api(`/api/jobs/${id}/live`,jsonBody(body));
   let updated=await load();
   if(preparePriceForScene==="global"&&updated.storyboard?.globalComment?.status==="needs-image-revision"){
    await api(`/api/jobs/${id}/live`,jsonBody({action:"storyboard-global-revision-quote",target:updated.storyboard.target}));
    updated=await load();
   }
   if(typeof preparePriceForScene==="number"&&updated.storyboard?.panels.find(p=>p.scene===preparePriceForScene)?.comment?.status==="needs-image-revision"){
    // Pricing is read-only with respect to providers: generation still requires approval.
    await api(`/api/jobs/${id}/live`,jsonBody({action:"storyboard-revision-quote",target:updated.storyboard.target,scene:preparePriceForScene}));
    updated=await load();
   }
   setChecked(null);return true;
  }catch(e){
   await load().catch(()=>{});
   const message=e instanceof Error?e.message:"";
   if((body as {action?:string}).action?.startsWith("finishing")||(body as {action?:string}).action?.startsWith("film-apply"))throw e;
   if(/^(Choose a valid scene range|Select at least one existing storyboard scene|Your feedback names a scene outside your selection)/.test(message))throw e;
   throw new Error(message.includes("storyboard changed")?"The storyboard was updated. Your feedback is kept. Apply it again to the current scene.":message.includes("already working")?"This video is still updating. Your feedback is kept. Try again when it finishes.":"This change could not be completed. Your feedback and previous image are kept. Please try again.");
  }finally{feedbackInFlight.current=false;setFeedbackWorking(false);}
 }
 // Only the approved storyboard opens the video quote. Launch already authorized its images.
 useEffect(()=>{
  if(!data?.needsProductionBudget||data.finished||data.busy||data.error||working||data.renewing)return;
  const key=`${id}:production`;
  if(quoteAttempt.current===key||data.quote?.scope==="production")return;
  quoteAttempt.current=key;
  void Promise.resolve().then(()=>{setWorking(true);return api(`/api/jobs/${id}/live`,jsonBody({action:"quote"}));}).then(()=>load()).catch(e=>setError(e.message)).finally(()=>setWorking(false));
 },[data,id,load,working]);
 if(!data)return error?<p role="alert">{error}</p>:<WorkProgress title="Opening your video" description="Loading the saved production and its review status."/>;
 const progress=data.progress??productionStatus(data);
 const initialPreparationQuote=!data.approved&&!data.busy&&data.quote?.scope==="storyboard";
 const showBudget=data.needsProductionBudget||data.renewing||initialPreparationQuote;
 const creativeRevision=data.revisionQuote;
 const preparationRecovery=data.renewing&&data.quote?.scope==="storyboard";
 const preparationNotStarted=!data.approved&&!data.busy;
 const budgetReady=Boolean(data.quote&&!(data.needsProductionBudget&&data.quote.scope==="storyboard"));
 const insufficientFunds=Boolean(data.customerQuote&&data.availableForQuoteCents<data.customerQuote.amountCents);
 const productionActive=progress.running&&!error;
 const disabled=working||feedbackWorking||data.busy,quoteDisabled=disabled,review=data.review,scene=review?.scene?data.scenes.find(s=>s.index===review.scene):null;
 const revisingScene=data.storyboard?.globalComment?.status==="regenerating"||data.storyboard?.panels.some(p=>p.comment?.status==="regenerating");
 const kicker=data.journey==="single-v1"&&data.approved?`Version ${data.filmVersion??1}`:"Your video";
 const header=<div className="flex items-start justify-between gap-4"><div><p className="kicker">{kicker}</p><h1 className="page-title">{data.title||"Your video"}</h1></div><button disabled={saving||data.savedToLibrary} onClick={async()=>{setSaving(true);try{await api(`/api/jobs/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({savedToLibrary:true})});await load();setToast("Saved to My videos");}catch(e){setError(e instanceof Error?e.message:"Could not save video.");}finally{setSaving(false);}}} className="btn btn-secondary shrink-0">{saving?"Saving…":data.savedToLibrary?"Saved to My videos":"Save to My videos"}</button><Toast message={toast} onHide={()=>setToast(null)}/></div>;
 // Single journey (2026-10-23): no storyboard, budget, visual or finishing gate; the client reviews complete versions only.
 if(data.journey==="single-v1")return <section className="max-w-4xl mx-auto space-y-6">{header}<SingleJourney id={id} data={data} observedAt={observedAt} disabled={disabled} error={error} act={act} sceneAction={body=>sceneAction(body)}/></section>;
 return <section className="max-w-4xl mx-auto space-y-6">{header}
 <VideoJourney step={data.finished?4:data.finishing?3:data.storyboard?.status!=="approved"?0:data.needsProductionBudget||data.renewing?1:2}/>
 <div ref={currentStep} tabIndex={-1} aria-label="Current production step" className="space-y-6 scroll-mt-6 outline-none">
 {data.storyboard?.status==="approved"&&<button onClick={returnToStoryboard} className="btn btn-ghost btn-sm">Return to storyboard</button>}
 {(productionActive||working)&&!revisingScene&&(!data.error||data.automaticRecovery)&&!error&&<WorkProgress title={data.needsProductionBudget?"Preparing your video quote":progress.title} description={data.needsProductionBudget?"Pricing the animation of your approved storyboard.":progress.message}/>}
 {data.storyboardProposalUrl&&<Link href={data.storyboardProposalUrl} className="card card-interactive border-accent/40 block text-accent">Nouveau storyboard à valider · personnage et texte animé →</Link>}

 {(error||data.error&&!data.automaticRecovery)&&!pendingAction&&!actionFailure&&!data.renewing&&!insufficientFunds&&<p role="alert" className="card border-danger/40 text-danger">{data.error?progress.message:"We could not complete that action. Your progress is saved. Please try again."}</p>}

 {preparationNotStarted&&!initialPreparationQuote&&<section className="card space-y-3 appear"><h2 className="section-title">Prepare your storyboard</h2><p className="text-sm text-muted">Your script is saved. Open it to see the preparation cost and start your images.</p><Link href={`/?source=${id}`} className="btn btn-primary btn-sm">Use this script</Link></section>}
 {showBudget&&!creativeRevision&&<section className="card space-y-4 appear"><h2 className="section-title">{data.filmCorrection?.status==="quoted"?"Your correction price":initialPreparationQuote?"Storyboard preparation price":preparationRecovery?"Updated preparation cost":data.needsProductionBudget?"Your video quote":"Updated video quote"}</h2><p className="text-sm text-muted">{data.filmCorrection?.status==="quoted"?`Correct scene${data.filmCorrection.scenes.length>1?"s":""} ${data.filmCorrection.scenes.join(", ")}. Review the revised images before animation. Your other plans and narration are kept.`:initialPreparationQuote?"The script analysis identified the images needed for your storyboard. Review this price before image generation starts. Your analysis is saved.":preparationRecovery?"A preparation request needs recovery. Review this revised total before a replacement is ordered.":data.storyboardFirst?"Your storyboard is approved. This total includes preparation, narration, animation preview and final finishing.":"Review the updated total to continue your video."}</p>{!budgetReady?error?<button disabled={quoteDisabled} onClick={()=>void act({action:"quote"})} className="btn btn-secondary btn-sm">Retry budget preparation</button>:<p role="status">Preparing your budget…</p>:<>
 {data.customerQuote ? <div className="border border-line rounded-lg p-4">{data.filmCorrectionPrice&&<><p className="text-sm">Additional correction price</p><p className="text-3xl font-semibold mb-3">+${data.filmCorrectionPrice.additionalAmountCents/100} USD</p></>}<p className="text-sm text-muted">{initialPreparationQuote?"Storyboard preparation total":preparationRecovery?"Revised preparation total":"Total video price"}</p><p className="text-3xl font-semibold">${data.customerQuote.amountCents/100} USD</p><p className="text-xs text-muted mt-2">Includes the preparation already reserved. Charged once when your video is completed.</p><p className="text-sm mt-2">Available for this video: ${(data.availableForQuoteCents/100).toFixed(2)} USD</p></div> : <p role="status">Bina is setting up your CAM credit pricing. No production charge can start until your price is available.</p>}
 {insufficientFunds&&<p role="status" className="text-sm">Your balance is too low for this budget. <Link href="/credits" className="text-accent underline">View your balance</Link>. The next step will start after funding and approval.</p>}
 {data.budgetBlocked&&<p role="alert" className="text-sm text-danger">This budget exceeds the workspace limit. Contact Bina to review it.</p>}


 <div className="flex gap-4 items-center"><button disabled={insufficientFunds||data.budgetBlocked||(!data.customerQuote)||quoteDisabled||data.quote!.expiresAt<observedAt} onClick={()=>void act({action:"approve",quote:data.quote!.id,...(data.customerQuote?{customerQuote:data.customerQuote.id}:{})})} className="btn btn-primary">{data.filmCorrection?.status==="quoted"?"Approve price & apply changes":initialPreparationQuote?"Approve price & prepare storyboard":data.needsProductionBudget?"Approve budget & create video":"Approve updated budget & resume"}</button>{data.quote!.expiresAt<observedAt&&<button disabled={quoteDisabled} onClick={()=>void act(data.filmCorrection?.status==="quoted"&&review?{action:"film-apply-all",target:review.target,ids:data.filmCorrection.comments??[data.filmCorrection.comment]}:{action:"quote"})} className="btn btn-secondary btn-sm">Update expired budget</button>}</div></>}</section>}

 {data.approved&&!data.finished&&!data.renewing&&!data.needsProductionBudget&&review?.stage!=="storyboard"&&!productionActive&&<section className="card border-accent/40 space-y-4 appear"><h2 className="section-title">{progress.title}</h2>{scene&&!data.needsPreviewContinuation&&<><p className="font-medium text-sm">{scene.narration}</p><p className="text-sm text-muted">{scene.overlay??""}</p></>}
 {review?.stage==="draft-film"&&<p className="text-sm text-muted">Watch the complete film. Here, check only the images, characters and movements. Sound, editing and subtitles have their own review next, before download.</p>}{review?.audio&&<audio controls preload="metadata" src={review.audio} className="w-full"/>}{review?.media&&!data.needsPreviewContinuation&&((["clip","draft","draft-film","finishing-film"].includes(review.stage))?<div className="stage"><video ref={previewVideo} controls preload="metadata" src={review.media} className="w-auto h-auto max-w-full max-h-[520px] object-contain mx-auto"/></div>:<Image unoptimized width={review.width??960} height={review.height??540} alt={`Scene ${review.scene} ${review.stage} frame`} src={review.media} className="w-auto h-auto max-w-full max-h-[520px] object-contain rounded-xl mx-auto"/>)}
 {(review?.stage==="draft-film"||review?.stage==="finishing-film")&&<FilmFeedback onDirtyChange={setFeedbackDirty} stage={review.stage==="finishing-film"?"finishing":"visual"} key={`feedback:${review.target}`} target={review.target} comments={data.filmComments??[]} video={previewVideo} disabled={disabled} onAction={body=>sceneAction(body)}/>}
 {review?.stage==="finishing-film"&&data.finishing&&<FinishingControls onDirtyChange={setFinishingDirty} key={`settings:${review.target}`} settings={data.finishing.settings} comments={data.filmComments??[]} disabled={disabled} onApply={(settings,comments)=>sceneAction({action:"finishing-settings",target:review.target,settings,comments})}/>}
 {(feedbackDirty||finishingDirty)&&<p role="status" className="text-sm text-muted">{feedbackDirty?"Send or clear your feedback before approving this version.":"Apply your finishing settings, then watch the updated film before approving."}</p>}
 {data.needsPreviewContinuation?<><p className="text-sm text-muted">Your first scene is saved. Continue to prepare all remaining scenes and watch your complete film before approving high quality.</p><button disabled={disabled} onClick={()=>void act({action:"resume"})} className="btn btn-primary">Prepare the complete preview</button></>:data.status==="rejected"?<p className="text-sm">Production stopped following your review. Your files and previous decisions are saved. Return to the conversation to prepare a new version.</p>:review&&<><label className="text-sm flex gap-3"><input key={review.target} type="checkbox" checked={checked===review.target} disabled={disabled} onChange={e=>setChecked(e.target.checked?review.target:null)}/>{review.stage==="draft-film"?"I approve the images, characters and movements. I will review sound, editing and subtitles next.":review.stage==="finishing-film"?"I watched this final version and approve its sound, editing and subtitles.":review.stage==="voice"?"I listened to the complete recording and approve the narration and pacing.":review.stage==="direction"?"I approve this scene's visual idea and movement.":"I checked this complete visual and approve its content and character consistency."}</label><div className="flex gap-4"><button disabled={disabled||feedbackDirty||finishingDirty||checked!==review.target||((review.stage==="draft-film"?data.filmComments?.some(c=>(c.stage??feedbackStage(c.text))!=="finishing"):review.stage==="finishing-film"?Boolean(data.filmComments?.length):false)??false)} onClick={()=>void act({action:"review",target:review.target,decision:"approved"})} className="btn btn-primary">{review.stage==="draft-film"?"Approve visuals & continue":review.stage==="finishing-film"?"Approve final film & unlock download":review.stage==="draft"?"Approve draft & finish in 1080p":"Approve & continue"}</button>{review.stage!=="finishing-film"&&<button disabled={disabled} onClick={()=>void act({action:"review",target:review.target,decision:"rejected"})} className="btn btn-danger btn-sm">Reject and stop here</button>}</div></>}
 {!data.needsPreviewContinuation&&!data.busy&&data.status!=="rejected"&&progress.canResume&&<div className="flex gap-4"><button disabled={working} onClick={()=>void act({action:"resume"})} className="btn btn-secondary btn-sm">{data.error?"Analyse saved work & continue":"Continue my video"}</button><button disabled={working} onClick={()=>void act({action:"quote"})} className="btn btn-ghost btn-sm">Update budget</button></div>}{progress.canReplace&&data.recovery&&<div className="space-y-3" aria-busy={pendingAction==="recovery-quote"}>{pendingAction==="recovery-quote"&&<WorkProgress title="Preparing the replacement price" description="Checking the cost for this scene. Your completed scenes are kept. No generation starts during this price check."/>}{actionFailure&&<p role="alert" className="text-sm text-danger">{actionFailure}</p>}<p className="text-sm text-muted">{(data.recovery.scenes?.length??0)>1?`Scenes ${data.recovery.scenes!.join(", ")} need replacements.`:`Scene ${data.recovery.scene} needs a replacement.`} Your other scenes are saved. Review the updated total before continuing.</p><button disabled={disabled} onClick={()=>void act({action:"recovery-quote",target:data.recovery!.target})} className="btn btn-primary">{pendingAction==="recovery-quote"?"Checking replacement price…":"Review replacement price"}</button></div>}{data.error&&!data.busy&&progress.canUpdateBudget&&<button disabled={working} onClick={()=>void act({action:"quote"})} className="btn btn-secondary btn-sm">Review remaining budget</button>}{!progress.canResume&&!progress.canUpdateBudget&&!data.recovery&&data.error&&!data.automaticRecovery&&<a className="text-sm text-accent" href="mailto:contact@bina-prod.com">Contact Bina</a>}</section>}
 {review?.stage==="storyboard"&&data.error&&!data.busy&&data.status!=="rejected"&&progress.canResume&&<div className="flex gap-4"><button disabled={working} onClick={()=>void act({action:"resume"})} className="btn btn-secondary btn-sm">{data.error?"Analyse saved work & continue":"Continue my video"}</button><button disabled={working} onClick={()=>void act({action:"quote"})} className="btn btn-ghost btn-sm">Update budget</button></div>}
 {data.outputUrl&&<section className="card space-y-4 appear"><h2 className="section-title">Review your film</h2><div className="stage"><video controls src={data.outputUrl} className="max-h-[620px] mx-auto"/></div><a href={data.outputUrl} download className="btn btn-primary">Download video</a><p className="text-xs text-muted">This is the final version you approved, including your sound, editing and subtitle settings.</p></section>}
 {data.finishingReview&&<section className="card border-accent/40 space-y-4"><h2 className="section-title">Finishing review</h2><p className="text-sm">{data.finishingReview.message}</p><div className="grid sm:grid-cols-2 gap-4">{data.finishingReview.variants.map(v=><div key={v.url}><p className="text-sm mb-2">{v.name}</p><div className="stage"><video controls preload="metadata" src={v.url} className="max-h-[440px] mx-auto"/></div></div>)}</div><label className="block text-sm">Listen to the transitions and ending<audio controls preload="metadata" src={data.finishingReview.listeningUrl} className="mt-2 w-full"/></label>{data.finishingReview.sourceTailNeedsListening&&<p className="text-sm text-muted">The original voice ends with audible energy. The fade smooths the ending; please check the last word on headphones.</p>}<Image unoptimized src={data.finishingReview.waveformUrl} width={1600} height={320} alt="Waveform of the final four seconds" className="w-full rounded-lg"/></section>}
 {data.outputUrl&&<FormatDownloads key={data.outputUrl} jobId={id}/>}
 </div>
 <details className="card space-y-3"><summary className="font-medium cursor-pointer">Your script · {data.scenes.length} scenes</summary><p dir="auto" className="text-sm whitespace-pre-wrap">{data.script}</p><p className="text-xs text-muted">{data.format}</p></details>
 {data.storyboard&&<details ref={storyboardSection} tabIndex={-1} aria-label="Your storyboard" open={storyboardOpen} onToggle={event=>{const open=event.currentTarget.open;if(open!==storyboardOpen)setStoryboardChoice({step:stepKey,open});}} className="card space-y-4 scroll-mt-6 outline-none">
 <summary className="font-medium cursor-pointer">Your storyboard · {data.storyboard.panels.length} scenes{data.storyboard.status==="approved"?" · Approved":""}</summary>
 {data.storyboard.status==="approved"&&<button className="btn btn-ghost btn-sm" onClick={()=>{setStoryboardChoice({step:stepKey,open:false});currentStep.current?.focus({preventScroll:true});currentStep.current?.scrollIntoView?.({block:"start",behavior:"smooth"});}}>Return to current step</button>}
 {review?.stage==="storyboard"&&review.audio&&<section className="card space-y-3 appear"><h2 className="section-title">Listen to your narration</h2><audio controls preload="metadata" src={review.audio} className="w-full"/></section>}
 {data.storyboard&&<StoryboardBatchReview key={id} sheet={data.storyboard} reviewActive={review?.stage==="storyboard"&&!data.finished&&!data.renewing} quoteBeforeAnimation={data.quote?.scope==="storyboard"} active={data.quote?.scope==="storyboard"&&data.storyboard.status!=="approved"&&!data.finished} disabled={disabled} productionError={data.error||error} revisionPrice={creativeRevision&&data.customerQuote&&data.quote?{scope:creativeRevision.scope,additionalAmountCents:creativeRevision.additionalAmountCents,expired:data.quote.expiresAt<observedAt,blockedMessage:data.budgetBlocked?"This budget exceeds the workspace limit. Contact Bina.":insufficientFunds?"Your balance is too low. Add funds in My credits before approving.":undefined}:null} onAction={body=>sceneAction(body)} onApproveRevision={()=>sceneAction({action:"approve",quote:data.quote!.id,customerQuote:data.customerQuote!.id})} onReview={()=>act({action:"review",target:data.storyboard!.target,decision:"approved",note:"",storyboardConfirmed:true})}/>}
 </details>}

 </section>;
}
