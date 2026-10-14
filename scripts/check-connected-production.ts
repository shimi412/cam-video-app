/** Real controller and media processing, injected provider contracts, no network. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db,pool,schema } from "../src/db";
import { resolveParams } from "../src/lib/brain";
import { getRecipe } from "../src/lib/recipes";
import { planConcept } from "../src/lib/concept/storyboard";
import { localNarration } from "../src/lib/concept/local-voice";
import { updateLiveProduction,runLiveProduction,liveView } from "../src/lib/concept/live-production";
import { priceCamPlan } from "../src/lib/providers/cam-pricing";
import { IMAGE_ENDPOINT,VIDEO_ENDPOINT } from "../src/lib/concept/generation-plan";
import { ALIGNMENT_ENDPOINT } from "../src/lib/concept/transcription";
import { CAM_VOICE } from "../src/lib/concept/cam-voice";
import type { JsonRequest,McpCall } from "../src/lib/concept/provider-transports";
import type { AssetTransport } from "../src/lib/concept/media-transfers";
import { sha256 } from "../src/lib/concept/checkpoints";
import { queueExports,runExports,exportView } from "../src/lib/format-exports";
process.env.PROVIDER_MODE="dryrun";process.env.BRAIN_MODE="mock";process.env.CAM_AUTH_MODE="required";process.env.CAM_RELEASE="connected";process.env.CAM_LIVE_ENABLED="1";
let network=0,submissions=0,lostPoll=true;
const realNow=Date.now;
globalThis.fetch=async()=>{network++;throw new Error("Network forbidden in connected production check");};
const id=randomUUID(),conversationId=randomUUID(),scope=`qa-${id}`,workspace=path.join(process.cwd(),"storage/qa",scope),script="Check the original source before sharing a claim.";
async function main(){
 try{
  const {params}=resolveParams(script,"auto",{aspectRatio:"16:9"}),recipe=getRecipe(params.templateSlug)!,board=planConcept(script,recipe,params.aspectRatio);
  await mkdir(path.join(workspace,"assets"),{recursive:true});
  const timing=await localNarration(workspace,board.shots.map(s=>s.narration),"local-en",{directory:path.join(workspace,"voice-cache"),assertOwned:async()=>{}});
  const wav=await readFile(path.join(workspace,"assets/narration.wav"));
  const png=await sharp({create:{width:640,height:360,channels:3,background:"#245765"}}).png().toBuffer();
  await writeFile(path.join(workspace,"image.png"),png);
  await promisify(execFile)("ffmpeg",["-y","-loglevel","error","-loop","1","-i",path.join(workspace,"image.png"),"-t","15","-r","30","-an","-c:v","libx264","-pix_fmt","yuv420p",path.join(workspace,"clip.mp4")],{timeout:60000});
  const video=await readFile(path.join(workspace,"clip.mp4")),requests=new Map<string,string>();
  const fal:JsonRequest=async(url,init)=>{
   if(url.includes("/models/pricing"))return {prices:[{endpoint_id:IMAGE_ENDPOINT,unit_price:.15,unit:"images",currency:"USD"},{endpoint_id:VIDEO_ENDPOINT,unit_price:.14,unit:"seconds",currency:"USD"},{endpoint_id:ALIGNMENT_ENDPOINT,unit_price:.0008,unit:"compute seconds",currency:"USD"}]};
   if(url.includes("billing-events"))throw new Error("Fixture billing receipt unavailable");
   if(init.method==="POST"){
    const requestId=randomUUID(),kind=url.includes("whisper")?"alignment":url.includes("nano-banana")?"image":"video";
    requests.set(requestId,kind);submissions++;return {request_id:requestId};
   }
   const requestId=url.match(/requests\/([^/]+)/)?.[1];assert(requestId&&requests.has(requestId));
   if(url.endsWith("/status"))return {status:"COMPLETED",request_id:requestId};
   const kind=requests.get(requestId);
   if(kind==="alignment")return {text:script,chunks:timing.words.map(w=>({text:w.word,timestamp:[w.start,w.end]}))};
   if(kind==="image")return {images:[{url:`https://v3.fal.media/${requestId}.png`}]};
   return {video:{url:`https://v3.fal.media/${requestId}.mp4`}};
  };
  const higgsfield:McpCall=async(name,args)=>{
   const params=args.params as Record<string,unknown>;
   if(name==="generate_audio"&&params.get_cost===true)return {structuredContent:{cost:{credits:.15,credits_exact:.15}}};
   if(name==="generate_audio"){
    assert.equal(params.use_unlim,false);assert.equal(params.voice_id,CAM_VOICE.voiceId);assert.equal(params.prompt,script);submissions++;
    return {structuredContent:{results:[{id:"offline-bram-request",type:"audio",model:"text2speech_v2"}]}};
   }
   assert.equal(name,"jobs_wait");
   if(lostPoll){lostPoll=false;throw new Error("Fixture lost poll response after acknowledgement");}
   return {structuredContent:{jobs:[{job_id:"offline-bram-request",index:0,status:"completed",type:"audio",model:"text2speech_v2",result_url:"https://cdn.higgsfield.ai/offline-fixture.wav"}]}};
  };
  const assets:AssetTransport={mode:"live",upload:async bytes=>({url:`https://v3.fal.media/${sha256(bytes)}`,expiresAt:Date.now()+86400000}),download:async url=>new Response(new Uint8Array(url.endsWith(".wav")?wav:url.endsWith(".png")?png:video))};
  const dependencies={providers:async()=>({fal,higgsfield,close:async()=>{}}),assets:()=>assets,budgetScope:scope};
  await db.insert(schema.conversations).values({id:conversationId,title:"Disposable connected controller QA"});
  await db.insert(schema.jobs).values({id,conversationId,script,status:"estimated",params:{...params,live:true,executionMode:"fal"}});
  process.env.PROVIDER_MODE="fal";
  await runLiveProduction(id,dependencies);assert.equal(submissions,0);
  await updateLiveProduction(id,{action:"quote"},"qa",plan=>priceCamPlan(plan,{fal,higgsfield}));
  let view=await liveView(id);assert(view.quote);assert.equal(submissions,0);assert.equal(view.quote.falBillingAvailable,false);
  const {index,narration,imagePrompt,motionPrompt,endImagePrompt,clipSeconds,...direction}=board.shots[0];
  void narration;void imagePrompt;void motionPrompt;void endImagePrompt;void clipSeconds;
  await updateLiveProduction(id,{action:"edit",scene:index,direction:{...direction,scene:"A clay narrator examines an open book."}},"qa");
  assert.equal((await liveView(id)).quote,null);
  await updateLiveProduction(id,{action:"quote"},"qa",plan=>priceCamPlan(plan,{fal,higgsfield}));view=await liveView(id);
  await assert.rejects(()=>updateLiveProduction(id,{action:"approve",quote:"0".repeat(64)},"qa"),/quote changed/);
  await updateLiveProduction(id,{action:"approve",quote:view.quote!.id},"qa");
  await assert.rejects(()=>updateLiveProduction(id,{action:"edit",scene:index,direction},"qa"),/approved/);
  await runLiveProduction(id,dependencies);assert.equal(submissions,1);view=await liveView(id);assert.match(view.error!,/lost poll/);
  await runLiveProduction(id,dependencies);assert.equal(submissions,2);view=await liveView(id);assert.equal(view.review?.stage,"voice");
  await runLiveProduction(id,{...dependencies,providers:async()=>{throw new Error("Fixture connection unavailable");}});
  assert.match((await liveView(id)).error!,/connection unavailable/);
  // Two reconnects reuse the same voice, transcript and reservation.
  await runLiveProduction(id,dependencies);assert.equal(submissions,2);view=await liveView(id);
  const previousQuote=view.quote!;
  Date.now=()=>realNow()+7200_000;
  let reviews=0,renewed=false;
  while(!view.finished){
   assert(view.review,JSON.stringify(view));
   await assert.rejects(()=>updateLiveProduction(id,{action:"review",target:"f".repeat(64),decision:"approved"},"qa"),/review changed/);
   if(view.review.stage==="storyboard"){
    assert(view.storyboard);assert.equal(view.storyboard.status,"pending");assert.equal(submissions,3);
    await assert.rejects(()=>updateLiveProduction(id,{action:"review",target:view.review!.target,decision:"approved"},"qa"),/Confirm that you reviewed/);
    const count:number=submissions;await runLiveProduction(id,dependencies);assert.equal(submissions,count);
   }
   await updateLiveProduction(id,{action:"review",target:view.review.target,decision:"approved",storyboardConfirmed:view.review.stage==="storyboard"},"qa");reviews++;
   await runLiveProduction(id,dependencies);view=await liveView(id);
   if(view.error?.includes("quote expired")){
    assert(!renewed);const before:number=submissions;
    await updateLiveProduction(id,{action:"quote"},"qa",plan=>priceCamPlan(plan,{fal,higgsfield}));
    view=await liveView(id);assert(view.renewing);assert.notEqual(view.quote!.id,previousQuote.id);
    await runLiveProduction(id,dependencies);assert.equal(submissions,before);
    await assert.rejects(()=>updateLiveProduction(id,{action:"approve",quote:previousQuote.id},"qa"),/quote changed/);
    await updateLiveProduction(id,{action:"approve",quote:view.quote!.id},"qa");
    await runLiveProduction(id,dependencies);view=await liveView(id);renewed=true;
   }
   assert(!view.error,view.error??"");assert(reviews<10);
  }
  assert.equal(submissions,4);assert.equal(view.costsPending,4);assert.equal(network,0);assert(renewed);
  const [job]=await db.select().from(schema.jobs).where(eq(schema.jobs.id,id));assert.equal(job.status,"succeeded");assert(job.outputPath);assert.equal(job.billedUsd,null);
  const output=await readFile(job.outputPath);assert(output.length>1000);
  await queueExports(id);await runExports(id);
  const [exported]=await db.select().from(schema.jobs).where(eq(schema.jobs.id,id));
  const downloads=await exportView(exported);assert.equal(downloads.state?.status,"complete");assert.equal(downloads.state.files.length,3);
  await runLiveProduction(id,dependencies);assert.equal(submissions,4);
  const proof={status:"passed",providerResponses:"injected fixtures only",voice:"local Daniel test voice, not Bram",networkCalls:network,paidCalls:0,creditsSpent:0,draftEditsInvalidateQuote:true,approvedScenesCannotMutate:true,threeFormats:true,staleQuoteRejected:true,staleReviewRejected:true,reconnectReusesVoice:true,expiredQuoteRenewedWithoutDuplicates:renewed,connectionErrorSaved:true,fullControllerRenders:true,explicitStoryboardConfirmationRequired:true,pendingCostsNotInvented:true,clientNotDebited:true,submissionsSimulated:submissions,reviews};
  await writeFile("storage/qa/cam-connected-controller-proof.json",JSON.stringify(proof,null,2));console.log(proof);
 }finally{
  Date.now=realNow;
  await db.delete(schema.apiCalls).where(eq(schema.apiCalls.jobId,id));await db.delete(schema.jobs).where(eq(schema.jobs.id,id));await db.delete(schema.conversations).where(eq(schema.conversations.id,conversationId));
  await pool.query("DELETE FROM settings WHERE key=$1",[`cam-budget:live:${scope}`]);
  for(const dir of [workspace,path.join("storage/concepts",id),path.join("storage/imports",id),path.join("storage/exports",id)])await rm(dir,{recursive:true,force:true});
  await rm(path.join("storage/outputs",`${id}.mp4`),{force:true});await pool.end();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
