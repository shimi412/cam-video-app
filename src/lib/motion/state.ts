import {recoveryView} from '../agent/recovery-policy';
import type {CreativeApproval} from './creative-review';
import {motionStage,incompleteMotionDiagnosis,internalAuthoringLimit,resumableRepairTurn,savedRecordingRecheck,restartableWriting,type MotionRecovery,resumableAgentWriting} from './recovery';
import type {RevisionQuote,FirstVersionOffer} from './pricing';
import type {WriterInput} from './writer';
import {digest,legacyMotionPrice,type MotionFilm,type MotionTiming,type Receipt,type Checks} from './model';
export type MotionState={
 version:1;phase:'queued'|'working'|'blocked'|'board'|'visuals'|'finishing'|'complete';
 recovery?:MotionRecovery;
 /** Accepted client price in whole dollars. Absent on films created before 2026-10-23, which keep the legacy $10 + $5 ladder. */
 acceptedPriceUsd?:number;
 /** The estimate and price shown at creation (Shimi's grid of 2026-10-23), saved for traceability. */
 firstVersionOffer?:FirstVersionOffer;
 revisionQuote?:RevisionQuote;deliveryNotes?:string;
 creativeApproval?:CreativeApproval;
 audioReview?:{endingNeedsListening:boolean;tailPaddingSeconds:number};
 saved?:boolean;revision:number;title:string;script:string;progress:string;error?:string;
 work:'initial'|'revision'|'finish';targets:string[];feedback:string;deferredFeedback:string;
 film?:MotionFilm;timing?:MotionTiming;voice?:string;checks?:Checks;
 mediaHash?:string;htmlHash?:string;votes:Record<string,boolean>;
 receipts:Receipt[];operations:Record<string,{state:'sending'|'accepted'|'complete'|'failed';agentManaged?:boolean;input?:WriterInput;previousInputs?:WriterInput[];id?:string;result?:unknown}>;
 approved:{board?:number;visuals?:number;finishing?:string};
 settings:{music:'normal'|'quiet'|'off';captions:boolean};
 history:{revision:number;film:MotionFilm;mediaHash?:string}[];
};
export function publicMotion(id:string,s:MotionState){
 const ready=['board','visuals','finishing','complete'].includes(s.phase);
 const media=(name:string)=>`/api/motion/${id}/media/${name}?revision=${s.revision}`;
 const analysis=recoveryView(s.recovery?.supervision);
 if(analysis?.action==='needs-attention'&&internalAuthoringLimit(s.recovery?.supervision?.current?.input.error??''))analysis.message='A technical correction could not finish within its processing allowance. Your saved work is preserved. This is not a request for additional payment.';
 return {id,stage:motionStage(s),version:s.revision+1,recovering:Boolean(s.recovery?.attempts&&['queued','working'].includes(s.phase)),audioReview:s.audioReview,failureAnalysis:analysis,canResume:s.phase==='blocked'&&(Boolean(resumableAgentWriting(s))||incompleteMotionDiagnosis(s)||Boolean(resumableRepairTurn(s))||savedRecordingRecheck(s)||Boolean(restartableWriting(s))||!analysis||analysis.action===null),saved:Boolean(s.saved),title:s.title,phase:s.phase==='board'?'visuals' as const:s.phase,work:s.work,revision:s.revision,progress:s.progress,error:s.error?(incompleteMotionDiagnosis(s)||resumableRepairTurn(s)?'An update is ready to recheck your saved composition. Resume saved work to continue.':analysis?.message??'We could not finish this step. Your saved work is preserved for review.'):undefined,priceUsd:s.acceptedPriceUsd??legacyMotionPrice(s.revision),canRevise:s.revision<2,revisionQuote:s.revisionQuote?{quoteId:s.revisionQuote.id,targets:s.revisionQuote.targets,feedback:s.revisionQuote.feedback,summary:s.revisionQuote.summary,additionalUsd:s.revisionQuote.additionalUsd,totalUsd:s.revisionQuote.totalUsd,expiresAt:s.revisionQuote.expiresAt}:null,settings:s.settings,deferredFeedback:s.deferredFeedback,
  poster:ready&&s.film?media(`${s.film.scenes[0].id}.jpg`):undefined,
  preview:ready?media(s.phase==='finishing'||s.phase==='complete'?'final.mp4':'preview.mp4'):null,
  review:s.creativeApproval&&s.film&&s.creativeApproval.sourceHash===digest(s.film.source)?{verdict:s.creativeApproval.verdict??'approve',noteCount:s.creativeApproval.issues?.length??0}:null,
  scenes:ready?s.film?.scenes.map(scene=>({...scene,narration:s.timing?.phrases.find(p=>p.phrase===scene.phrase)?.text,clip:media(`${scene.id}.mp4`),poster:media(`${scene.id}.jpg`),approved:s.votes[scene.id]??false,reviewNotes:s.creativeApproval&&s.film&&s.creativeApproval.sourceHash===digest(s.film.source)?(s.creativeApproval.issues??[]).filter(i=>i.sceneId===scene.id).map(({observation,correction})=>({observation,correction})):[]})):[],
  download:s.phase==='complete'?media('download'):null,
 };
}
export type MotionView=ReturnType<typeof publicMotion>;
