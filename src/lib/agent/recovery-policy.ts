import {z} from 'zod';
export const RecoveryAction=z.enum(['retry-saved','repair-code','check-saved-audio','review-budget','replace-failed','needs-attention']);
export const PipelineRecoveryDecision=z.object({action:RecoveryAction,reason:z.string().trim().min(10).max(800),clientMessage:z.string().trim().min(10).max(240).optional()}).strict();
export type PipelineRecoveryDecision=z.infer<typeof PipelineRecoveryDecision>;
export const RecoveryContext=z.object({jobId:z.string(),category:z.enum(['clay','motion','comics']),workKey:z.string(),stage:z.string(),error:z.string(),requests:z.array(z.object({operation:z.string(),state:z.string(),requestId:z.string().nullable()})),facts:z.record(z.string(),z.unknown()),allowed:z.array(RecoveryAction).min(1)});
export type RecoveryContext=z.infer<typeof RecoveryContext>;
export const PipelineRecovery=z.object({version:z.literal(1),attempts:z.number().int().min(0).max(3),nextAt:z.number().nonnegative(),exhausted:z.boolean().optional(),current:z.object({input:RecoveryContext.extend({attempt:z.number().int()}),key:z.string(),status:z.enum(['pending','decided','unavailable']),used:z.boolean(),decision:PipelineRecoveryDecision.optional()}).optional(),history:z.array(z.object({key:z.string(),decision:PipelineRecoveryDecision})).max(3)});
export type PipelineRecovery=z.infer<typeof PipelineRecovery>;
export const freshPipelineRecovery=():PipelineRecovery=>({version:1,attempts:0,nextAt:0,history:[]});
export function recoveryView(r:PipelineRecovery|undefined){
 if(!r)return null;
 const c=r.current;
 if(r.exhausted)return {action:'needs-attention' as const,message:'The saved recovery attempts could not resolve this issue. Your work is preserved for investigation.',pending:false};
 if(c?.status==='pending')return {action:null,message:'Please wait. We are analysing the interruption and preserving your work.',pending:true};
 if(c?.status==='unavailable')return {action:null,message:'The recovery analysis could not complete. Your work and the original request are saved. Retry the saved analysis when the service is available.',pending:false};
 return c?.decision?{action:c.decision.action,message:c.decision.clientMessage??(c.decision.action==='needs-attention'?'We could not finish this step. Your work is saved and the technical details are available to support.':c.decision.action==='review-budget'||c.decision.action==='replace-failed'?'Your work is saved. Review the updated price before continuing.':'Please wait. We are correcting this step using your saved work.'),pending:false}:null;
}
/** These are execution capabilities, not an error classifier. Claude chooses among them. */
export function recoveryCapabilities(requests:RecoveryContext['requests'],budgetValid:boolean,canReplace:boolean):PipelineRecoveryDecision['action'][] {
 const ambiguous=requests.some(r=>['sending','submitting'].includes(r.state));
 const failed=requests.some(r=>r.state==='failed');
 return ['needs-attention',...(!ambiguous&&!failed&&budgetValid?['retry-saved' as const]:[]),...(!budgetValid?['review-budget' as const]:[]),...(!ambiguous&&failed&&canReplace?['replace-failed' as const]:[])];
}
export function consumeRecovery(r:PipelineRecovery|undefined){if(r?.current){r.current.used=true;r.nextAt=0;}}
