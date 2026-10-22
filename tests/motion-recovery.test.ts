import {AgentPlanFailure} from '../src/lib/agent/runtime';
import {digest} from '../src/lib/motion/model';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import type {MotionState} from '../src/lib/motion/state';
import {freshRecovery,planMotionRecovery,motionStage,writingKey} from '../src/lib/motion/recovery';
const store=vi.hoisted(()=>({state:null as unknown,dir:'',saved:[] as unknown[]}));
vi.mock('../src/db',()=>({pool:{query:vi.fn(async()=>({rows:[]}))}}));
vi.mock('../src/lib/agent/observations',()=>({observeVideo:vi.fn()}));
vi.mock('../src/lib/motion/store',()=>({getMotion:async()=>structuredClone(store.state),saveMotion:async(_id:string,s:unknown)=>{store.state=structuredClone(s);store.saved.push(structuredClone(s));},lockMotion:async(_id:string,fn:()=>unknown)=>fn(),motionDirectory:()=>store.dir,motionQuote:vi.fn(),newMotion:vi.fn()}));
vi.mock('../src/lib/customer-wallet',()=>({reserveCredits:vi.fn(),settleCredits:vi.fn()}));
import {runMotion,type MotionDependencies} from '../src/lib/motion/service';
let film:Awaited<ReturnType<MotionDependencies['write']>>['film'];
const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const state=()=>store.state as MotionState;
beforeEach(async()=>{vi.stubEnv('CAM_MOTION_WRITER','legacy');store.dir=await mkdtemp(path.join(os.tmpdir(),'motion-recovery-test-'));store.saved=[];const timing=JSON.parse(await readFile('motion/template/timing.json','utf8'));film={source:await readFile('motion/reference/plot-hole-v4-safe.py','utf8'),referenceChoice:'Reference rhythm preserved.',removedWords:[],scenes:timing.phrases.map((p:{phrase:number},i:number)=>({id:`s${i+1}`,phrase:p.phrase,movement:'Letters enter.',meaning:'Explain this line.'}))};store.state={version:1,phase:'queued',revision:0,title:'Test',script:timing.phrases.map((p:{text:string})=>p.text).join(' '),progress:'Start',work:'initial',targets:[],feedback:'',deferredFeedback:'',timing,voice:'saved.wav',votes:{},receipts:[],operations:{voice:{state:'complete',id:'saved-voice'}},approved:{},settings:{music:'normal',captions:true},history:[],recovery:freshRecovery()} satisfies MotionState;});
afterEach(async()=>{vi.unstubAllEnvs();await rm(store.dir,{recursive:true,force:true});});
function deps():MotionDependencies{return {voice:vi.fn(),write:vi.fn(async()=>({film,creativeApproval:{sourceHash:digest(film.source),reviewHash:'a'.repeat(64),model:'anthropic/claude-fixture'},receipt:{kind:'writing' as const,requestId:'code',actualUsd:0,model:'fixture'}})),build:vi.fn(async()=>{await mkdir(store.dir,{recursive:true});await writeFile(path.join(store.dir,'preview.mp4'),'complete preview');return {htmlSha256:'html',audit:{} as never,checks:{holds:0,offsets:[0],safeZoneViolations:[],removedWordViolations:[],sfxBelowVoiceDb:18,mixLufs:-17,logo:true}};}),finish:vi.fn(),authorize:async(_id,fn)=>fn(),diagnose:vi.fn(async()=>({action:'repair-code' as const,reason:'Repair the actual layout failure.'}))};}
it('diagnoses a build error, persists retry, repairs only code and returns to human storyboard review',async()=>{const d=deps(),build=d.build;d.build=vi.fn().mockRejectedValueOnce(Error('Quality checks need correction: safe reading area')).mockImplementation(build);await runMotion(id,'owner',d);expect(state().phase).toBe('queued');expect(state().recovery?.codeRepairs).toBe(1);expect(state().recovery?.history[0].error).toContain('safe reading area');expect((store.saved as MotionState[]).some(s=>s.recovery?.attempts===1&&s.phase==='working')).toBe(true);store.state=JSON.parse(JSON.stringify(store.state));state().recovery!.nextAt=0;await runMotion(id,'owner',d,true);expect(state().phase).toBe('visuals');expect(state().approved).toEqual({board:0});expect(d.voice).not.toHaveBeenCalled();expect(d.write).toHaveBeenCalledTimes(2);expect(vi.mocked(d.write).mock.calls[1][0].repair?.failedFilm).toEqual(film);expect(state().operations['writing-0'].state).toBe('complete');expect(state().operations['writing-0-repair-1'].state).toBe('complete');});
it('restarts an interrupted worker with saved code, without repeating the paid writer',async()=>{state().phase='working';state().operations['writing-0']={state:'complete',result:film,agentManaged:true};const d=deps();await runMotion(id,'owner',d,true);expect(state().phase).toBe('visuals');expect(d.write).not.toHaveBeenCalled();expect(d.voice).not.toHaveBeenCalled();});
it('does not adopt legacy blocked jobs on background discovery',async()=>{state().phase='blocked';state().recovery=undefined;const d=deps();await runMotion(id,'owner',d,true);expect(state().phase).toBe('blocked');expect(d.write).not.toHaveBeenCalled();});
it('never turns uncertain submissions into another generation',async()=>{state().voice=undefined;state().timing=undefined;state().operations.voice={state:'sending'};const d=deps();d.voice=vi.fn(async()=>{throw Error('Recording submission needs reconciliation.');});await runMotion(id,'owner',d);expect(state().phase).toBe('blocked');expect(d.diagnose).toHaveBeenCalledTimes(1);expect(d.write).not.toHaveBeenCalled();});
it('bounds paid diagnosis and code repair across persisted retries',async()=>{const d=deps();d.build=vi.fn(async()=>{throw Error('Quality checks need correction: layout');});for(let i=0;i<5;i++){state().recovery!.nextAt=0;await runMotion(id,'owner',d,true);}expect(state().phase).toBe('blocked');expect(d.write).toHaveBeenCalledTimes(3);expect(d.diagnose).toHaveBeenCalledTimes(3);expect(state().recovery?.attempts).toBe(3);expect(state().recovery?.codeRepairs).toBe(2);});
it('keeps blocked preparation and finishing at their real journey stage',()=>{state().phase='blocked';expect(motionStage(state())).toBe(0);state().work='finish';expect(motionStage(state())).toBe(2);state().phase='complete';expect(motionStage(state())).toBe(3);});
it('cannot use diagnosis to waive a budget or rewrite approved finishing visuals',async()=>{const diagnose=vi.fn(async()=>({action:'retry-saved' as const,reason:'Retry local work.'}));const approval=structuredClone(state().approved);expect(await planMotionRecovery(state(),Error('Budget exhausted'),diagnose,id)).toBe(true);expect(state().approved).toEqual(approval);expect(diagnose).toHaveBeenCalledTimes(1);state().work='finish';expect(await planMotionRecovery(state(),Error('Render failed'),async()=>({action:'repair-code',reason:'Rewrite the source'}),id)).toBe(false);expect(writingKey(state())).toBe('writing-0');});
it('reuses the exact persisted writer input after process interruption',async()=>{state().phase='working';const input={jobId:id,revision:0,script:state().script,timing:state().timing!,targets:[],feedback:'Original accepted note'};state().operations['writing-0']={state:'sending',agentManaged:true,input};state().feedback='A later annotation must not change a sent request';const d=deps();await runMotion(id,'owner',d,true);expect(vi.mocked(d.write).mock.calls[0][0]).toEqual(input);expect(state().phase).toBe('visuals');});
it('requires reconciliation for a legacy in-flight writer without pinned inputs',async()=>{state().phase='working';state().operations['writing-0']={state:'sending',agentManaged:true};const d=deps();await runMotion(id,'owner',d,true);expect(d.write).not.toHaveBeenCalled();expect(d.diagnose).toHaveBeenCalledTimes(1);expect(state().phase).toBe('blocked');});

