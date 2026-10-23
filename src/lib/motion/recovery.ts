import {motionBudgets} from './budgets';
import {legacyMotionPrice} from './model';
import {z} from 'zod';
import {planPipelineRecovery,recoveryDependencies,recoveryDiagnostic} from '../agent/recovery-supervisor';
import {freshPipelineRecovery,type PipelineRecovery,type PipelineRecoveryDecision,type RecoveryContext} from '../agent/recovery-policy';
import type {MotionState} from './state';

export const RECOVERY_LIMIT=3;
export const RecoveryDecision=z.object({action:z.enum(['retry-saved','repair-code','needs-attention']),reason:z.string().min(5).max(800),clientMessage:z.string().trim().min(10).max(240).optional()}).strict();
export type RecoveryDecision=z.infer<typeof RecoveryDecision>;
export type RecoveryInput={id:string;revision:number;attempt:number;stage:string;error:string;hasFilm:boolean;voiceState?:string;writingState?:string;allowed?:PipelineRecoveryDecision['action'][];requests?:RecoveryContext['requests'];facts?:RecoveryContext['facts']};
export type MotionRecovery={supervision?:PipelineRecovery;enabled:boolean;attempts:number;nextAt:number;codeRepairs:number;/** Provider capacity refusals (402/429/5xx) retried on a timer, never a supervisor decision. */transientRetries?:number;history:{attempt:number;error:string;decision:RecoveryDecision}[];reconciliations?:{at:string;operation:string;reason:string}[]};
export const freshRecovery=():MotionRecovery=>({supervision:freshPipelineRecovery(),enabled:true,attempts:0,nextAt:0,codeRepairs:0,history:[]});
export function writingKey(s:MotionState){return `writing-${s.revision}${s.recovery?.codeRepairs?`-repair-${s.recovery.codeRepairs}`:''}`;}
// Compatibility with persisted exceptions emitted by our own request-budget
// guard. This identifies a ledger boundary, not an editorial recovery action.
export function internalAuthoringLimit(message:string){
 return /This production analysis exceeds the \$[\d.]+ remaining request budget\./.test(message)
  ||message.includes('This agent turn reached its budget.')
  ||message.includes('The agent cost exceeded its allowance.');
}
/** What the writer must correct: validator/build diagnostics, never our own
 * ledger-boundary messages, which describe spending and not the composition. */
export function writerRepairError(s:MotionState){
 const errors=s.recovery?.history.map(h=>h.error).filter(e=>!internalAuthoringLimit(e))??[];
 return (errors.length?errors:[s.recovery?.history.at(-1)?.error??s.error??'Saved composition failure']).join('\nPrevious failure:\n').slice(-6000);
}
export function legacyRepairContractFailure(s:MotionState){
 const r=s.recovery,c=r?.supervision?.current;
 return s.phase==='blocked'&&!r?.supervision?.exhausted&&(r?.supervision?.attempts??3)<3
  &&(r?.codeRepairs??2)<2&&c?.status==='decided'&&c.decision?.action==='needs-attention'
  &&!c.input.facts.authoringAllowance&&internalAuthoringLimit(c.input.error)
  &&Object.entries(s.operations).some(([key,o])=>key.startsWith(`writing-${s.revision}-repair-`)&&o.agentManaged&&o.input?.contract===4&&Boolean(o.input.repair?.failedSource));
}

/** A contract-5 repair turn whose pinned input is saved and whose last stop was
 * our own ledger boundary, not a model answer, can be resumed under its unchanged
 * identity and allowance. Resuming never buys a different turn or a new decision. */
export function resumableRepairTurn(s:MotionState){
 const key=writingKey(s),o=s.operations[key];
 // A failed turn (step or allowance limit) is resumable only from a closer saved candidate, which Resume re-pins.
 return s.phase==='blocked'&&Boolean(s.recovery?.codeRepairs)&&(o?.state==='sending'||o?.state==='failed')&&o.agentManaged===true&&o.input?.contract===5&&Boolean(o.input.repair?.failedFilm)?key:null;
}
/** An agent writing turn (contract 6) that stopped (provider error, process death,
 * step or allowance limit) resumes under its unchanged identity: the runtime
 * continues the persisted messages and the saved working file. When the turn is
 * exhausted, the worker's normal failure path offers a repair attempt seeded
 * from that file. Resume never buys a different turn here. */
export function resumableAgentWriting(s:MotionState){
 const key=writingKey(s),o=s.operations[key];
 return s.phase==='blocked'&&(o?.state==='sending'||o?.state==='failed')&&o.agentManaged===true&&o.input?.contract===6?key:null;
}
/** An initial writing that stopped before any candidate existed (schema or
 * format rejection) can be restarted as a fresh bounded turn after an executor
 * fix; the stopped operation and its receipts stay journaled. */
export function restartableWriting(s:MotionState){
 const key=`writing-${s.revision}`,o=s.operations[key];
 // 'sending' with no candidate: the executor stopped before or during its request (live on 2026-10-21: the writer's own budget guard rejected the Fable caps before any transport). A restart reuses the same turn identity, so a request already saved is resumed, never paid twice.
 return s.phase==='blocked'&&s.work==='initial'&&Boolean(s.timing)&&(o?.state==='failed'||o?.state==='sending')&&o.agentManaged===true&&!(o.result&&typeof o.result==='object'&&'source' in (o.result as object))&&!(s.recovery?.codeRepairs)?key:null;
}
/** A completed recording whose transcript check stopped the job can always be
 * rechecked locally for free; a later executor fix may clear the stop. */
