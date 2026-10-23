"use client";
/** Single journey (Shimi, 2026-10-23): one estimate, one approval, a complete version produced unattended, the
 * client's feedback on the whole version, a revision price, the next version, until a version is approved and
 * downloaded. No storyboard, budget, visual or finishing gate is shown; the storyboard is information only,
 * shown folded with a complete version and never during production (Shimi, 2026-10-23). */
import {useRef,useState} from "react";
import Link from "next/link";
import {VideoJourney,SINGLE_JOURNEY_STEPS} from "@/components/video-journey";
import {WorkProgress} from "@/components/work-progress";
import {FormatDownloads} from "@/app/format-downloads";
import {FilmFeedback,type FilmFeedbackAction} from "./film-feedback";
import {Composition,type StoryboardView} from "./storyboard-review";
import type {FilmComment} from "@/lib/concept/film-feedback";
import {estimatedMinutes} from "@/lib/concept/single-journey";

export type SingleJourneyView={
 id:string;script:string;format:string;scenes:{index:number;narration:string}[];approved:boolean;finished:boolean;busy:boolean;error:string|null;automaticRecovery?:boolean;phase:string;isAdmin:boolean;
 filmVersion?:number;estimate?:{amountCents:number;minutes:number;sceneCount:number}|null;customerQuote:{id:string;amountCents:number;expiresAt:number}|null;quote:{id:string;expiresAt:number;scope?:string}|null;
 availableForQuoteCents:number;budgetBlocked:boolean;progress?:{title:string;message:string;running:boolean;canResume:boolean;canReplace?:boolean;canUpdateBudget?:boolean};
 review:{stage:string;target:string;media:string|null;duration?:number}|null;filmComments?:Omit<FilmComment,"actor">[];
 filmCorrection?:{comments?:string[];comment:string;scenes:number[];status:"quoted"|"working"|"applied";summary?:string|null;version?:number|null}|null;filmCorrectionPrice?:{additionalAmountCents:number}|null;
 storyboard:StoryboardView|null;outputUrl:string|null;recovery?:{target:string;scene:number;scenes?:number[]}|null;
};
type Props={id:string;data:SingleJourneyView;observedAt:number;disabled:boolean;error:string;act:(body:unknown)=>Promise<boolean>;sceneAction:(body:unknown)=>Promise<boolean>};

function calmProgress(phase:string,progress?:SingleJourneyView["progress"]){
 const p=phase.toLowerCase();
 if(p.includes("voice")||p.includes("alignment"))return "Recording and synchronizing the narration.";
 if(p.includes("render")||p.includes("montage")||p.includes("finishing")||p.includes("film-correction"))return "Assembling your film, sound, subtitles and ending.";
 if(p.includes("clip")||p.includes("draft"))return `Animating your scenes.${progress?.message?.match(/\d+ (?:animated )?scenes? ready/)?` ${progress.message.match(/\d+ (?:animated )?scenes? ready/)![0]}.`:""}`;
 if(/scene-\d+-(start|end)|cast-|images?/.test(p))return "Preparing the images of your scenes.";
 return "Preparing your video.";
}