it('publishes technically valid code even when the consultative review is missing (senior review 2026-10-21), without notes',async()=>{const d=deps();d.write=vi.fn(async()=>({film,receipt:{kind:'writing' as const,requestId:'fixture',model:'fixture',actualUsd:0}}));await runMotion(id,'owner',d);expect(state().phase).toBe('visuals');expect(state().creativeApproval).toBeUndefined();expect(d.build).toHaveBeenCalledTimes(1);expect(d.diagnose).not.toHaveBeenCalled();});

it('returns a creative rejection to Claude repair with the note and saved source intact',async()=>{state().feedback='Make the logo organic to the opening';state().targets=['s1'];const d=deps(),original=d.write;d.write=vi.fn().mockRejectedValueOnce(new AgentPlanFailure('Creative review needs correction: the logo is a disconnected card',film)).mockImplementation(original);await runMotion(id,'owner',d);expect(state().phase).toBe('queued');expect(state().recovery?.codeRepairs).toBe(1);expect(d.build).not.toHaveBeenCalled();state().recovery!.nextAt=0;await runMotion(id,'owner',d,true);const next=vi.mocked(d.write).mock.calls[1][0];expect(next.feedback).toBe('Make the logo organic to the opening');expect(next.repair?.failedFilm).toEqual(film);expect(next.repair?.error).toContain('disconnected card');expect(state().phase).toBe('visuals');});
it('resumes an interrupted diagnosis before running the saved job, with identical Claude input',async()=>{
 const {actMotion}=await import('../src/lib/motion/service');const d=deps(),build=d.build;
 d.build=vi.fn().mockRejectedValueOnce(Error('Temporary local read interruption')).mockImplementation(build);
 d.diagnose=vi.fn().mockRejectedValueOnce(Error('Connection interrupted during analysis')).mockResolvedValue({action:'retry-saved',reason:'Read the existing saved code again after the temporary interruption.'});
 await runMotion(id,'owner',d);expect(state().phase).toBe('blocked');expect(state().recovery?.supervision?.current?.status).toBe('unavailable');
 const first=structuredClone(vi.mocked(d.diagnose).mock.calls[0][0]);store.state=JSON.parse(JSON.stringify(store.state));
 await actMotion(id,'owner',{type:'resume',revision:0});await runMotion(id,'owner',d,true);
 expect(vi.mocked(d.diagnose).mock.calls[1][0]).toEqual(first);expect(d.build).toHaveBeenCalledTimes(1);
 state().recovery!.nextAt=0;await runMotion(id,'owner',d,true);expect(state().phase).toBe('visuals');expect(d.build).toHaveBeenCalledTimes(2);expect(d.write).toHaveBeenCalledTimes(1);
});

