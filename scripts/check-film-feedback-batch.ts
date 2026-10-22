/** Exercise film feedback batching on a disposable copy. No provider or worker permitted. */
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
 const isolation=`film_batch_qa_${randomUUID().replaceAll('-','')}`,id=randomUUID(),dest=path.join(process.cwd(),'storage/concepts',id),dir=path.join(dest,'live');
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
  const {updateLiveProduction}=await import('../src/lib/concept/live-production');
  const {FinishingSettings}=await import('../src/lib/concept/finishing-review');
  const originalState=await json('production.json'),originalOutcome=await json('state.json');
  const target=originalOutcome.review.target,actor=state.approval.actor;
  let analyses=0;
  const ids=[randomUUID(),randomUUID()];
  const director:import('../src/lib/concept/feedback-director').FeedbackDirector=async input=>{
   analyses++;assert.deepEqual(input.notes.map(n=>n.id),ids);
   return {decisions:input.notes.map((n,i)=>({id:n.id,status:'planned',stage:'visual',message:'Fixture compiled the locked note',changes:[{scene:i===0?1:9,edit:i===0?null:{textOnly:true,visualMode:'presenter-text',graphicLayers:[],overlay:"Don't be a victim of propaganda."},imageInstruction:i===0?'Keep the original composition and make its background blue. No lettering.':null,characters:[]}],finishing:null}))};
  };
  const {priceCamPlan}=await import('../src/lib/providers/cam-pricing');
  const {IMAGE_ENDPOINT}=await import('../src/lib/concept/generation-plan');
  const {ALIGNMENT_ENDPOINT}=await import('../src/lib/concept/transcription');
  const {VIDEO_MODELS,isHiggsfieldVideo}=await import('../src/lib/concept/model-selection');
  const quote:Parameters<typeof updateLiveProduction>[3]=async(plan,options)=>{quotes++;return priceCamPlan(plan,{
   fal:async()=>({prices:[{endpoint_id:IMAGE_ENDPOINT,unit_price:.15,unit:'images',currency:'USD'},{endpoint_id:ALIGNMENT_ENDPOINT,unit_price:.0008,unit:'compute seconds',currency:'USD'},...VIDEO_MODELS.filter(m=>!isHiggsfieldVideo(m)).map(endpoint_id=>({endpoint_id,unit_price:.14,unit:'seconds',currency:'USD'}))],billing_events:[]}),
   higgsfield:async(name,args)=>{assert(['generate_audio','generate_video'].includes(name));assert.equal((args.params as Record<string,unknown>).get_cost,true);return {structuredContent:{cost:{credits:1,credits_exact:1}}};}
  },Date.now(),{...options,higgsfieldCreditUsd:.01});};
  // Locking is persistence only, even with several notes and existing receipts.
  for(const [i,note] of ['Make the background of scene 1 blue','Scene 9: text animation only'].entries())await updateLiveProduction(id,{action:'film-comment',target,id:ids[i],text:note,seconds:null},actor,quote,director);
  assert.equal(analyses,0);assert.equal(quotes,0);assert.deepEqual(await json('state.json'),originalOutcome);
  await updateLiveProduction(id,{action:'film-apply-all',target,ids},actor,quote,director);
  const priced=await json('production.json');assert.equal(analyses,1);assert.equal(quotes,1);assert(priced.pendingQuote);
  assert.deepEqual(priced.filmCorrection.notes.map((n:{id:string})=>n.id),ids);assert.deepEqual(priced.filmCorrection.scenes,[1,9]);
  assert.deepEqual(Object.keys(priced.filmCorrection.revisions),['1']);assert(priced.filmCorrection.edits['9'].textOnly);
  assert.deepEqual(priced.quote,originalState.quote);assert.deepEqual(priced.approval,originalState.approval);
  assert.equal(priced.pendingRetries['scene-9-draft'],originalState.retries?.['scene-9-draft']);
  await updateLiveProduction(id,{action:'film-apply-all',target,ids},actor,quote,director);assert.equal(analyses,1);assert.equal(quotes,1);
  await updateLiveProduction(id,{action:'film-comment-remove',target,id:ids[1]},actor,quote,director);assert.equal((await json('production.json')).pendingQuote,null);
  // A motion-only revision prices one clip, while an unsupported transition stays deferred.
  await writeFile(path.join(dir,'production.json'),JSON.stringify(originalState));
  await writeFile(path.join(dir,'film-feedback.json'),JSON.stringify({version:1,comments:[]}));
  for(const [i,note] of ['Scene 1 is static; add continuous movement','The final transition is abrupt'].entries())await updateLiveProduction(id,{action:'film-comment',target,id:ids[i],text:note,seconds:i===1?originalOutcome.review.film.duration-.1:null},actor,quote,director);
  const motionDirector:import('../src/lib/concept/feedback-director').FeedbackDirector=async()=>({decisions:[
   {id:ids[0],stage:'visual',status:'planned',message:'Prepare a new moving clip',finishing:null,changes:[{scene:1,edit:{motion:'The guide turns the newspaper slowly while the camera moves closer, keeping continuous motion through the full shot.',visualMode:'metaphor',textOnly:false},imageInstruction:null,characters:[]}]},
   {id:ids[1],stage:'finishing',status:'clarify',message:'Keep the final transition request for finishing.',finishing:null,changes:[]}
  ]});
  await updateLiveProduction(id,{action:'film-apply-all',target,ids},actor,quote,motionDirector);
  const motion=await json('production.json');assert(motion.pendingQuote);assert.deepEqual(motion.filmCorrection.revisions,{});assert(motion.filmCorrection.edits['1'].motion);
  assert.deepEqual(motion.filmCorrection.notes.map((n:{id:string})=>n.id),[ids[0]]);
  assert.equal(motion.pendingRetries['scene-1-start'],originalState.retries?.['scene-1-start']);
  assert.equal((await json('film-feedback.json')).comments.find((c:{id:string})=>c.id===ids[1]).stage,'finishing');
  // Explicit defer preserves the note and clears its unapproved visual quote.
  await updateLiveProduction(id,{action:'film-defer',target,id:ids[0]},actor,quote,motionDirector);
  const deferred=await json('film-feedback.json');assert.equal(deferred.comments.length,2);assert(deferred.comments.every((c:{stage:string})=>c.stage==='finishing'));
  const {assertFilmFeedbackResolved}=await import('../src/lib/concept/film-feedback');assertFilmFeedbackResolved(deferred.comments,target);
  assert.equal((await json('production.json')).pendingQuote,null);
  // Same two-note action in finishing produces one settings update and one render intent.
  await writeFile(path.join(dir,'production.json'),JSON.stringify(originalState));
  const settings=FinishingSettings.parse({});
  await writeFile(path.join(dir,'finishing.json'),JSON.stringify({version:1,packet:{},settings,pending:null,file:originalOutcome.review.film.file,sha256:originalOutcome.review.film.sha256,duration:originalOutcome.review.film.duration,target,appliedComments:[],pendingComments:[]}));
  await writeFile(path.join(dir,'film-feedback.json'),JSON.stringify({version:1,comments:[]}));
  for(const [i,note] of ['Lower the music','Make captions larger'].entries())await updateLiveProduction(id,{action:'film-comment',target,id:ids[i],text:note,seconds:null},actor,quote,director);
  let finishingAnalyses=0;
  const finishingDirector:import('../src/lib/concept/feedback-director').FeedbackDirector=async input=>{finishingAnalyses++;assert.equal(input.notes.length,2);return {decisions:input.notes.map((n,i)=>({id:n.id,status:'planned',stage:'finishing',message:'Fixture finishing change',changes:[],finishing:{...settings,...(i===0?{musicLevel:'quiet' as const}:{captionSize:'large' as const})}}))};};
  assert.equal((await updateLiveProduction(id,{action:'film-apply-all',target,ids},actor,quote,finishingDirector)).advance,true);
  const finishing=await json('finishing.json');assert.deepEqual(finishing.pendingComments,ids);assert.equal(finishing.pending.musicLevel,'quiet');assert.equal(finishing.pending.captionSize,'large');assert.equal(finishingAnalyses,1);
  assert.equal(network,0);
  for(const [f,hash] of hashes)assert.equal(createHash('sha256').update(await readFile(path.join(src,f))).digest('hex'),hash,`Source changed: ${f}`);
  await mkdir('storage/qa',{recursive:true});
  const proof={status:'passed',sourceId,sourceFilesUnchanged:hashes.size,lockStartsNoWork:true,batchNotes:2,visualAnalyses:analyses,pricingCalls:quotes,motionOnlyQuotePreservesImages:true,finishingClarificationDoesNotBlockVisualBatch:true,explicitDeferPreservesNotes:true,finishingAnalyses,oneFinishingRenderIntent:true,localSceneNotRegenerated:true,originalQuoteAndApprovalPreserved:true,simulatedPrices:true,externalCalls:network,paidCalls:0,workerStarted:false};
  await writeFile('storage/qa/film-feedback-batch-proof.json',JSON.stringify(proof,null,2));console.log(proof);
 }finally{await rm(dest,{recursive:true,force:true});await pool.end();await source.query(`DROP SCHEMA ${isolation} CASCADE`);await source.end();}
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
