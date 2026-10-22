import {it,expect,vi} from 'vitest';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {reviewDelivery} from '../src/lib/agent/delivery-review';
import {agentDependencies} from '../src/lib/agent/runtime';
import type {AgentStore,TurnState} from '../src/lib/agent/store';
vi.mock('../src/lib/settings',()=>({getSetting:async()=> 'anthropic/claude-fixture'}));
it.each(['clay','motion','comics'] as const)('requires a saved Claude release decision for exact %s bytes and replays it without another call',async category=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'release-qa-')),file=path.join(dir,'final.mp4'),content=Buffer.from('fixture reviewed media'),hash=createHash('sha256').update(content).digest('hex');
 const original={...agentDependencies},states=new Map<string,TurnState>();let calls=0,ready=false;
 const store:AgentStore={lock:async(_id,fn)=>fn(),get:async(_s,id)=>states.has(id)?structuredClone(states.get(id)!):null,put:async(_s,id,_h,s)=>{states.set(id,structuredClone(s));},event:async()=>{},history:async()=>[],memories:async()=>[],propose:async()=>''};
 try{
  await writeFile(file,content);agentDependencies.store=store;
  agentDependencies.transport=async input=>{calls++;expect(input.system).toContain('Supervise release');return {actualUsd:.01,message:{role:'assistant',content:null,tool_calls:[{id:'release',type:'function',function:{name:'submit_plan',arguments:JSON.stringify({mediaHash:hash,ready,reason:ready?'The reviewed file and completed feedback agree.':'The current finishing feedback is still unresolved.',corrections:ready?[]:['Apply the saved request to remove the ending click.']})}}]}};};
  const input={jobId:'test-release',category,mediaHash:hash,file,script:'Original narration.',facts:{humanApproval:true,feedback:'Remove ending click'}};
  await expect(reviewDelivery(input)).rejects.toThrow('Final review: Apply');
  await expect(reviewDelivery(input)).rejects.toThrow('Final review: Apply');expect(calls).toBe(1);
  ready=true;await expect(reviewDelivery({...input,facts:{humanApproval:true,feedback:'Ending fixed and checked.'}})).resolves.toMatchObject({ready:true});expect(calls).toBe(2);
  await writeFile(file,'changed after review');await expect(reviewDelivery(input)).rejects.toThrow('reviewed file changed');expect(calls).toBe(2);
 }finally{Object.assign(agentDependencies,original);await rm(dir,{recursive:true,force:true});}
});