it('gives the recovery agent rejected source and the concrete diagnostic, not only completion status',async()=>{
 const d=deps();d.write=vi.fn(async()=>{throw new AgentPlanFailure('Composition line 9: def scene(). Repeated validation failure.',film);});
 await runMotion(id,'owner',d);const input=vi.mocked(d.diagnose!).mock.calls[0][0];
 expect(input.hasFilm).toBe(true);expect(input.facts?.hasValidatedFilm).toBe(false);expect(input.facts?.savedCandidates).toEqual([{operation:'writing-0',state:'failed',source:film.source}]);expect(input.error).toContain('def scene()');expect(input.allowed).toContain('repair-code');expect(state().phase).toBe('queued');
});
it('distinguishes an internal writer allowance from the approved customer price, including legacy display',async()=>{
 const {publicMotion}=await import('../src/lib/motion/state');state().acceptedPriceUsd=10;
 state().operations['writing-0']={state:'failed',agentManaged:true,result:film};
 state().recovery!.codeRepairs=1;
 const diagnose=vi.fn(async()=>({action:'needs-attention' as const,reason:'The request could not fit another answer.',clientMessage:'You must approve an increased budget.'}));
 await planMotionRecovery(state(),Error('This production analysis exceeds the $0.12 remaining request budget.'),diagnose,id);
 state().phase='blocked';state().error='You must approve an increased budget.';
 const facts=diagnose.mock.calls[0] as unknown as [{facts:Record<string,unknown>}];
 expect(facts[0].facts.authoringAllowance).toMatchObject({scope:'internal-per-turn',customerPriceUsd:10,customerPriceChangeRequired:false,failedTurnReachedLimit:true,remainingRepairTurns:1});
 expect(publicMotion(id,state()).error).toContain('not a request for additional payment');
 expect(state().acceptedPriceUsd).toBe(10);expect(state().recovery!.supervision!.current!.decision!.clientMessage).toContain('increased budget');
});
it('keeps internal recovery diagnostics out of the public motion response, including saved legacy failures',async()=>{
 const {publicMotion}=await import('../src/lib/motion/state');state().phase='blocked';state().error='Writing-0 retry-saved deterministic failure /private/path';
 await planMotionRecovery(state(),state().error!,async()=>({action:'needs-attention',reason:state().error!}),id);
 const view=publicMotion(id,state());expect(view.error).not.toContain('Writing-0');expect(view.error).not.toContain('/private');expect(state().recovery?.history[0].error).toContain('Writing-0');
});

