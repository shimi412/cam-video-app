import path from 'node:path';
import {z} from 'zod';
import {readCheckpoint,saveCheckpoint} from '../concept/checkpoints';
import {PipelineRecovery,freshPipelineRecovery,consumeRecovery,recoveryView,type RecoveryContext} from './recovery-policy';
import {planPipelineRecovery,recoveryDiagnostic,recoveryHash} from './recovery-supervisor';
/** `reconciliations` journals a human-authorised reset of a stale `error` after the
 * executor itself was repaired; counters and history are never touched by it. */
const Step=z.object({recovery:PipelineRecovery,error:z.string().optional(),reconciliations:z.array(z.object({at:z.string(),reason:z.string(),clearedError:z.string()})).optional()});
/** Only wrap idempotent reads or persisted Claude turns. Never payments, approvals or media submission.
 * Caller holds the production lock. The exact input hash preserves recovery across HTTP/process retries. */
export async function supervisedStep<T>(input:{jobId:string;category:RecoveryContext['category'];stage:string;inputs:unknown;directory:string;assertOwned:()=>Promise<void>;execute:()=>Promise<T>}){
 const key=recoveryHash(input.inputs),file=path.join(input.directory,'recovery-actions',`${input.stage}-${key}.json`);
 const state=await readCheckpoint(file,Step)??{recovery:freshPipelineRecovery()};
 const save=()=>saveCheckpoint(file,state,input.assertOwned);
 while(true){
  if(state.error){
   const decision=await planPipelineRecovery(state.recovery,{jobId:input.jobId,category:input.category,workKey:key,stage:input.stage,error:state.error,requests:[],facts:{inputHash:key,inputs:input.inputs,execution:'Idempotent price/read or persisted reasoning turn only. No media or payment submission.'},allowed:['retry-saved','needs-attention']},save);
   if(!decision||decision.action!=='retry-saved'||state.recovery.exhausted)throw new RecoveryStepError(recoveryView(state.recovery)?.message??'Your saved request needs analysis.');
   const wait=Math.max(0,state.recovery.nextAt-Date.now());if(wait)await new Promise(r=>setTimeout(r,wait));
   consumeRecovery(state.recovery);state.error=undefined;await save();
  }
  try{const result=await input.execute();return result;}
  catch(error){state.error=recoveryDiagnostic(error);await save();}
 }
}
export class RecoveryStepError extends Error{}

/** Claude selects a specific local repair before its executor runs. The caller holds the job lock. */
export async function supervisedAudioCheck<T>(input:{jobId:string;inputs:unknown;directory:string;assertOwned:()=>Promise<void>;execute:()=>Promise<T>}){
 // The local Whisper recheck is free and deterministic: it runs without a paid Claude decision (2026-10-21).
 // Its outcome is journaled under the same checkpoint name for the record.
 const key=recoveryHash(input.inputs),file=path.join(input.directory,'recovery-actions',`audio-check-${key}.json`);
 const state=await readCheckpoint(file,PipelineRecovery)??freshPipelineRecovery();
 try{const result=await input.execute();state.history=[...state.history.slice(-2),{key,decision:{action:'check-saved-audio',reason:'Local Whisper recheck executed directly; no paid decision was needed.'}}];await saveCheckpoint(file,state,input.assertOwned).catch(()=>{});return result;}
 catch(error){state.history=[...state.history.slice(-2),{key,decision:{action:'needs-attention',reason:`Local Whisper recheck failed: ${(error instanceof Error?error.message:String(error)).slice(0,600)}`,clientMessage:'Your recording does not match the script after a local check. Review is required before animation.'}}];await saveCheckpoint(file,state,input.assertOwned).catch(()=>{});throw new RecoveryStepError('Your recording does not match the script after a local check. Review is required before animation.');}
}