export function SingleJourney({id,data,observedAt,disabled,error,act,sceneAction}:Props){
 const [feedbackDirty,setFeedbackDirty]=useState(false);
 const previewVideo=useRef<HTMLVideoElement>(null);
 const version=data.filmVersion??1,review=data.review;
 const ready=review?.stage==="finishing-film"&&!data.finished;
 const step=data.finished?3:ready?2:data.approved?1:0;
 const insufficient=Boolean(data.customerQuote&&data.availableForQuoteCents<data.customerQuote.amountCents);
 const quoteExpired=Boolean(data.quote&&data.quote.expiresAt<observedAt);
 const stuck=Boolean(data.error)&&!data.automaticRecovery&&!data.busy;
 const notes=data.filmComments??[];
 const revision=ready&&data.filmCorrection?.status==="quoted"&&data.filmCorrectionPrice&&data.customerQuote&&data.quote?{additionalCents:data.filmCorrectionPrice.additionalAmountCents,totalCents:data.customerQuote.amountCents,summary:data.filmCorrection.summary??"",next:data.filmCorrection.version??version+1,ids:data.filmCorrection.comments??[data.filmCorrection.comment]}:null;
 const producing=data.approved&&!ready&&!data.finished;
 const minutes=data.estimate?.minutes??estimatedMinutes(data.scenes.length);
 const sceneCount=data.estimate?.sceneCount??data.scenes.length;
 return <>
  <VideoJourney step={step} steps={SINGLE_JOURNEY_STEPS} hint="Approve the estimate once. Your complete film is produced, then you watch it and ask for changes until you approve a version."/>
  <div aria-label="Current production step" className="space-y-6">
   {!data.approved&&(data.estimate&&data.customerQuote&&data.quote?<section aria-label="Your video estimate" className="rounded-xl border border-accent/40 bg-surface p-5 space-y-4">
    <h2 className="text-xl font-semibold">Your video estimate</h2>
    <p className="text-sm text-muted">Your script is analysed: {sceneCount} scenes. Approving starts the whole film; you will watch the complete version and ask for changes from there.</p>
    <div className="grid sm:grid-cols-2 gap-4"><div className="rounded-lg border border-line p-4"><p className="text-sm text-muted">Estimated delay</p><p className="text-3xl font-semibold">about {minutes} minutes</p></div><div className="rounded-lg border border-line p-4"><p className="text-sm text-muted">Price of your film</p><p className="text-3xl font-semibold">${data.customerQuote.amountCents/100} USD</p><p className="text-xs text-muted mt-2">Reserved on approval, charged once you approve a version. Available: ${(data.availableForQuoteCents/100).toFixed(2)} USD.</p></div></div>
    {insufficient&&<p role="status" className="text-sm">Your balance is too low for this film. <Link href="/credits" className="text-accent underline">View your balance</Link>, then approve.</p>}
    {data.budgetBlocked&&<p role="alert" className="text-sm text-danger">This film exceeds the workspace limit. Contact Bina to review it.</p>}
    {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
    <button disabled={disabled||insufficient||data.budgetBlocked||quoteExpired} onClick={()=>void act({action:"approve",quote:data.quote!.id,customerQuote:data.customerQuote!.id})} className="rounded-lg bg-accent px-5 py-2 text-white disabled:opacity-40">Approve & start my video</button>
    {quoteExpired&&<p role="status" className="text-sm text-muted">This estimate expired. <Link href={`/?source=${id}`} className="text-accent underline">Reopen your script</Link> to refresh it; nothing was charged.</p>}
   </section>:<WorkProgress title="Preparing your estimate" description="Analysing your script and pricing your film. Nothing is generated yet."/>)}
   {producing&&!(stuck&&data.isAdmin)&&<section className="rounded-xl border border-line bg-surface p-5 space-y-3" aria-live="polite">
    <WorkProgress title={stuck?"We are still working on your video":`Version ${version} in production`} description={stuck?"This step is taking longer than planned. Our team has been notified; nothing is needed from you, your film will appear here.":calmProgress(data.phase,data.progress)}/>
    <p className="text-sm text-muted">A complete film usually takes about {minutes} minutes. You can close this page: your film will be here.</p>
   </section>}
   {stuck&&data.isAdmin&&<section className="rounded-xl border border-danger/40 bg-surface p-5 space-y-3"><h2 className="font-medium">Admin: production stopped</h2><p className="text-sm text-danger whitespace-pre-wrap">{data.error}</p><p className="text-sm text-muted">{data.progress?.message}</p><div className="flex flex-wrap gap-4">{data.progress?.canResume&&<button disabled={disabled} onClick={()=>void act({action:"resume"})} className="text-sm text-accent">Analyse saved work & continue</button>}{data.progress?.canReplace&&data.recovery&&<button disabled={disabled} onClick={()=>void act({action:"recovery-quote",target:data.recovery!.target})} className="text-sm text-accent">Prepare replacement price</button>}{data.progress?.canUpdateBudget&&<button disabled={disabled} onClick={()=>void act({action:"quote"})} className="text-sm text-accent">Refresh budget</button>}</div><p className="text-xs text-muted">The client sees a calm waiting state only.</p></section>}
   {ready&&review&&<section className="rounded-xl border border-accent/40 bg-surface p-5 space-y-4">
    <h2 className="text-xl font-semibold">Version {version} of your film</h2>
    <p className="text-sm text-muted">Watch the complete film. Tell us what to change (images, movements, sound, subtitles) or approve this version to download it.</p>
    {review.media&&<video ref={previewVideo} key={review.target} controls preload="metadata" src={review.media} className="w-auto h-auto max-w-full max-h-[520px] object-contain rounded-xl mx-auto"/>}
    <FilmFeedback key={`feedback:${review.target}`} stage="version" onDirtyChange={setFeedbackDirty} target={review.target} comments={notes} video={previewVideo} disabled={disabled} onAction={(body:FilmFeedbackAction)=>sceneAction(body)}/>
    {revision&&<section role="dialog" aria-label="Revision price" className="rounded-xl border border-accent/40 p-4 space-y-3">
     <h3 className="text-lg font-semibold">Version {revision.next} · +${revision.additionalCents/100} USD</h3>
     <p className="text-sm">Version {revision.next} will be produced with these changes, without any further step from you. Total price of your film after it: ${revision.totalCents/100} USD.</p>
     {revision.summary&&<details><summary className="cursor-pointer text-sm text-muted">How we read your notes</summary><p className="text-sm text-muted whitespace-pre-line mt-2">{revision.summary}</p></details>}
     {insufficient&&<p role="status" className="text-sm">Your balance is too low for this revision. <Link href="/credits" className="text-accent underline">View your balance</Link>.</p>}
     {data.budgetBlocked&&<p role="alert" className="text-sm text-danger">This revision exceeds the workspace limit. Contact Bina.</p>}
     <div className="flex flex-wrap gap-4 items-center">{quoteExpired?<button disabled={disabled} onClick={()=>void sceneAction({action:"film-apply-all",target:review.target,ids:revision.ids})} className="rounded-lg bg-accent px-4 py-2 text-white disabled:opacity-40">Refresh the price</button>:<button disabled={disabled||insufficient||data.budgetBlocked||feedbackDirty} onClick={()=>void act({action:"approve",quote:data.quote!.id,customerQuote:data.customerQuote!.id})} className="rounded-lg bg-accent px-4 py-2 text-white disabled:opacity-40">Approve ${revision.additionalCents/100} & produce version {revision.next}</button>}</div>
    </section>}
    {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
    <div className="border-t border-line pt-4 space-y-2">
     <button disabled={disabled||feedbackDirty||notes.length>0} onClick={()=>void act({action:"review",target:review.target,decision:"approved"})} className="rounded-lg bg-accent px-4 py-2 text-white disabled:opacity-40">Approve this version & download</button>
     {(notes.length>0||feedbackDirty)&&<p role="status" className="text-sm text-muted">{feedbackDirty?"Lock or clear your note first.":"Apply or withdraw your notes to approve this version as it is, or approve the price to produce the next version."}</p>}
    </div>
   </section>}
   {data.finished&&data.outputUrl&&<section className="border border-line rounded-xl p-5 space-y-4"><h2 className="font-medium">Your film is ready</h2><video controls src={data.outputUrl} className="max-h-[620px] mx-auto rounded-xl"/><a href={data.outputUrl} download className="inline-block bg-accent text-white rounded-lg px-4 py-2">Download video</a><p className="text-xs text-muted">Version {version}, the one you approved.</p></section>}
   {data.finished&&data.outputUrl&&<FormatDownloads key={data.outputUrl} jobId={id}/>}
  </div>
  <details className="bg-surface border border-line rounded-xl p-5 space-y-3"><summary className="font-medium cursor-pointer">Your script · {data.scenes.length} scenes</summary><p dir="auto" className="text-sm whitespace-pre-wrap">{data.script}</p><p className="text-xs text-muted">{data.format}</p></details>
  {/* Shimi, 2026-10-23: nothing of the storyboard during production; it arrives, folded, with the complete version. */}
  {data.storyboard&&(ready||data.finished)&&<details aria-label="Your storyboard" className="rounded-xl border border-line bg-surface p-5 space-y-4"><summary className="font-medium cursor-pointer">Storyboard of this version · {data.storyboard.panels.length} scenes</summary>
   <p className="text-sm text-muted">For information: the images and movements planned for each sentence. Changes go through your feedback on the film.</p>
   <ol className="grid sm:grid-cols-2 gap-5">{data.storyboard.panels.map(panel=>{const picture=panel.start??panel.existing??panel.end;return <li key={panel.scene} data-scene={panel.scene} className="rounded-lg border border-line p-4 space-y-2 min-w-0"><h3 className="font-semibold">Scene {panel.scene}</h3><p className="text-sm">“{panel.narration}”</p>{picture&&<div className="w-full max-w-[280px] mx-auto"><Composition picture={picture} panel={panel}/></div>}<p className="text-sm text-muted"><span className="font-medium">What moves: </span>{panel.motion}</p><p className="text-sm text-muted"><span className="font-medium">What it explains: </span>{panel.meaning}</p></li>;})}</ol>
  </details>}
 </>;
}
