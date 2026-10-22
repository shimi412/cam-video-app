/** Rehearse a saved, not-yet-started launch in a disposable schema. No worker,
 * provider credentials, network calls, or mutations to the source production. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,readFile,readdir,rm,writeFile} from "node:fs/promises";
import {Pool} from "pg";
async function main(){
const sourceId=process.argv[2];
assert.match(sourceId??"",/^[a-f0-9-]{36}$/);
const source=new Pool({connectionString:process.env.DATABASE_URL??"postgres://cam:cam@localhost:5433/cam_video_app"});
const sourceRow=(await source.query("SELECT script,params,status,error FROM jobs WHERE id=$1",[sourceId])).rows[0];
assert(sourceRow);assert.equal(sourceRow.status,"estimated");
const isolation=`start_qa_${randomUUID().replaceAll("-","")}`,jobId=randomUUID();
const url=new URL(process.env.DATABASE_URL??"postgres://cam:cam@localhost:5433/cam_video_app");url.searchParams.set("options",`-c search_path=${isolation}`);
process.env.DATABASE_URL=url.href;
Object.assign(process.env,{PROVIDER_MODE:"fal",CAM_AUTH_MODE:"required",CAM_RELEASE:"connected",CAM_LIVE_ENABLED:"1"});
let externalCalls=0;globalThis.fetch=async()=>{externalCalls++;throw Error("Network forbidden in saved launch rehearsal");};
await source.query(`CREATE SCHEMA ${isolation}`);
const {pool}=await import("../src/db");
try{
 for(const f of (await readdir("migrations")).filter(f=>f.endsWith(".sql")).sort())await pool.query(await readFile(`migrations/${f}`,"utf8"));
 await pool.query("INSERT INTO jobs(id,script,params,status) VALUES($1,$2,$3,'estimated')",[jobId,sourceRow.script,JSON.stringify(sourceRow.params)]);
 const pricing=(await source.query("SELECT value FROM settings WHERE key='customer_pricing'")).rows[0].value;
 await pool.query("INSERT INTO settings(key,value) VALUES('customer_pricing',$1)",[JSON.stringify(pricing)]);
 await pool.query("INSERT INTO credit_ledger(delta_usd,kind,note,wallet) VALUES(1000,'topup','Disposable launch rehearsal','customer')");
 const {liveView,updateLiveProduction}=await import("../src/lib/concept/live-production");
 const {priceCamPlan}=await import("../src/lib/providers/cam-pricing");
 const {customerQuote}=await import("../src/lib/customer-wallet");
 const {assertStoryboardLaunchQuote}=await import("../src/lib/concept/storyboard-launch");
 const {initializeStoryboardLaunch}=await import("../src/lib/concept/storyboard-launch-service");
 const {IMAGE_ENDPOINT}=await import("../src/lib/concept/generation-plan");
 const launch=sourceRow.params.storyboardLaunch;
 const getQuote:typeof import("../src/lib/providers/cam-pricing").fetchCamQuote=async(plan,options)=>priceCamPlan(plan,{
  fal:async()=>({prices:[{endpoint_id:IMAGE_ENDPOINT,unit_price:.15,unit:"images",currency:"USD"}]}),
  higgsfield:async()=>{throw Error("No voice or animation pricing allowed");},
 },Date.now(),options);
 const services={view:liveView,quote:(id:string,actor:string)=>updateLiveProduction(id,{action:"quote"},actor,getQuote),customerQuote,
  validate:(receipt:typeof launch.receipt,quote:Parameters<typeof assertStoryboardLaunchQuote>[1],price:Parameters<typeof assertStoryboardLaunchQuote>[2])=>assertStoryboardLaunchQuote(receipt,quote,price,{acceptedAt:launch.acceptedAt}),
  approve:(id:string,quote:{quote:string;customerQuote:string},actor:string)=>updateLiveProduction(id,{action:"approve",...quote},actor,getQuote)};
 assert.deepEqual(await initializeStoryboardLaunch({jobId,actorId:launch.actorId,receipt:launch.receipt},services),{advance:true});
 const view=await liveView(jobId);assert.equal(view.approved,true);assert.equal(view.requests.length,0);
 assert.equal(view.quote?.scope,"storyboard");assert.equal(view.quote?.lines.filter(l=>l.id.startsWith("cast-")).length,1);
 assert.deepEqual(await initializeStoryboardLaunch({jobId,actorId:launch.actorId,receipt:launch.receipt},services),{advance:true});
 assert.equal((await pool.query("SELECT count(*)::int n FROM credit_holds WHERE job_id=$1",[jobId])).rows[0].n,1);
 assert.deepEqual((await source.query("SELECT script,params,status,error FROM jobs WHERE id=$1",[sourceId])).rows[0],sourceRow);
 const persistedParams=(await pool.query("SELECT params FROM jobs WHERE id=$1",[jobId])).rows[0].params;
 const endpointScenes:number[]=persistedParams.endpointCompletion?.scenes??[];
 for(const scene of endpointScenes){
  assert.equal(sourceRow.params.sceneDirections[scene].endScene,null);
  assert(persistedParams.sceneDirections[scene].endScene.includes(sourceRow.params.sceneDirections[scene].motion));
  assert.equal(persistedParams.sceneDirections[scene].scene,sourceRow.params.sceneDirections[scene].scene);
 }
 assert.deepEqual(persistedParams.sceneNarrations,sourceRow.params.sceneNarrations);
 assert.equal(externalCalls,0);
 const proof={sourceJob:sourceId,at:new Date().toISOString(),passed:true,endpointScenes,persistedPlanSurvivesApproval:true,imageCount:view.quote?.lines.length,internalSheets:1,pricing:"offline fixture, $0.15 per image",supplierUsd:view.quote!.caps.usd/1e6,sourcePreserved:true,externalCalls,paidGenerations:0,workerStarted:false,replayDoesNotDuplicateHold:true};
 await mkdir("storage/qa",{recursive:true});await writeFile("storage/qa/saved-storyboard-start-proof.json",JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{await pool.end();await source.query(`DROP SCHEMA ${isolation} CASCADE`);await source.end();await rm(`storage/concepts/${jobId}`,{recursive:true,force:true});}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
