/** Real PostgreSQL isolation, approval, concurrency and restart replay. No model/network calls. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {z} from 'zod';
const url=new URL(process.env.DATABASE_URL??'postgres://cam@127.0.0.1:55439/cam_video_app');
const setup=new Pool({connectionString:url.href}),isolation=`agent_qa_${randomUUID().replaceAll('-','')}`;
url.searchParams.set('options',`-c search_path=${isolation}`);process.env.DATABASE_URL=url.href;process.env.CAM_AUTH_MODE='local';process.env.APP_URL='http://localhost:3123';
let externalCalls=0;globalThis.fetch=async()=>{externalCalls++;throw Error('Network disabled');};
async function main(){
 await setup.query(`CREATE SCHEMA ${isolation}`);const {pool}=await import('../src/db');
 try{
  for(const f of(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())await pool.query(await readFile(`migrations/${f}`,'utf8'));
  const {runAgent}=await import('../src/lib/agent/runtime'),{postgresAgentStore:store,reviewMemory}=await import('../src/lib/agent/store');
  const {GET,POST}=await import('../src/app/api/admin/memory/route');
  const video=randomUUID(),other=randomUUID(),schema=z.object({title:z.string()}).strict();let calls=0;
  const call=(name:string,args:unknown)=>({message:{role:'assistant' as const,content:null,tool_calls:[{id:randomUUID(),type:'function' as const,function:{name,arguments:JSON.stringify(args)}}]},actualUsd:0});
  const input={session:video,turn:'first',model:'anthropic/claude-fixture',system:'Preserve narration',prompt:'Private note video A',schema,maximumUsd:.25,maxOutputTokens:4000,minimumOutputTokens:1000};
  const deps={store,readSkill:async()=> 'CAM fixture skill',transport:async()=>{calls++;return call('submit_plan',{title:'Private title A'});}};
  await Promise.all([runAgent(input,deps),runAgent(input,deps)]);assert.equal(calls,1,'Session lock must prevent duplicate submissions');
  await store.event(video,'actual-tool','execution',{result:'Saved correction in A'});
  const id=await store.propose(video,'first','Preserve deliberate negative space.','General style guidance requested for CAM.');
  assert.equal((await store.memories()).length,0);
  process.env.CAM_LOCAL_DEMO='1';assert.equal((await GET(new Request('http://localhost:3123/api/admin/memory'))).status,403);
  const post=()=>new Request('http://localhost:3123/api/admin/memory',{method:'POST',headers:{'Content-Type':'application/json','Origin':'http://localhost:3123'},body:JSON.stringify({id,version:1,status:'approved'})});
  assert.equal((await POST(post())).status,403);assert.equal((await store.memories()).length,0);
  process.env.CAM_LOCAL_DEMO='0';assert.equal((await POST(post())).status,200);assert.equal((await POST(post())).status,409);
  assert.equal((await store.memories()).length,1);
  await runAgent({...input,session:other,prompt:'Video B'}, {...deps,transport:async step=>{const text=JSON.stringify(step.messages);assert(text.includes('Preserve deliberate negative space'));assert(!text.includes('Private note video A'));assert(!text.includes('Private title A'));assert(!text.includes('Saved correction in A'));return call('submit_plan',{title:'B'});}});
  await runAgent({...input,turn:'next'}, {...deps,transport:async step=>{assert(JSON.stringify(step.messages).includes('Saved correction in A'));return call('submit_plan',{title:'A revised'});}});
  // Recreate the store adapter as on a worker restart; persisted turn is replayed.
  await runAgent(input,{...deps,store:{...store},transport:async()=>{throw Error('Completed inference must not be requested again');}});
  await reviewMemory({id,version:2,status:'retired',actor:'local'});assert.equal((await store.memories()).length,0);
  const count=Number((await pool.query('SELECT count(*) n FROM cam_agent_sessions')).rows[0].n);assert.equal(count,2);assert.equal(externalCalls,0);
  await mkdir('storage/qa',{recursive:true});await writeFile('storage/qa/agent-memory-proof.json',JSON.stringify({date:'2026-10-19',sessions:count,concurrentInferenceCalls:calls,isolatedHistory:true,adminOnlyExactVersionApproval:true,pendingAndRetiredExcluded:true,restartReplay:true,externalCalls,paidCalls:0},null,2));
  console.log('Agent memory, admin gates, concurrent turns and restart replay: passed. No external calls.');
 }finally{await pool.end();await setup.query(`DROP SCHEMA ${isolation} CASCADE`);await setup.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
