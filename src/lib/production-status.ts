import type {recoveryView} from "./agent/recovery-policy";
type ProductionStatus = {title:string;message:string;running:boolean;canResume:boolean;canUpdateBudget?:boolean;canReplace?:boolean};
export function productionStatus(input:{failureAnalysis?:ReturnType<typeof recoveryView>;automaticRecovery?:boolean;backgroundManaged?:boolean;needsPreviewContinuation?:boolean;needsProductionBudget?:boolean;approved:boolean;finished:boolean;renewing:boolean;error:string|null;phase:string;review:{stage:string;scene:number|null}|null;requests:{operation?:string;state:string;requestId:string|null}[]}):ProductionStatus{
 if(input.automaticRecovery)return {title:"Recovering your saved work",message:input.failureAnalysis?.message??"Please wait. Analysing the interruption and preserving completed work.",running:true,canResume:false};
 if(input.review?.stage==="finishing-film"&&!input.error)return {title:"Review sound, editing & subtitles",message:"Your visuals are approved. Apply finishing feedback and approve this final version before download.",running:false,canResume:false};
 if(input.needsProductionBudget)return {title:"Your animation budget",message:"Your storyboard is approved. Review the animation price before production starts.",running:false,canResume:false};
 if(input.renewing)return {title:"Review your updated budget",message:"The revised budget preserves previous costs and covers the next step. Nothing new starts before your approval.",running:false,canResume:false};
 if(input.phase==="finishing-film"&&!input.error&&!input.finished)return {title:"Updating your final film",message:"Applying sound, editing and subtitle settings to your approved visuals.",running:true,canResume:false};
 const failed=input.requests.filter(r=>r.state==="failed");
 const uncertain=input.requests.some(r=>r.state==="submitting"&&!r.requestId);
 if(!input.error&&!uncertain&&failed.length&&/^scene-\d+-(?:draft|clip)/.test(input.phase))return {title:"Preparing the remaining scenes",message:`${failed.length} scene${failed.length===1?" needs":"s need"} attention. Preparing the other approved scenes and keeping completed results.`,running:true,canResume:false};
 if(input.error||failed.length||uncertain){
  const decision=input.failureAnalysis;
  return {title:decision?.pending?"Analysing the interruption":"Your saved work needs attention",message:decision?.message??"Your progress is saved. Continue to analyse the interruption before resuming any work.",running:Boolean(decision?.pending),canResume:!decision||decision.action===null&&!decision.pending||decision.action==="retry-saved",canReplace:decision?.action==="replace-failed",canUpdateBudget:decision?.action==="review-budget"};
 }
 if(input.backgroundManaged===false&&input.approved&&!input.review&&!input.finished)return {title:"Your video is paused",message:"Continue when you are ready. Your saved scenes and approved budget are kept.",running:false,canResume:true};
 if(input.finished)return {title:"Your video is ready",message:"Watch and download your film.",running:false,canResume:false};
 if(!input.approved||input.renewing)return {title:"Your budget",message:"Review the cost before continuing.",running:false,canResume:false};
 if(input.needsPreviewContinuation)return {title:"Continue to your complete preview",message:"Your first animated scene is saved. Prepare the remaining scenes and watch the complete film before finishing.",running:false,canResume:true};
 if(input.review)return {title:input.review.stage==="storyboard"?"Your storyboard is ready":["draft","draft-film"].includes(input.review.stage)?"Review your complete preview":"Review your scene",message:"Check the result before continuing.",running:false,canResume:false};
 const drafts=input.requests.filter(r=>r.operation?.match(/^scene-\d+-draft(-retry-\d+)?$/)&&r.state==="complete").length;
 const finals=input.requests.filter(r=>r.operation?.match(/^scene-\d+-clip$/)&&r.state==="complete").length;
 const images=input.requests.filter(r=>r.operation?.match(/^scene-\d+-(start|end)$/)&&r.state==="complete").length;
 return {title:"Preparing your video",message:input.phase.includes("voice")?"Preparing the narration and synchronizing your script.":input.phase.includes("render")?"Assembling your film, sound and ending.":input.phase.includes("clip")?`Finishing your film in high quality. ${finals} scenes ready.`:input.phase.includes("draft")||drafts?`Preparing the complete preview. ${drafts} animated scenes ready.`:images?`${images} storyboard image${images===1?"":"s"} received. Preparing the next step.`:"Preparing your storyboard. You will review the images before animation.",running:true,canResume:false};
}
