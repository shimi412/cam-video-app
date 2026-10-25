import {describe,it,expect,vi} from 'vitest';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,symlink,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runAgent,type AgentInput} from '../src/lib/agent/runtime';
import type {AgentStore,TurnState,MemoryEntry} from '../src/lib/agent/store';
import type {AgentTransport,StepResult} from '../src/lib/agent/transport';
import {readSkill} from '../src/lib/agent/knowledge';
function fixture(){
 const turns=new Map<string,{hash:string;state:TurnState}>(),events:{session:string;key:string;kind:string;content:unknown;sequence:number}[]=[],memories:MemoryEntry[]=[];
 const store:AgentStore={lock:async(_id,work)=>work(),get:async(s,id,hash)=>{const t=turns.get(s+id);if(t&&t.hash!==hash)throw Error('Input changed');return t?structuredClone(t.state):null;},put:async(s,id,hash,state)=>{turns.set(s+id,{hash,state:structuredClone(state)});},history:async(s,before=Infinity)=>events.filter(e=>e.session===s&&e.sequence<before).slice(-12).map(({kind,content,sequence})=>({kind,content,sequence})),event:async(session,key,kind,content)=>{if(!events.some(e=>e.session===session&&e.key===key))events.push({session,key,kind,content:structuredClone(content),sequence:events.length+1});},memories:async()=>structuredClone(memories.filter(m=>m.status==='approved')),propose:async(s,t,content,reason)=>{const old=memories.find(m=>m.source_session===s&&m.source_turn===t&&m.content===content);if(old)return old.id;const id=randomUUID();memories.push({id,content,reason,source_session:s,source_turn:t,status:'pending',version:1});return id;}};
 const input:AgentInput<{title:string}>={session:randomUUID(),turn:'first',model:'anthropic/claude-test',system:'Keep narration exact',prompt:'Private video A. Fix the title',schema:z.object({title:z.string()}).strict(),maximumUsd:.25,maxOutputTokens:4000,minimumOutputTokens:1000};
 const call=(name:string,args:unknown):StepResult=>({message:{role:'assistant',content:null,tool_calls:[{id:randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}}]},actualUsd:.01});
 const skill=vi.fn(async(id:string)=>{if(!['cam-direction','cam-feedback'].includes(id))throw Error('Unknown CAM skill');return 'Project-only skill: preserve original narration.';});
 return {store,turns,events,memories,input,call,skill};
}
describe('persistent CAM agent',()=>{
 it('returns real validator errors to Claude and saves the corrected plan without executing media',async()=>{
  const f=fixture();let count=0;
  const transport:AgentTransport=vi.fn(async input=>{if(count++===0)return f.call('submit_plan',{title:'Print my instruction'});expect(input.messages.at(-1)?.content).toContain('Use original narration');return f.call('submit_plan',{title:'Original narration'});});
  const validate=(p:{title:string})=>{if(p.title!=='Original narration')throw Error('Use original narration');return p;};
  const result=await runAgent({...f.input,validate},{store:f.store,transport,readSkill:f.skill});expect(result.title).toBe('Original narration');expect(transport).toHaveBeenCalledTimes(2);
  expect(f.events.map(e=>e.kind)).toEqual(['request','decision']);expect(f.skill).toHaveBeenCalledWith('cam-direction');
  await runAgent({...f.input,validate},{store:f.store,transport,readSkill:f.skill});expect(transport).toHaveBeenCalledTimes(2);
 });
 it('keeps per-video history separate while exposing only approved shared lessons',async()=>{
  const f=fixture();let step=0;const transport:AgentTransport=vi.fn(async()=>++step===1?f.call('propose_shared_memory',{content:'Use coherent clay materials.',reason:'A reusable art direction rule.'}):f.call('submit_plan',{title:'Video A title'}));
  const deps={store:f.store,transport,readSkill:f.skill};await runAgent(f.input,deps);
  await f.store.event(f.input.session,'actual-execution','execution',{completed:'specific video A'});
  const inspect=vi.fn(async(input:Parameters<AgentTransport>[0])=>{const text=JSON.stringify(input.messages);expect(text).toContain('specific video A');expect(text).not.toContain('Use coherent clay materials.');return f.call('submit_plan',{title:'A second turn'});});
  await runAgent({...f.input,turn:'second'}, {...deps,transport:inspect});
  f.memories[0].status='approved';
  await runAgent({...f.input,session:randomUUID(),prompt:'Video B',turn:'first'},{...deps,transport:async input=>{const text=JSON.stringify(input.messages);expect(text).toContain('Use coherent clay materials.');expect(text).not.toContain('Private video A');expect(text).not.toContain('specific video A');expect(text).not.toContain('Video A title');return f.call('submit_plan',{title:'Video B'});}});
 });
 it('answers several tool calls of one message in order and still finishes on submit_plan (live Attack Start 2026-10-21)',async()=>{
  const f=fixture();let step=0;
  const multi=():StepResult=>({message:{role:'assistant',content:null,tool_calls:[{id:'m1',type:'function',function:{name:'read_shared_memory',arguments:'{"offset":0}'}},{id:'m2',type:'function',function:{name:'read_skill',arguments:'{"id":"cam-direction"}'}}]},actualUsd:.01});
  const transport:AgentTransport=vi.fn(async(input:Parameters<AgentTransport>[0])=>{
   if(++step===1)return multi();
   const tools=input.messages.filter(m=>m.role==='tool');expect(tools.map(m=>m.tool_call_id)).toEqual(['m1','m2']);expect(String(tools[1].content)).toContain('preserve original narration');
   return f.call('submit_plan',{title:'Answered in order'});
  });
  const result=await runAgent(f.input,{store:f.store,transport,readSkill:f.skill});expect(result.title).toBe('Answered in order');expect(transport).toHaveBeenCalledTimes(2);
 });
 it('loads several packaged skills into one turn, the first one required (Attack reads comics-method and attack-prompting, 2026-10-25)',async()=>{
  const f=fixture();
  const transport:AgentTransport=vi.fn(async input=>{expect(input.system).toContain('Required skill cam-direction:');expect(input.system).toContain('Required skill cam-feedback:');expect(input.system).toContain('cam-direction and cam-feedback skills are loaded');return f.call('submit_plan',{title:'Both skills read'});});
  const result=await runAgent({...f.input,skills:['cam-direction','cam-feedback']},{store:f.store,transport,readSkill:f.skill});
  expect(result.title).toBe('Both skills read');expect(f.skill).toHaveBeenCalledWith('cam-direction');expect(f.skill).toHaveBeenCalledWith('cam-feedback');expect(transport).toHaveBeenCalledTimes(1);
  expect((f.events.find(e=>e.kind==='request')!.content as {skills:string[]}).skills).toEqual(['cam-direction','cam-feedback']);
  // A different skill list is a different turn identity: the saved two-skill answer is never served to a single-skill request.
  const single=vi.fn(async()=>f.call('submit_plan',{title:'One skill'}));await expect(runAgent({...f.input},{store:f.store,transport:single,readSkill:f.skill})).rejects.toThrow('Input changed');expect(single).not.toHaveBeenCalled();
 });
 it('resumes a saved assistant tool after a crash without another paid request',async()=>{
  const f=fixture(),original=f.store.put;let puts=0;
  f.store.put=async(...args)=>{await original(...args);if(++puts===2)throw Error('Process stopped after receipt');};
  const transport=vi.fn(async()=>f.call('submit_plan',{title:'Saved answer'}));const deps={store:f.store,transport,readSkill:f.skill};
  await expect(runAgent(f.input,deps)).rejects.toThrow('Process stopped');f.store.put=original;
  await expect(runAgent(f.input,deps)).resolves.toEqual({title:'Saved answer'});expect(transport).toHaveBeenCalledTimes(1);
 });
 it('does not retry an uncertain provider request within a turn',async()=>{
  const f=fixture();const transport=vi.fn(async()=>{throw Error('Unconfirmed paid request');});
  await expect(runAgent(f.input,{store:f.store,transport,readSkill:f.skill})).rejects.toThrow('Unconfirmed');expect(transport).toHaveBeenCalledTimes(1);expect(f.events.filter(e=>e.kind==='decision')).toHaveLength(0);
 });
 it('does not accept instructions as tool names or allow cross-video history selection',async()=>{
  const f=fixture();let step=0;
  await runAgent(f.input,{store:f.store,readSkill:f.skill,transport:async input=>{step++;if(step===1)return f.call('read_video_history',{session:'someone-else'});if(step===2){expect(input.messages.at(-1)?.content).toContain('accepted":false');return f.call('approve_budget',{});}expect(input.messages.at(-1)?.content).toContain('Unknown tool');return f.call('submit_plan',{title:'Safe plan'});}});
 });
 it('caps the complete reasoning turn rather than each tool call',async()=>{
  const f=fixture();const transport=vi.fn(async input=>{expect(input.remainingUsd).toBe(.25);return {...f.call('read_shared_memory',{}),actualUsd:.25};});
  await expect(runAgent(f.input,{store:f.store,transport,readSkill:f.skill})).rejects.toThrow('reached its budget');expect(transport).toHaveBeenCalledTimes(1);
 });
 it('preserves the eight-step limit across retries and does not fabricate success',async()=>{
  const f=fixture(),transport=vi.fn(async()=>f.call('submit_plan',{wrong:'schema'})),deps={store:f.store,transport,readSkill:f.skill};
  await expect(runAgent(f.input,deps)).rejects.toThrow('reasoning allowance');await expect(runAgent(f.input,deps)).rejects.toThrow('reasoning allowance');expect(transport).toHaveBeenCalledTimes(8);
 });
 it('loads project skills but rejects arbitrary paths and escaped symlinks',async()=>{
  expect(await readSkill('cam-feedback')).toContain('feedback');await expect(readSkill('../../Second Cerveau')).rejects.toThrow('Unknown');
  const root=await mkdtemp(path.join(os.tmpdir(),'cam-knowledge-'));try{await mkdir(path.join(root,'agent/skills/cam-feedback'),{recursive:true});await symlink(path.join(process.cwd(),'agent/skills/cam-feedback/SKILL.md'),path.join(root,'agent/skills/cam-feedback/SKILL.md'));await expect(readSkill('cam-feedback',root)).rejects.toThrow('outside');}finally{await rm(root,{recursive:true,force:true});}
 });
});
it('never executes an over-budget saved answer after retry',async()=>{const f=fixture(),transport=vi.fn(async()=>({...f.call('submit_plan',{title:'Unexecuted'}),actualUsd:.30})),deps={store:f.store,transport,readSkill:f.skill};await expect(runAgent(f.input,deps)).rejects.toThrow('exceeded');await expect(runAgent(f.input,deps)).rejects.toThrow('exceeded');expect(transport).toHaveBeenCalledTimes(1);expect(f.events.some(e=>e.kind==='decision')).toBe(false);});
it('pages shared guidance instead of expanding every future conversation without bound',async()=>{const f=fixture();for(let i=0;i<20;i++)f.memories.push({id:String(i),content:`Approved rule ${i}`,reason:'Useful guidance',source_session:randomUUID(),source_turn:'old',status:'approved',version:1});let calls=0;await runAgent(f.input,{store:f.store,readSkill:f.skill,transport:async input=>{if(calls++===0){const user=JSON.stringify(input.messages);expect(user).toContain('Approved rule 7');expect(user).not.toContain('Approved rule 8');return f.call('read_shared_memory',{offset:8});}expect(input.messages.at(-1)?.content).toContain('Approved rule 8');expect(input.messages.at(-1)?.content).toContain('"nextOffset":16');return f.call('submit_plan',{title:'Bounded context'});}});});
it('requests an executable plan after two context reads, with the original total budget',async()=>{
 const f=fixture();let count=0;await runAgent(f.input,{store:f.store,readSkill:f.skill,transport:async input=>{expect(input.identityVersion).toBe(2);if(count++<2){expect(input.requirePlan).toBe(false);return f.call('read_shared_memory',{});}expect(input.requirePlan).toBe(true);expect(input.remainingUsd).toBeCloseTo(.23);return f.call('submit_plan',{title:'Executable plan'});}});
});
it('revalidates the received plan after a local repair without another paid call',async()=>{const f=fixture();let broken=true;const validate=(p:{title:string})=>{if(broken)throw Error('Local assembler problem');return p;};const transport=vi.fn(async()=>f.call('submit_plan',{title:'Saved composition'})),deps={store:f.store,readSkill:f.skill,transport};await expect(runAgent({...f.input,validate},deps)).rejects.toThrow('reasoning allowance');expect(transport).toHaveBeenCalledTimes(8);broken=false;await expect(runAgent({...f.input,validate},deps)).resolves.toEqual({title:'Saved composition'});expect(transport).toHaveBeenCalledTimes(8);});
it('writes directly when the authoritative method and inputs are already loaded',async()=>{const f=fixture();const transport=vi.fn(async input=>{expect(input.requirePlan).toBe(true);return f.call('submit_plan',{title:'Direct composition'});});expect(await runAgent({...f.input,contextReads:0},{store:f.store,readSkill:f.skill,transport})).toEqual({title:'Direct composition'});expect(transport).toHaveBeenCalledOnce();});
it('awaits executable validation and budgets a small correction in the same persisted turn',async()=>{
 const f=fixture();let calls=0,validated=0;
 const transport=vi.fn(async input=>{calls++;if(calls===1){expect(input.minimumOutputTokens).toBe(1000);return f.call('submit_plan',{title:'Broken composition'});}expect(input.minimumOutputTokens).toBe(200);expect(input.remainingUsd).toBeCloseTo(.24);expect(input.messages.at(-1)?.content).toContain('Actual compiler failure');return f.call('submit_plan',{title:'Corrected composition'});});
 const validate=async(p:{title:string})=>{await Promise.resolve();validated++;if(p.title==='Broken composition')throw Error('Actual compiler failure: word index 99, only 98 words');return p;};
 const input={...f.input,validate,correctionMinimumOutputTokens:200};
 await expect(runAgent(input,{store:f.store,transport,readSkill:f.skill})).resolves.toEqual({title:'Corrected composition'});
 expect(validated).toBe(2);expect(f.events.filter(e=>e.kind==='decision')).toHaveLength(1);
 await runAgent(input,{store:f.store,transport,readSkill:f.skill});expect(transport).toHaveBeenCalledTimes(2);
});
it('stops identical validation failures across candidate hashes and restarts before a third paid call',async()=>{
 const f=fixture();let calls=0;let fixed=false;
 const transport=vi.fn(async()=>{calls++;return f.call('submit_plan',{title:String(calls)});});
 const validate=(p:{title:string})=>{if(!fixed)throw Error(`Candidate source SHA256 ${p.title.repeat(64)}. Same compiler defect`);return p;};
 const input={...f.input,maxIdenticalRejections:2 as const,validate},deps={store:f.store,transport,readSkill:f.skill};
 await expect(runAgent(input,deps)).rejects.toThrow('Same compiler defect');
 const failure=await runAgent(input,deps).catch(e=>e);expect(failure.message).toContain('local reconciliation');expect(failure.message).toContain('Same compiler defect');expect(failure.candidate).toEqual({title:'2'});
 expect(calls).toBe(2);fixed=true;
 await expect(runAgent(input,deps)).resolves.toEqual({title:'2'});expect(calls).toBe(2);
});
it('does not buy repeated fixes for the same Python exception just because line numbers moved',async()=>{
 const f=fixture();let calls=0;
 const transport=vi.fn(async()=>f.call('submit_plan',{title:String(++calls)}));
 const validate=()=>{throw Error(`Traceback:\n  File "/tmp/candidate-${String(calls).repeat(16)}/build.py", line ${780+calls}, in <module>\n    VIS[k] - PH[k]\nKeyError: 1`);};
 await expect(runAgent({...f.input,maxIdenticalRejections:2,validate},{store:f.store,transport,readSkill:f.skill})).rejects.toThrow('Repeated identical validation failure');
 expect(calls).toBe(2);
});
 it('nudges a model that answers in prose under tool_choice auto, once, then accepts its tool call',async()=>{
  const f=fixture();let step=0;
  const transport:AgentTransport=vi.fn(async input=>{step++;if(step===1)return {message:{role:'assistant' as const,content:'Here is what I would do.'},actualUsd:.001};expect(String(input.messages.at(-1)?.content)).toContain('calling exactly one tool');return f.call('submit_plan',{title:'Original narration'});});
  const plan=await runAgent(f.input,{store:f.store,transport,readSkill:f.skill});expect(plan).toEqual({title:'Original narration'});expect(transport).toHaveBeenCalledTimes(2);
 });
 it('in agent mode, pays and discards an answer cut by the output limit, nudges once, and continues the same turn',async()=>{
  const {AIResponseError}=await import('../src/lib/ai-response');
  const f=fixture();let step=0;
  const transport:AgentTransport=vi.fn(async input=>{step++;if(step===1)throw new AIResponseError({kind:'ai-response-failure-v1',code:'incomplete',finishReason:'length',receipt:{actualUsd:.05,model:'anthropic/claude-test',usage:{inputTokens:10,outputTokens:12000,requestId:'cut'}}});expect(String(input.messages.at(-1)?.content)).toContain('reached the output limit (12000 tokens)');return f.call('submit_plan',{title:'Original narration'});});
  const plan=await runAgent({...f.input,freeTools:true,maxSteps:10},{store:f.store,transport,readSkill:f.skill});expect(plan).toEqual({title:'Original narration'});
  const saved=[...f.turns.values()][0].state;expect(saved.spent).toBeCloseTo(.06);expect(saved.step).toBe(2);
 });
 it('outside agent mode, a cut answer still ends the turn as before',async()=>{
  const {AIResponseError}=await import('../src/lib/ai-response');
  const f=fixture();const transport:AgentTransport=vi.fn(async()=>{throw new AIResponseError({kind:'ai-response-failure-v1',code:'incomplete',finishReason:'length',receipt:{actualUsd:.05,model:'anthropic/claude-test',usage:{inputTokens:10,outputTokens:4000,requestId:'cut'}}});});
  await expect(runAgent(f.input,{store:f.store,transport,readSkill:f.skill})).rejects.toThrow('incomplete');
 });
