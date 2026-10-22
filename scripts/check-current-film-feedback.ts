/** Exercise film feedback batching on a disposable copy. No provider or worker permitted. */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,readdir,cp,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {Pool} from 'pg';
import {z} from 'zod';
async function main(){
 const sourceId=process.argv[2];assert.match(sourceId??'',/^[a-f0-9-]{36}$/);
 const source=new Pool({connectionString:process.env.DATABASE_URL??'postgres://cam:cam@localhost:5433/cam_video_app'});
 const row=(await source.query('SELECT script,params,status FROM jobs WHERE id=$1',[sourceId])).rows[0];assert(row);
 const src=process.argv[3]??path.join(process.cwd(),'storage/concepts',sourceId,'live');
 const files=(await readdir(src,{recursive:true})).filter(f=>f.endsWith('.json'));
 const hashes=new Map<string,string>();for(const f of files)hashes.set(f,createHash('sha256').update(await readFile(path.join(src,f))).digest('hex'));
 const isolation=`film_batch_qa_${randomUUID().replaceAll('-','')}`,id=randomUUID(),dest=path.join(process.cwd(),'storage/concepts',id),dir=path.join(dest,'live');
 const url=new URL(process.env.DATABASE_URL??'postgres://cam:cam@localhost:5433/cam_video_app');url.searchParams.set('options',`-c search_path=${isolation}`);process.env.DATABASE_URL=url.href;
 Object.assign(process.env,{PROVIDER_MODE:'fal',CAM_RELEASE:'connected',CAM_AUTH_MODE:'required',CAM_LIVE_ENABLED:'1'});
 let network=0,quotes=0,inferenceResponses=0,failPricing=true;globalThis.fetch=async()=>{network++;throw Error('Network forbidden');};
 await source.query(`CREATE SCHEMA ${isolation}`);const {pool}=await import('../src/db');
 try{
  assert.equal((await pool.query('SELECT current_schema() AS name')).rows[0].name,isolation);
  for(const f of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())await pool.query(await readFile(`migrations/${f}`,'utf8'));
  await pool.query('INSERT INTO jobs(id,script,params,status) VALUES($1,$2,$3,$4)',[id,row.script,JSON.stringify(row.params),row.status]);
  await cp(src,dir,{recursive:true,filter:p=>p===src||!path.extname(p)||p.endsWith('.json')});
  const json=async(f:string)=>JSON.parse(await readFile(path.join(dir,f),'utf8'));
  const state=await json('production.json');state.background={enabled:false,kick:false,failures:0,nextAt:0};await writeFile(path.join(dir,'production.json'),JSON.stringify(state));
  const {updateLiveProduction}=await import('../src/lib/concept/live-production');
  const originalOutcome=await json('state.json');
  const target=originalOutcome.review.target,actor=state.approval.actor;
  const book=await json('film-feedback.json'),ids=book.comments.filter((c:{target:string;stage:string})=>c.target===target&&c.stage!=='finishing').map((c:{id:string})=>c.id);
  const received=(await source.query("SELECT r.result,r.input_hash,a.model FROM api_calls a JOIN assistant_requests r ON r.id::text=a.meta->>'messageId' WHERE a.job_id=$1 AND a.provider='openrouter' AND r.result ? 'decisions' ORDER BY a.created_at DESC LIMIT 1",[sourceId])).rows[0];assert(received);
  // Inject at the model transport boundary, not above the real director validator.
  const {directFeedback}=await import('../src/lib/concept/feedback-director');
  let ledgerMatches=false;
  const director:import('../src/lib/concept/feedback-director').FeedbackDirector=async(input,owned)=>directFeedback(input,owned,async request=>{
   inferenceResponses++;
   // Prove the live request identity can replay this already-paid receipt. Merely
   // accepting its JSON with a fixture is insufficient evidence of live recovery.
   const {loadDirectorMemory}=await import('../src/lib/concept/director-memory');
   const {feedbackReferenceSheet}=await import('../src/lib/concept/feedback-reference-sheet');
   const originalInput={...input,jobId:sourceId};
   const memory=await loadDirectorMemory(),digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
   const requestId=`feedback-${digest(JSON.stringify({version:2,input:originalInput,memory:memory.sha256}))}`;
   const image=await feedbackReferenceSheet(originalInput);
   const prompt={...JSON.parse(request.prompt),jobId:sourceId};
   const model=(await source.query("SELECT value FROM settings WHERE key='ai_deep_model'")).rows[0]?.value??(await import('../src/lib/ai-routing')).DEEP_MODEL;
   const expected=digest(JSON.stringify({context:{jobId:sourceId,requestId},model,system:request.system,prompt:JSON.stringify(prompt),images:image?[digest(image)]:undefined,schema:z.toJSONSchema(request.schema),maxOutputTokens:request.maxOutputTokens??4000,...(request.minimumOutputTokens===undefined?{}:{minimumOutputTokens:request.minimumOutputTokens})}));
   ledgerMatches=expected===received.input_hash;
   assert(ledgerMatches,'The next live analysis must reuse the saved receipt without another paid call');
   return request.schema.parse(received.result);
  },async()=>null);
  const {priceCamPlan}=await import('../src/lib/providers/cam-pricing');
  const {IMAGE_ENDPOINT}=await import('../src/lib/concept/generation-plan');
  const {ALIGNMENT_ENDPOINT}=await import('../src/lib/concept/transcription');
  const {VIDEO_MODELS,isHiggsfieldVideo}=await import('../src/lib/concept/model-selection');
  const quote:Parameters<typeof updateLiveProduction>[3]=async(plan,options)=>{quotes++;if(failPricing){failPricing=false;throw Error("Offline price service interruption");}return priceCamPlan(plan,{
   fal:async()=>({prices:[{endpoint_id:IMAGE_ENDPOINT,unit_price:.15,unit:'images',currency:'USD'},{endpoint_id:ALIGNMENT_ENDPOINT,unit_price:.0008,unit:'compute seconds',currency:'USD'},...VIDEO_MODELS.filter(m=>!isHiggsfieldVideo(m)).map(endpoint_id=>({endpoint_id,unit_price:.14,unit:'seconds',currency:'USD'}))],billing_events:[]}),
   higgsfield:async(name,args)=>{assert(['generate_audio','generate_video'].includes(name));assert.equal((args.params as Record<string,unknown>).get_cost,true);return {structuredContent:{cost:{credits:1,credits_exact:1}}};}
  },Date.now(),{...options,higgsfieldCreditUsd:.01});};
  await assert.rejects(()=>updateLiveProduction(id,{action:'film-apply-all',target,ids},actor,quote,director),/Offline price service interruption/);
  await updateLiveProduction(id,{action:'film-apply-all',target,ids},actor,quote,director);
  assert.equal(inferenceResponses,1,'Price recovery must reuse the director receipt');
  const result=await json('production.json');assert(result.pendingQuote);
  assert.deepEqual(result.filmCorrection.scenes,[3,5]);
  assert.deepEqual(Object.keys(result.filmCorrection.revisions),[]);
  assert.equal(result.filmCorrection.notes.length,3);
  assert.equal(result.pendingRetries['scene-3-clip'],undefined);
  assert.equal(result.pendingRetries['scene-3-draft'],undefined);
  assert.equal(result.pendingRetries['scene-5-clip'],(state.retries?.['scene-5-clip']??0)+1);
  const added=result.pendingQuote.lines.filter((l:{id:string})=>!state.quote.lines.some((old:{id:string})=>old.id===l.id));
  assert.deepEqual(added.map((l:{id:string})=>l.id).sort(),['scene-3-clip','scene-5-clip-retry-1']);
  for(const line of state.quote.lines.filter((l:{kind:string})=>l.kind==='video'))assert.deepEqual(result.pendingQuote.lines.find((l:{id:string})=>l.id===line.id),line);
  assert.deepEqual(result.quote,state.quote);assert.deepEqual(result.approval,state.approval);
  const notes=await json('film-feedback.json');
  assert.deepEqual(notes.comments.map(({id,text,seconds}:{id:string;text:string;seconds:number|null})=>({id,text,seconds})),book.comments.map(({id,text,seconds}:{id:string;text:string;seconds:number|null})=>({id,text,seconds})));
  assert.equal(result.background.kick,false);
  // A repeated click reuses the exact pending offer without another analysis/quote.
  await updateLiveProduction(id,{action:'film-apply-all',target,ids},actor,quote,async()=>{throw Error('Unexpected repeated inference');});
  assert.equal(quotes,2);assert.equal((await json('production.json')).pendingQuote.id,result.pendingQuote.id);
  // Exercise explicit approval only in the isolated copy; no worker is started.
  const approval=await updateLiveProduction(id,{action:'approve',quote:result.pendingQuote.id},actor,quote,director);
  assert.equal(approval.advance,true);
  const accepted=await json('production.json');
  assert.equal(accepted.quote.id,result.pendingQuote.id);assert.equal(accepted.filmCorrection.status,'working');
  assert.deepEqual(accepted.filmCorrection.scenes,[3,5]);assert.equal(accepted.pendingQuote,null);
  assert.deepEqual((await json('storyboard-feedback.json')).imageRevisions,JSON.parse(await readFile(path.join(src,'storyboard-feedback.json'),'utf8')).imageRevisions);
  for(const [f,hash] of hashes)assert.equal(createHash('sha256').update(await readFile(path.join(src,f))).digest('hex'),hash,`Source changed: ${f}`);
  await mkdir('storage/qa',{recursive:true});
  const proof={status:'passed',realDirectorValidation:true,savedInferenceReceiptMatches:ledgerMatches,priceRetryReusesInference:inferenceResponses===1,source:sourceId,quotedScenes:result.filmCorrection.scenes,newOperations:added.map((l:{id:string})=>l.id),notesPreserved:3,existingVideoPricesPreserved:true,originalApprovalUnchanged:true,isolatedPriceApprovalAccepted:true,doubleClickReusesQuote:true,sourceFilesUnchanged:hashes.size,externalCalls:network,paidCalls:0};await writeFile('storage/qa/current-film-feedback-proof.json',JSON.stringify(proof,null,2));console.log(proof);
 }finally{await rm(dest,{recursive:true,force:true});await pool.end();await source.query(`DROP SCHEMA ${isolation} CASCADE`);await source.end();}
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
