import {z} from "zod";
type RequestState={operation?:string;state:string;requestId:string|null};
import {PipelineRecovery,freshPipelineRecovery,recoveryCapabilities} from "../agent/recovery-policy";
export const BackgroundState=z.object({enabled:z.boolean(),kick:z.boolean().default(false),failures:z.number().int().min(0).max(3),nextAt:z.number().nonnegative(),supervision:PipelineRecovery.optional()});
export type BackgroundState=z.infer<typeof BackgroundState>;
export const requestedBackground=():BackgroundState=>({enabled:true,kick:true,failures:0,nextAt:0,supervision:freshPipelineRecovery()});
type Gate={approved:boolean;finished:boolean;renewing:boolean;needsProductionBudget:boolean;review:{stage:string}|null;storyboardPending?:number[];error:string|null;status:string;requests:RequestState[]};
/** Durable opt-in, never inferred from a legacy job's status or an open page. */
export function backgroundMayRun(state:BackgroundState|undefined,view:Gate,now=Date.now()){
 const pendingRevision=view.status==="pending"&&view.review?.stage==="storyboard"&&Boolean(view.storyboardPending?.length);
 if(!state?.enabled||state.nextAt>now||!view.approved||view.finished||view.renewing||view.needsProductionBudget||view.review&&!state.kick&&!pendingRevision||view.status==="rejected")return false;
 if(!view.error)return true;
 const r=state.supervision,c=r?.current;
 if(!r||r.exhausted||!c)return false;
 if(c.status==='pending')return true; // resume the saved analysis, never execute work yet
 return !c.used&&c.decision?.action==='retry-saved'&&state.nextAt<=now&&recoveryCapabilities(view.requests.map(q=>({...q,operation:q.operation??'unknown'})),true,false).includes('retry-saved');
}
export function backgroundAfterAttempt(previous:BackgroundState,error:string|null,now=Date.now()):BackgroundState{
 return {...previous,failures:error?Math.min(3,previous.failures+1):0,nextAt:now+(error?2000*2**previous.failures:4000)};
}