it('offers explicit re-analysis of an old incomplete diagnosis using its original rejected answer, with no work before the click',async()=>{
 const {pool}=await import('../src/db'),{actMotion}=await import('../src/lib/motion/service'),{publicMotion}=await import('../src/lib/motion/state');
 await planMotionRecovery(state(),Error('Repeated identical validation failure'),async()=>({action:'needs-attention',reason:'No code seems available to repair.'}),id);
 state().phase='blocked';state().error='No code seems available to repair.';state().operations['writing-0']={state:'failed',agentManaged:true,result:film};
 delete state().recovery!.supervision!.current!.input.facts.savedCandidates;
 const history=structuredClone(state().recovery!.supervision!.history);expect(publicMotion(id,state()).canResume).toBe(true);
 vi.mocked(pool.query).mockResolvedValueOnce({rows:[{state:{messages:[{role:'user',content:[{type:'text',text:JSON.stringify({currentRequest:JSON.stringify({jobId:id,revision:0})})}]},{role:'assistant',tool_calls:[{id:'saved',function:{name:'submit_plan'}}]},{role:'tool',tool_call_id:'saved',content:JSON.stringify({accepted:false,error:'Composition line 9: def scene() duplicates the runtime'})}]}}]} as never);
 await actMotion(id,'owner',{type:'resume',revision:0});expect(state().error).toContain('Composition line 9');expect(state().recovery!.supervision!.history).toEqual(history);
 const d=deps();await runMotion(id,'owner',d,true);expect(d.diagnose).toHaveBeenCalledTimes(1);expect(d.write).not.toHaveBeenCalled();expect(d.voice).not.toHaveBeenCalled();expect(state().phase).toBe('queued');expect(state().recovery?.codeRepairs).toBe(1);
});
it('reconciles the old missing repair base only after Resume, using remaining caps and a new versioned repair input',async()=>{
 const {pool}=await import('../src/db'),{actMotion}=await import('../src/lib/motion/service'),{publicMotion}=await import('../src/lib/motion/state');
 state().operations['writing-0']={state:'failed',agentManaged:true,result:film};
 state().operations['writing-0-repair-1']={state:'sending',agentManaged:true,input:{contract:4,jobId:id,revision:0,script:state().script,timing:state().timing!,targets:[],feedback:'',repair:{attempt:1,error:'KeyError: 1',failedSource:film.source}}};
 state().recovery!.codeRepairs=1;
 await planMotionRecovery(state(),Error('This production analysis exceeds the $0.12 remaining request budget.'),async()=>({action:'needs-attention',reason:'The previous repair was unable to continue.'}),id);
 state().recovery!.supervision!.attempts=2;state().recovery!.attempts=2;
 delete state().recovery!.supervision!.current!.input.facts.authoringAllowance;
 state().phase='blocked';state().error='Old customer-budget message';
 const oldInput=structuredClone(state().operations['writing-0-repair-1'].input),history=structuredClone(state().recovery!.supervision!.history);
 expect(publicMotion(id,state()).canResume).toBe(true);
 vi.mocked(pool.query).mockResolvedValueOnce({rows:[{state:{messages:[{role:'user',content:[{type:'text',text:JSON.stringify({currentRequest:JSON.stringify({jobId:id,revision:0})})}]},{role:'assistant',tool_calls:[{id:'saved',function:{name:'submit_plan'}}]},{role:'tool',tool_call_id:'saved',content:JSON.stringify({accepted:false,error:'Candidate source SHA256 none. Candidate unchanged.'})}]}}]} as never);
 await actMotion(id,'owner',{type:'resume',revision:0});expect(state().recovery!.supervision!.attempts).toBe(2);expect(state().recovery!.supervision!.history).toEqual(history);
 const d=deps();await runMotion(id,'owner',d,true);expect(d.write).not.toHaveBeenCalled();
 expect(state().recovery!.attempts).toBe(3);expect(state().recovery!.codeRepairs).toBe(2);
 state().recovery!.nextAt=0;await runMotion(id,'owner',d,true);
 expect(state().phase).toBe('visuals');expect(d.voice).not.toHaveBeenCalled();
 expect(vi.mocked(d.write).mock.calls[0][0]).toMatchObject({contract:5,repair:{failedFilm:film,attempt:2}});
 expect(state().operations['writing-0-repair-1'].input).toEqual(oldInput);
});
it('offers no retry-saved when the writer turn reached its internal allowance, and says why',async()=>{
 const diagnose=vi.fn(async()=>({action:'needs-attention' as const,reason:'Nothing left to resume in that turn.'}));
 state().operations['writing-0']={state:'failed',agentManaged:true,result:film};
 await planMotionRecovery(state(),Error('This production analysis exceeds the $0.12 remaining request budget.'),diagnose,id);
 const input=(diagnose.mock.calls as unknown as [unknown][])[0][0] as {allowed:string[];facts:{authoringAllowance:{retrySavedAvailable:boolean;customerPriceChangeRequired:boolean}}};
 expect(input.allowed).toEqual(['needs-attention','repair-code']);
 expect(input.facts.authoringAllowance).toMatchObject({retrySavedAvailable:false,customerPriceChangeRequired:false});
 const transient=vi.fn(async()=>({action:'retry-saved' as const,reason:'Read the saved answer again.'}));
 await planMotionRecovery(state(),Error('Temporary local read interruption'),transient,id);
 expect(((transient.mock.calls as unknown as [unknown][])[0][0] as {allowed:string[]}).allowed).toContain('retry-saved');
});
it('hands the writer the current validator diagnostic of the exact saved source, never a ledger message',async()=>{
 const broken={...film,source:film.source.replace('VIS = {1: ws(0)',"VIS = {'sA': 'T_A'"),scenes:film.scenes.map((scene,i)=>({...scene,id:'s'+String.fromCharCode(65+i)}))};
 state().operations['writing-0']={state:'failed',agentManaged:true,result:broken};
 state().recovery!.codeRepairs=1;state().recovery!.attempts=2;
 state().recovery!.history=[{attempt:1,error:'Last tool result: KeyError: 1',decision:{action:'repair-code',reason:'Repair the timing map.'}},{attempt:2,error:'This production analysis exceeds the $0.12 remaining request budget.',decision:{action:'repair-code',reason:'A new bounded turn.'}}];
 const d=deps();await runMotion(id,'owner',d);
 const input=vi.mocked(d.write).mock.calls[0][0];
 expect(input.contract).toBe(5);expect(input.repair?.failedFilm).toEqual(broken);
 expect(input.repair?.error).toContain('KeyError: 1');expect(input.repair?.error).not.toContain('remaining request budget');
 expect(input.repair?.currentDiagnostic).toMatch(/integer narration phrase IDs/);
 expect(state().operations['writing-0-repair-1'].input).toEqual(input);
 expect(state().phase).toBe('visuals');
});
it('resumes a saved contract-5 repair turn after an executor stop, journaling the reconciliation without new decisions',async()=>{
 const {actMotion}=await import('../src/lib/motion/service'),{publicMotion}=await import('../src/lib/motion/state');
 const input={contract:5 as const,jobId:id,revision:0,script:state().script,timing:state().timing!,targets:[],feedback:'',repair:{attempt:2,error:'KeyError: 1',failedFilm:film}};
 state().operations['writing-0']={state:'failed',agentManaged:true,result:film};
 state().operations['writing-0-repair-2']={state:'sending',agentManaged:true,input};
 state().recovery!.codeRepairs=2;state().recovery!.attempts=3;state().recovery!.supervision={...state().recovery!.supervision!,attempts:3,exhausted:true};
 state().phase='blocked';state().error='The saved recovery attempts could not resolve this issue.';
 expect(publicMotion(id,state()).canResume).toBe(true);
 await actMotion(id,'owner',{type:'resume',revision:0});
 expect(state().phase).toBe('queued');expect(state().recovery!.reconciliations).toHaveLength(1);expect(state().recovery!.reconciliations![0].operation).toBe('writing-0-repair-2');
 expect(state().recovery!.attempts).toBe(3);expect(state().recovery!.codeRepairs).toBe(2);
 const d=deps();await runMotion(id,'owner',d,true);
 expect(d.diagnose).not.toHaveBeenCalled();expect(vi.mocked(d.write).mock.calls[0][0]).toEqual(input);expect(state().phase).toBe('visuals');
 // A failed turn is resumable only when a closer saved candidate exists to re-pin.
 state().phase='blocked';state().operations['writing-0-repair-2'].state='failed';expect(publicMotion(id,state()).canResume).toBe(true);await actMotion(id,'owner',{type:'resume',revision:0});expect(state().operations['writing-0-repair-2'].input?.repair?.resumption).toBe(1);
});
it('resumes a failed contract-5 repair only from a closer saved candidate, re-pinning the base and journaling it',async()=>{
 const {actMotion}=await import('../src/lib/motion/service'),{publicMotion}=await import('../src/lib/motion/state');
 const input={contract:5 as const,jobId:id,revision:0,script:state().script,timing:state().timing!,targets:[],feedback:'',repair:{attempt:2,error:'KeyError: 1',failedFilm:film}};
 state().operations['writing-0-repair-2']={state:'failed',agentManaged:true,input,result:film};
 state().recovery!.codeRepairs=2;state().recovery!.attempts=3;state().phase='blocked';state().error='stopped';
 expect(publicMotion(id,state()).canResume).toBe(true);
 // Without a closer candidate, a failed turn restarts as a fresh bounded turn that knows the previous stop.
 state().voice=undefined;
 await actMotion(id,'owner',{type:'resume',revision:0});
 expect(state().phase).toBe('queued');expect(state().operations['writing-0-repair-2'].state).toBe('sending');expect(state().operations['writing-0-repair-2'].input?.repair?.resumption).toBe(1);expect(state().operations['writing-0-repair-2'].input?.repair?.previousAttempt).toContain('stopped');expect(state().operations['writing-0-repair-2'].previousInputs).toHaveLength(1);
});
it('restarts an initial writing still marked as sending when the executor stopped before any request, as on 2026-10-21 with the Fable budget guard',async()=>{
 const {actMotion}=await import('../src/lib/motion/service'),{publicMotion}=await import('../src/lib/motion/state');
 state().operations['writing-0']={state:'sending',agentManaged:true,input:{contract:5,jobId:id,revision:0,script:state().script,timing:state().timing!,targets:[],feedback:''}};
 state().phase='blocked';state().error='Invalid motion writing budget.';
 expect(publicMotion(id,state()).canResume).toBe(true);
 await actMotion(id,'owner',{type:'resume',revision:0});
 expect(state().phase).toBe('queued');expect(state().operations['writing-0']).toBeUndefined();expect(state().operations['writing-0-stopped-1'].state).toBe('sending');expect(state().recovery?.reconciliations?.at(-1)?.operation).toBe('writing-0');
 const d=deps();await runMotion(id,'owner',d,true);expect(d.write).toHaveBeenCalledTimes(1);expect(state().phase).toBe('visuals');
});
it('restarts an initial writing that stopped before any candidate as a fresh turn, keeping the stopped operation journaled',async()=>{
 const {actMotion}=await import('../src/lib/motion/service'),{publicMotion}=await import('../src/lib/motion/state');
 state().operations['writing-0']={state:'failed',agentManaged:true,input:{contract:5,jobId:id,revision:0,script:state().script,timing:state().timing!,targets:[],feedback:''},result:{failure:'schema'}};
 state().phase='blocked';state().error='formatting issue';
 expect(publicMotion(id,state()).canResume).toBe(true);
 await actMotion(id,'owner',{type:'resume',revision:0});
 expect(state().phase).toBe('queued');expect(state().operations['writing-0']).toBeUndefined();expect(state().operations['writing-0-stopped-1'].state).toBe('failed');
 const d=deps();await runMotion(id,'owner',d,true);expect(d.write).toHaveBeenCalledTimes(1);expect(d.diagnose).not.toHaveBeenCalled();expect(state().phase).toBe('visuals');
});

it('agent writer (contract 6): a turn stopped at its allowance continues from its saved file as the next bounded attempt, without a supervisor decision',async()=>{
 vi.stubEnv('CAM_MOTION_WRITER','agent');
 const d=deps(),original=d.write;
 d.write=vi.fn().mockRejectedValueOnce(new AgentPlanFailure('This agent turn reached its budget. Your work is saved.',film)).mockImplementation(original);
 await runMotion(id,'owner',d);
 expect(state().phase).toBe('queued');expect(state().recovery?.codeRepairs).toBe(1);expect(d.diagnose).not.toHaveBeenCalled();expect(state().operations['writing-0'].state).toBe('failed');expect(state().recovery?.history.at(-1)?.decision.action).toBe('repair-code');
 await runMotion(id,'owner',d,true);
 const next=vi.mocked(d.write).mock.calls[1][0];expect(next.contract).toBe(6);expect(next.repair?.attempt).toBe(1);expect(next.repair?.failedFilm?.source).toBe(film.source);expect(next.repair?.error).toContain('reached its budget');
 expect(state().phase).toBe('visuals');
});
