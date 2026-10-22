/** Read a real failed answer and replay only its local exchange/assembly in QA.
 * No writer, provider, worker, approval or live-state mutation is called. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pool} from '../src/db';
import {Film,digest} from '../src/lib/motion/model';
import {MotionExchange,exchangeAnswer} from '../src/lib/motion/exchange';
import {saveCompositionCandidate,savedRepairBase} from '../src/lib/motion/candidate';
import {assembleMotionRuntime} from '../src/lib/motion/assembly';
import {publicMotion,type MotionState} from '../src/lib/motion/state';
import {canonicalRecovery} from '../src/lib/agent/recovery-supervisor';
import type {TurnState} from '../src/lib/agent/store';
import {z} from 'zod';
const id=z.uuid().parse(process.argv[2]),dir=path.resolve('storage/qa',`motion-contract-${id}`);
let externalCalls=0;
globalThis.fetch=async()=>{externalCalls++;throw Error('External calls prohibited in saved-contract replay');};
const snapshot=async()=>{
 const state=(await pool.query('SELECT state FROM motion_runs WHERE job_id=$1',[id])).rows[0]?.state as MotionState;
 assert(state,'Missing Motion state');
 const calls=(await pool.query('SELECT * FROM api_calls WHERE job_id=$1 ORDER BY id',[id])).rows;
 const turns=(await pool.query('SELECT id,input_hash,state FROM cam_agent_turns WHERE session_id=$1 ORDER BY updated_at DESC',[id])).rows as {id:string;input_hash:string;state:TurnState}[];
 return {state,calls,turns,voiceHash:digest(await readFile(path.resolve('storage/motion',id,'voix.wav')))};
};
async function main(){
 const before=await snapshot();await mkdir(dir,{recursive:true});
 const input=before.state.operations['writing-0-repair-1']?.input;
 assert(input?.repair?.failedSource,'Expected the saved legacy repair input');
 const base=await savedRepairBase(path.resolve('storage/motion',id),input.repair.failedSource);
 const turn=before.turns.find(t=>t.state.messages.some(m=>typeof m.content==='string'&&m.content.includes('Candidate source SHA256 none')));
 assert(turn,'Expected the historical missing-base rejection');
 const call=[...turn.state.messages].reverse().find(m=>m.role==='assistant')!.tool_calls![0];
 const answer=exchangeAnswer(MotionExchange.parse(JSON.parse(call.function.arguments)));
 const repaired=await saveCompositionCandidate(path.join(dir,'replayed-candidate.json'),answer,base);
 assert.notEqual(repaired.source,base.source);Film.parse(repaired);
 const reference=await readFile('motion/reference/plot-hole-v4-safe.py','utf8');
 const diagnose=async(film:typeof base)=>{try{await assembleMotionRuntime(film,reference,before.state.timing!);return null;}catch(e){return e instanceof Error?e.message:String(e);}};
 const originalDiagnostic=await diagnose(base),repairDiagnostic=await diagnose(repaired);
 assert.match(originalDiagnostic??'',/integer narration phrase IDs/);
 // The received fix also conflicts with the footer contract. Preserve this
 // finding instead of silently choosing one of two different sound maps.
 assert.match(repairDiagnostic??'',/Repeated sound configuration|requires SUBS, VIS and MARKS/);
 const view=publicMotion(id,before.state);
 assert.equal(view.canResume,true);assert.equal(view.stage,0);
 assert(!view.error?.includes('exceed the currently approved budget'));
 const after=await snapshot();
 assert.deepEqual(after,before);assert.equal(externalCalls,0);
 const report={id,at:new Date().toISOString(),sourceHash:digest(base.source),repairedSourceHash:digest(repaired.source),stateHash:digest(JSON.stringify(canonicalRecovery(before.state))),voiceHash:before.voiceHash,paidReceipts:before.calls.length,unchangedLiveStateAndReceipts:true,externalCalls,originalDiagnostic,repairDiagnostic,canResume:view.canResume,filmReady:false,limitation:'The saved reply still needs a Claude composition correction. No live generation or human approval was performed.'};
 await writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());
