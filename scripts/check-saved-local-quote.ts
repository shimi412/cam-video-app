/** Reprice an approved local composition on an isolated copy against an isolated copy. No provider permitted. */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,readdir,cp,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {Pool} from 'pg';
async function main(){
 const sourceId=process.argv[2];assert.match(sourceId??'',/^[a-f0-9-]{36}$/);
 const source=new Pool({connectionString:process.env.DATABASE_URL??'postgres://cam:cam@localhost:5433/cam_video_app'});
 const row=(await source.query('SELECT script,params,status FROM jobs WHERE id=$1',[sourceId])).rows[0];assert(row);
 const src=process.argv[3]??path.join(process.cwd(),'storage/concepts',sourceId,'live');
 const files=(await readdir(src,{recursive:true})).filter(f=>f.endsWith('.json'));
 const hashes=new Map<string,string>();for(const f of files)hashes.set(f,createHash('sha256').update(await readFile(path.join(src,f))).digest('hex'));
 const isolation=`local_quote_qa_${randomUUID().replaceAll('-','')}`,id=randomUUID(),dest=path.join(process.cwd(),'storage/concepts',id),dir=path.join(dest,'live');
 const url=new URL(process.env.DATABASE_URL??'postgres://cam:cam@localhost:5433/cam_video_app');url.searchParams.set('options',`-c search_path=${isolation}`);process.env.DATABASE_URL=url.href;
 Object.assign(process.env,{PROVIDER_MODE:'fal',CAM_RELEASE:'connected',CAM_AUTH_MODE:'required',CAM_LIVE_ENABLED:'1'});
 let network=0,quotes=0;globalThis.fetch=async()=>{network++;throw Error('Network forbidden');};
 await source.query(`CREATE SCHEMA ${isolation}`);const {pool}=await import('../src/db');
 try{
  assert.equal((await pool.query('SELECT current_schema() AS name')).rows[0].name,isolation);
  for(const f of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())await pool.query(await readFile(`migrations/${f}`,'utf8'));
  await pool.query('INSERT INTO jobs(id,script,params,status) VALUES($1,$2,$3,$4)',[id,row.script,JSON.stringify(row.params),row.status]);
  await cp(src,dir,{recursive:true,filter:p=>p===src||!path.extname(p)||p.endsWith('.json')});
  const json=async(f:string)=>JSON.parse(await readFile(path.join(dir,f),'utf8'));
  const state=await json('production.json');state.background={enabled:false,kick:false,failures:0,nextAt:0};await writeFile(path.join(dir,'production.json'),JSON.stringify(state));
  const {liveView,updateLiveProduction}=await import('../src/lib/concept/live-production');
  const {sha256}=await import('../src/lib/concept/checkpoints');
  const before=await liveView(id,row.params.aspectRatio);
  assert(before.storyboard?.panels.some(p=>p.textOnly));
  await updateLiveProduction(id,{action:'review',target:before.storyboard!.target,decision:'approved',storyboardConfirmed:true},state.approval.actor);
  const quote=async(plan:Parameters<typeof import('../src/lib/providers/cam-pricing').priceCamPlan>[0])=>{
   quotes++;
   const content={...state.quote,plan:plan.fingerprint,scope:'production' as const,createdAt:Date.now(),expiresAt:Date.now()+3600000};
   return {...content,id:sha256(JSON.stringify(content))};
  };
  await updateLiveProduction(id,{action:'quote'},state.approval.actor,quote);
  const after=await json('production.json');
  assert.equal(after.pendingQuote.scope,'production');assert.notEqual(after.pendingQuote.plan,state.quote.plan);
  assert.deepEqual(after.quote,state.quote);assert.deepEqual(after.approval,state.approval);assert.equal(network,0);assert.equal(quotes,1);
  for(const [f,hash] of hashes)assert.equal(createHash('sha256').update(await readFile(path.join(src,f))).digest('hex'),hash,`Source changed: ${f}`);
  await mkdir('storage/qa',{recursive:true});
  const proof={status:'passed',sourceId,sourceFilesUnchanged:hashes.size,productionQuotePrepared:true,originalQuoteAndApprovalPreserved:true,pricingCalls:quotes,simulatedPrices:true,externalCalls:network,paidCalls:0,workerStarted:false};
  await writeFile('storage/qa/saved-local-quote-proof.json',JSON.stringify(proof,null,2));console.log(proof);
 }finally{await rm(dest,{recursive:true,force:true});await pool.end();await source.query(`DROP SCHEMA ${isolation} CASCADE`);await source.end();}
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