export function savedRecordingRecheck(s:MotionState){
 return s.phase==='blocked'&&s.operations.voice?.state==='complete'&&!s.timing&&s.work==='initial';
}
/** Old diagnoses confused rejected source with absent source. Offer one explicit
 * re-analysis using the preserved evidence; never auto-enqueue a client test. */
export function incompleteMotionDiagnosis(s:MotionState){
 const r=s.recovery,c=r?.supervision?.current;
 return legacyRepairContractFailure(s)||s.phase==='blocked'&&!r?.supervision?.exhausted&&(r?.supervision?.attempts??3)<3&&c?.status==='decided'&&c.decision?.action==='needs-attention'&&c.input.facts.hasFilm===false&&!c.input.facts.savedCandidates&&Object.entries(s.operations).some(([key,o])=>key.startsWith(`writing-${s.revision}`)&&o.state==='failed'&&o.result&&typeof o.result==='object'&&typeof (o.result as {source?:unknown}).source==='string');
}

export function motionStage(s:Pick<MotionState,'phase'|'work'>){return s.phase==='complete'?3:s.phase==='visuals'||s.phase==='board'?1:s.phase==='finishing'||s.work==='finish'?2:0;}
/** Certain submission outcomes and spending/identity guards cannot be waived by a model. */
export function hardRecoveryStop(s:MotionState){
 return Object.entries(s.operations).some(([key,o])=>o.state==='sending'&&(key==='voice'||!o.agentManaged||!o.input));
}
export async function diagnoseMotionFailure(input:RecoveryInput):Promise<RecoveryDecision>{
 const result=await recoveryDependencies.diagnose({jobId:input.id,category:'motion',workKey:`${input.revision}:${input.stage}`,stage:input.stage,error:input.error,attempt:input.attempt,requests:input.requests??[],facts:input.facts??{hasFilm:input.hasFilm,voiceState:input.voiceState,writingState:input.writingState},allowed:input.allowed??['retry-saved','repair-code','needs-attention']});
 return RecoveryDecision.parse(result);
}
export async function planMotionRecovery(s:MotionState,error:unknown,diagnose:(input:RecoveryInput)=>Promise<RecoveryDecision>,id:string,save:()=>Promise<unknown>=async()=>{}){
 const message=recoveryDiagnostic(error),r=s.recovery;
 if(!r?.enabled)return false;
 r.supervision??={...freshPipelineRecovery(),attempts:Math.min(3,r.attempts)};
 const candidates=Object.entries(s.operations).filter(([key,o])=>key.startsWith(`writing-${s.revision}`)&&o.result&&typeof o.result==='object'&&typeof (o.result as {source?:unknown}).source==='string').map(([operation,o])=>({operation,state:o.state,source:(o.result as {source:string}).source}));
 const hasSource=candidates.length>0;
 // A turn that reached its internal allowance has nothing left to resume: the
 // same request would stop on the same ledger boundary. Offer repair or stop.
 const allowanceReached=internalAuthoringLimit(message);
 const allowed:PipelineRecoveryDecision['action'][]=hardRecoveryStop(s)?['needs-attention']:[...(allowanceReached?[]:['retry-saved' as const]),'needs-attention',...(s.work!=='finish'&&hasSource&&r.codeRepairs<2?['repair-code' as const]:[])];
 const decision=await planPipelineRecovery(r.supervision,{jobId:id,category:'motion',workKey:`${s.revision}:${s.work}`,stage:s.work,error:message,requests:Object.entries(s.operations).map(([operation,o])=>({operation,state:o.state,requestId:o.id??null})),facts:{hasFilm:hasSource,hasValidatedFilm:s.operations[writingKey(s)]?.state==='complete',savedCandidates:candidates,authoringAllowance:{scope:'internal-per-turn',customerPriceUsd:s.acceptedPriceUsd??legacyMotionPrice(s.revision),customerPriceChangeRequired:false,failedTurnReachedLimit:allowanceReached,retrySavedAvailable:!allowanceReached,remainingRepairTurns:Math.max(0,2-r.codeRepairs),perRepairUsd:motionBudgets().repairUsd,reservedVisualReviewUsd:motionBudgets().reviewUsd,instruction:'The writer allowance is an internal execution limit, not a customer wallet or price limit. A turn that reached it cannot be resumed; a repair-code turn starts a new bounded turn with the saved candidate and its current validator diagnostic, available only if listed in allowed. Do not request a customer top-up or claim an approved-price overrun from this exception. If the remaining supported work cannot resolve it, report a technical interruption and preserve the actual diagnostic.'},repairInstruction:hasSource?'Unvalidated source is available for repair. A failed writing operation is not missing code. Use the concrete validator diagnostic and saved source.':undefined,voiceState:s.operations.voice?.state,writingState:s.operations[writingKey(s)]?.state},allowed},async()=>{r.attempts=r.supervision!.attempts;await save();},async input=>diagnose({id,revision:s.revision,attempt:input.attempt,stage:s.work,error:input.error,hasFilm:Boolean(input.facts.hasFilm),voiceState:input.facts.voiceState as string|undefined,writingState:input.facts.writingState as string|undefined,allowed:input.allowed,requests:input.requests,facts:input.facts}));
 if(!decision)return false;
 r.history.push({attempt:r.attempts,error:message,decision:RecoveryDecision.parse(decision)});
 if(decision.action==='needs-attention')return false;
 if(decision.action==='repair-code')r.codeRepairs++;
 r.nextAt=r.supervision.nextAt;
 s.phase='queued';s.error=undefined;s.progress=decision.action==='repair-code'?'Please wait — correcting the composition and checking it again':'Please wait — resuming your saved work';
 return true;
}
