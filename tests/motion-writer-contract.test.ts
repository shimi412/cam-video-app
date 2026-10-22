import {it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';import {readFile,mkdir,cp,rm} from 'node:fs/promises';import path from 'node:path';
import type {AgentStore,TurnState} from '../src/lib/agent/store';
import {agentDependencies} from '../src/lib/agent/runtime';
import {writeMotion} from '../src/lib/motion/writer';
import {digest} from '../src/lib/motion/model';
import {referenceFixture} from '../motion/runtime/fixture';
vi.mock('../src/lib/settings',()=>({getSetting:async()=> 'anthropic/claude-test'}));
it('returns a real sandbox compiler failure to the same writer turn and accepts a hash-bound patch only after browser checks',async()=>{
 const id=randomUUID(),dir=path.resolve('storage/motion',id),original={...agentDependencies};const states=new Map<string,{hash:string;state:TurnState}>();let calls=0,denied=0;
 const store:AgentStore={lock:async(_id,fn)=>fn(),get:async(_s,id,hash)=>{const row=states.get(id);if(row){expect(row.hash).toBe(hash);return structuredClone(row.state);}return null;},put:async(_s,id,hash,state)=>{states.set(id,{hash,state:structuredClone(state)});},history:async()=>[],event:async()=>{},memories:async()=>[],propose:async()=>randomUUID()};
 vi.stubGlobal('fetch',async()=>{denied++;throw Error('No network in writer regression');});
 try{
  const fixture=await referenceFixture();await mkdir(dir,{recursive:true});await cp(fixture.voice,path.join(dir,'voix.wav'));
  const good='fsB = fit(["REALLY?"], SW, 900, 125, 300)',bad='fsB = unknown_measure(["REALLY?"], SW, 900, 125, 300)';
  const source=(await readFile('motion/reference/plot-hole-v4-safe.py','utf8')).replace(good,bad).replace('def find(seq','def find_sub(seq').replace('i0 = find(toks','i0 = find_sub(toks');
  const film={...fixture.film,source};
  agentDependencies.store=store;agentDependencies.transport=async input=>{
   calls++;expect(input.requirePlan).toBe(true);
   if(calls===2){expect(input.messages.at(-1)?.content).toContain('unknown_measure');expect(input.messages.at(-1)?.content).toContain(digest(source));expect(input.minimumOutputTokens).toBe(1000);expect(input.remainingUsd).toBeCloseTo(1.99);}
   if(calls>2)throw Error('Unexpected additional reasoning request');
   return {actualUsd:.01,message:{role:'assistant',content:null,tool_calls:[{id:`call-${calls}`,type:'function',function:{name:'submit_plan',arguments:JSON.stringify(calls===1?{film}:{patch:{baseSha256:digest(source),edits:[{before:bad,after:good}]}})}}]}};
  };
  const result=await writeMotion({contract:2,jobId:id,revision:0,script:fixture.script,timing:fixture.timing,targets:[],feedback:''});
  expect(calls).toBe(2);expect(denied).toBe(0);expect(result.receipt.actualUsd).toBeCloseTo(.02);expect(result.film.source).not.toContain('unknown_measure');expect(result.film.source).not.toContain('find_sub');expect([...states.values()][0].state.complete).toBe(true);
 }finally{Object.assign(agentDependencies,original);vi.unstubAllGlobals();await rm(dir,{recursive:true,force:true});}
},180000);
