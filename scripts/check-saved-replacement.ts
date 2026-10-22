/** Rehearse replacement pricing against a saved client snapshot; never run media. */
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {readFile,writeFile,readdir,mkdir,cp,rm} from "node:fs/promises";
import path from "node:path";
import {Pool} from "pg";
async function main(){
 const sourceId=process.argv[2];assert.match(sourceId??"",/^[a-f0-9-]{36}$/);
 const source=new Pool({connectionString:process.env.DATABASE_URL??"postgres://cam:cam@localhost:5433/cam_video_app"});
 const row=(await source.query("SELECT script,params,status FROM jobs WHERE id=$1",[sourceId])).rows[0];assert(row);
 const src=path.join(process.cwd(),"storage/concepts",sourceId,"live"),destId=randomUUID(),dest=path.join(process.cwd(),"storage/concepts",destId);
 const files=await readdir(src,{recursive:true});const hashes=new Map<string,string>();
 for(const file of files.filter(f=>f.endsWith('.json')))hashes.set(file,createHash('sha256').update(await readFile(path.join(src,file))).digest('hex'));
 const isolation=`replacement_qa_${randomUUID().replaceAll('-','')}`;
 const url=new URL(process.env.DATABASE_URL??"postgres://cam:cam@localhost:5433/cam_video_app");url.searchParams.set('options',`-c search_path=${isolation}`);process.env.DATABASE_URL=url.href;
 Object.assign(process.env,{PROVIDER_MODE:'fal',CAM_RELEASE:'connected',CAM_AUTH_MODE:'required',CAM_LIVE_ENABLED:'1'});
 let externalCalls=0;globalThis.fetch=async()=>{externalCalls++;throw Error('Network forbidden');};
 await source.query(`CREATE SCHEMA ${isolation}`);const {pool}=await import('../src/db');
 try{
  assert.equal((await pool.query("SELECT current_schema() AS name")).rows[0].name,isolation);
  for(const f of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())await pool.query(await readFile(`migrations/${f}`,'utf8'));
  await pool.query("INSERT INTO jobs(id,script,params,status) VALUES($1,$2,$3,$4)",[destId,row.script,JSON.stringify(row.params),row.status]);
  const pricing=(await source.query("SELECT value FROM settings WHERE key='customer_pricing'")).rows[0].value;
  await pool.query("INSERT INTO settings(key,value) VALUES('customer_pricing',$1)",[JSON.stringify(pricing)]);
  await pool.query("INSERT INTO credit_ledger(delta_usd,kind,note,wallet) VALUES(1000,'topup','Isolated replacement rehearsal','customer')");
  await cp(src,path.join(dest,'live'),{recursive:true,filter:p=>p===src||!path.extname(p)||p.endsWith('.json')});
  const sf=path.join(dest,'live/production.json'),state=JSON.parse(await readFile(sf,'utf8'));state.background={enabled:false,kick:false,failures:0,nextAt:0};await writeFile(sf,JSON.stringify(state));
  const {flowReviewTarget}=await import('../src/lib/concept/production-flow');
  const {storyboardReviewContent}=await import('../src/lib/concept/storyboard-review');
  const sheet=JSON.parse(await readFile(path.join(dest,'live/storyboard-review.json'),'utf8'));
  const oldTarget=sheet.target;sheet.target=flowReviewTarget('live',destId,'storyboard',storyboardReviewContent(sheet.panels,row.params.aspectRatio));
  await writeFile(path.join(dest,'live/storyboard-review.json'),JSON.stringify(sheet));
  const decision=JSON.parse(await readFile(path.join(dest,'live/storyboard-reviews',oldTarget+'.json'),'utf8'));decision.target=sheet.target;
  await writeFile(path.join(dest,'live/storyboard-reviews',sheet.target+'.json'),JSON.stringify(decision));
  const {liveView,updateLiveProduction}=await import('../src/lib/concept/live-production');
  const {priceCamPlan}=await import('../src/lib/providers/cam-pricing');
  const {customerQuote}=await import('../src/lib/customer-wallet');
  const {IMAGE_ENDPOINT}=await import('../src/lib/concept/generation-plan');
  const {ALIGNMENT_ENDPOINT}=await import('../src/lib/concept/transcription');
  const {VIDEO_MODELS,isHiggsfieldVideo}=await import('../src/lib/concept/model-selection');
  const quote:typeof import('../src/lib/providers/cam-pricing').fetchCamQuote=async(plan,options)=>priceCamPlan(plan,{
   fal:async(url,init)=>{assert.equal(init.method,'GET');return url.includes('billing-events')?{billing_events:[]}:{prices:[{endpoint_id:IMAGE_ENDPOINT,unit_price:.15,unit:'images',currency:'USD'},{endpoint_id:ALIGNMENT_ENDPOINT,unit_price:.0008,unit:'compute seconds',currency:'USD'},...VIDEO_MODELS.filter(m=>!isHiggsfieldVideo(m)).map(endpoint_id=>({endpoint_id,unit_price:.14,unit:'seconds',currency:'USD'}))]};},
   higgsfield:async(name,args)=>{assert(['generate_audio','generate_video'].includes(name));assert.equal((args.params as Record<string,unknown>).get_cost,true);return {structuredContent:{cost:{credits:1,credits_exact:1}}};}
  },Date.now(),{...options,higgsfieldCreditUsd:.01});
  const before=await liveView(destId);assert(before.recovery);const failedScenes=before.recovery.scenes;assert(failedScenes.length>0);
  assert.equal((await updateLiveProduction(destId,{action:'recovery-quote',target:before.recovery.target},state.approval.actor,quote)).advance,false);
  let saved=JSON.parse(await readFile(sf,'utf8'));assert(saved.pendingQuote);assert(saved.pendingQuote.expiresAt>Date.now());
  assert.deepEqual(saved.quote,state.quote);assert.deepEqual(saved.approval,state.approval);
  assert.deepEqual(saved.pendingQuote.draftRecoveries.map((r:{scene:number})=>r.scene).sort((a:number,b:number)=>a-b),[...failedScenes].sort((a,b)=>a-b));
  for(const scene of failedScenes){const id=`scene-${scene}`;
   assert.equal(saved.pendingQuote.lines.filter((l:{id:string})=>l.id.startsWith(id+'-draft')).length,1);
   assert.equal(saved.pendingRetries[id+'-draft'],1);
  }
  const offered=saved.pendingQuote.id;
  // Refresh the offer before approval: retired draft lines and both choices survive.
  await updateLiveProduction(destId,{action:'quote'},state.approval.actor,quote);
  saved=JSON.parse(await readFile(sf,'utf8'));assert(saved.pendingQuote);assert.deepEqual(saved.pendingRetries,Object.fromEntries(failedScenes.map(scene=>[`scene-${scene}-draft`,1])));
  const customer=await customerQuote(destId,saved.pendingQuote);assert(customer);
  await updateLiveProduction(destId,{action:'approve',quote:saved.pendingQuote.id,customerQuote:customer.id},state.approval.actor,quote);
  const approved=await liveView(destId);assert(!approved.recovery);assert.equal(approved.error,null);
  assert(approved.requests.filter(r=>r.state==='replaced').length>=failedScenes.length);
  for(const [file,hash] of hashes)assert.equal(createHash('sha256').update(await readFile(path.join(src,file))).digest('hex'),hash);
  assert.equal(externalCalls,0);
  const proof={status:'passed',sourceId,originalFilesUnchanged:hashes.size,failedScenes,workflow:'whimsical',expiredQuoteReplaced:true,refreshBeforeApproval:true,exactPriceApproval:true,oldFailuresRetired:true,workerStarted:false,externalCalls,paidCalls:0,offered};
  await mkdir('storage/qa',{recursive:true});await writeFile('storage/qa/saved-replacement-proof.json',JSON.stringify(proof,null,2));console.log(proof);
 }finally{await rm(dest,{recursive:true,force:true});await pool.end();await source.query(`DROP SCHEMA ${isolation} CASCADE`);await source.end();}
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
