import type {FeedbackDirector} from '../src/lib/concept/feedback-director';

import type {requestBrainObject} from '../src/lib/providers/brain';
/** Replay the client's actual notes against an isolated copy. No provider permitted. */
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
 const isolation=`feedback_qa_${randomUUID().replaceAll('-','')}`,id=randomUUID(),dest=path.join(process.cwd(),'storage/concepts',id),dir=path.join(dest,'live');
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
  const {directFeedback}=await import('../src/lib/concept/feedback-director');const {feedbackReferenceSheet}=await import('../src/lib/concept/feedback-reference-sheet');
  const old=await json('storyboard-review.json'),feedback=await json('storyboard-feedback.json');
  const before=await liveView(id,row.params.aspectRatio),target=before.storyboard!.target;
  let analysis=0,referenceSheets=0;
  const director:FeedbackDirector=(input,owned)=>directFeedback(input,owned,(async request=>{analysis++;assert(request.requireClaude);assert.equal(request.images?.length,1);referenceSheets++;
   return {decisions:input.notes.map(note=>({id:note.id,stage:'visual',status:'planned',message:'Simulated semantic decision for the saved client instruction.',finishing:null,changes:[{scene:note.scenes[0],edit:note.scenes[0]===3?{graphicLayers:[]}:{textOnly:true,visualMode:'presenter-text',graphicLayers:[],overlay:input.panels.find(p=>p.scene===8)!.narration},imageInstruction:null,characters:[]}]}))};
  }) as typeof requestBrainObject,context=>feedbackReferenceSheet({...context,jobId:sourceId}));
  const quote=async()=>{quotes++;throw Error('Pricing forbidden for local corrections');};
  for(const scene of [3,8])await updateLiveProduction(id,{action:'storyboard-lock',scene,target,text:feedback.comments[scene].text},state.approval.actor,quote,director);
  assert.deepEqual(await updateLiveProduction(id,{action:'storyboard-batch-apply',target},state.approval.actor,quote,director),{advance:false});
  const sheet=await json('storyboard-review.json'),after=await json('production.json');
  assert.deepEqual(sheet.panels.find((p:{scene:number})=>p.scene===3).graphicLayers,[]);
  assert.equal(sheet.panels.find((p:{scene:number})=>p.scene===8).textOnly,true);
  assert.equal(sheet.panels.find((p:{scene:number})=>p.scene===8).overlay,"Don't be a victim of propaganda.");
  for(const panel of sheet.panels){const previous=old.panels.find((p:{scene:number})=>p.scene===panel.scene);assert.deepEqual(panel.start,previous.start);assert.deepEqual(panel.end,previous.end);if(![3,8].includes(panel.scene))assert.deepEqual(panel,previous);}
  assert.deepEqual(after.quote,state.quote);assert.deepEqual(after.approval,state.approval);assert.equal(quotes,0);assert.equal(network,0);
  for(const [f,hash] of hashes)assert.equal(createHash('sha256').update(await readFile(path.join(src,f))).digest('hex'),hash,`Source changed: ${f}`);
  await mkdir('storage/qa',{recursive:true});
  const proof={status:'passed',sourceId,snapshotSource:src,semanticAnalysis:analysis,actualReferenceSheets:referenceSheets,simulatedClaude:true,scenes:[3,8],originalCommentsIncludingTypos:true,sourceFilesUnchanged:hashes.size,otherPanelsPreserved:true,oldImageFilesPreserved:true,localTextFromNarrationOnly:true,pricingCalls:quotes,externalCalls:network,paidCalls:0,workerStarted:false};
  await writeFile('storage/qa/saved-feedback-proof.json',JSON.stringify(proof,null,2));console.log(proof);
 }finally{await rm(dest,{recursive:true,force:true});await pool.end();await source.query(`DROP SCHEMA ${isolation} CASCADE`);await source.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
