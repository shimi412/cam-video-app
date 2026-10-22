import {SubmissionNotSentError} from "../src/lib/providers/network";
import {lockedAssets} from "../src/lib/concept/assets";
import { KLING_PRO, HF_SEEDANCE, KLING_STANDARD, KLING_TURBO } from "../src/lib/concept/model-selection";
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
import { createStoryboardLaunch, verifyStoryboardLaunch, assertStoryboardLaunchQuote } from "../src/lib/concept/storyboard-launch";
import { initializeStoryboardLaunch } from "../src/lib/concept/storyboard-launch-service";
import { IMAGE_ENDPOINT,VIDEO_ENDPOINT } from "../src/lib/concept/generation-plan";
import { ALIGNMENT_ENDPOINT } from "../src/lib/concept/transcription";
import { CAM_VOICE } from "../src/lib/concept/cam-voice";
import type { JsonRequest,McpCall } from "../src/lib/concept/provider-transports";
import type { AssetTransport } from "../src/lib/concept/media-transfers";
import { sha256 } from "../src/lib/concept/checkpoints";
import { queueExports,runExports,exportView } from "../src/lib/format-exports";
process.env.PROVIDER_MODE="dryrun";process.env.BRAIN_MODE="mock";process.env.CAM_AUTH_MODE="required";process.env.CAM_RELEASE="connected";process.env.CAM_LIVE_ENABLED="1";
const castMode=process.env.CAM_TEST_CAST==="1";
const draftMode=true,klingMode=process.env.CAM_TEST_KLING==="1",uncertainMode=process.env.CAM_TEST_UNCERTAIN==="1";
let extra=uncertainMode?1:0;
const holdStoryboard=process.env.CAM_TEST_HOLD_STORYBOARD==="1";
let retainedForUi=false;
const selectedModel = klingMode ? KLING_PRO : HF_SEEDANCE;
let uncertainImage=uncertainMode;
let network=0,submissions=0,lostPoll=true,renewalPrices=false,unsentImage=true;
const realNow=Date.now;
globalThis.fetch=async()=>{network++;throw new Error("Network forbidden in connected production check");};
const id=randomUUID(),conversationId=randomUUID(),scope=`qa-${id}`,workspace=path.join(process.cwd(),"storage/qa",scope),script="Explore the history behind this familiar story.";
async function main(){
 try{
  const {params}=resolveParams(script,"auto",{aspectRatio:"16:9"}),recipe=getRecipe(params.templateSlug)!,board=planConcept(script,recipe,params.aspectRatio);
  await mkdir(path.join(workspace,"assets"),{recursive:true});
  const timing=await localNarration(workspace,board.shots.map(s=>s.narration),"local-en",{directory:path.join(workspace,"voice-cache"),assertOwned:async()=>{}});
  const wav=await readFile(path.join(workspace,"assets/narration.wav"));
  const png=await sharp({create:{width:640,height:360,channels:3,background:"#245765"}}).png().toBuffer();
  await writeFile(path.join(workspace,"image.png"),png);
  await promisify(execFile)("ffmpeg",["-y","-loglevel","error","-loop","1","-i",path.join(workspace,"image.png"),"-t","5","-r","30","-an","-c:v","libx264","-pix_fmt","yuv420p",path.join(workspace,"clip.mp4")],{timeout:60000});
  const video=await readFile(path.join(workspace,"clip.mp4")),requests=new Map<string,string>();
  const imagePayloads:Record<string,unknown>[]=[];
  const castImages=new Map<string,Buffer>();let pendingCastRequest:string|null=null,pausedCast=false;
  const klingPayloads: { model: string; payload: Record<string, unknown> }[] = [];
  const fal:JsonRequest=async(url,init)=>{
   if(url.includes("/models/pricing"))return {prices:[{endpoint_id:IMAGE_ENDPOINT,unit_price:.15,unit:"images",currency:"USD"},{endpoint_id:VIDEO_ENDPOINT,unit_price:renewalPrices?.01:.14,unit:"seconds",currency:"USD"},{endpoint_id:KLING_STANDARD,unit_price:.084,unit:"seconds",currency:"USD"},{endpoint_id:KLING_TURBO,unit_price:.1,unit:"seconds",currency:"USD"},{endpoint_id:ALIGNMENT_ENDPOINT,unit_price:.0008,unit:"compute seconds",currency:"USD"}]};
   if(url.includes("billing-events"))throw new Error("Fixture billing receipt unavailable");
   if(init.method==="POST"){
    const requestId=randomUUID(),kind=url.includes("whisper")?"alignment":url.includes("nano-banana")?"image":"video";
    if(kind==="image"&&unsentImage){unsentImage=false;throw new SubmissionNotSentError("Fixture connection not established");}
    if(kind==="image"){
     const payload=JSON.parse(init.body!);imagePayloads.push(payload);
     if(String(payload.prompt).startsWith("Create one character identity sheet")){
      castImages.set(requestId,await sharp({create:{width:640,height:360,channels:3,background:castImages.size?"#ae8f61":"#315978"}}).png().toBuffer());
      if(!pausedCast){pendingCastRequest=requestId;pausedCast=true;}
     }
    }
    if(kind==="video"){
     assert(klingMode);const payload=JSON.parse(init.body!);
     const model=url.endsWith(KLING_STANDARD)?KLING_STANDARD:KLING_PRO;
     assert(url.endsWith(model));assert(payload.start_image_url);assert(payload.end_image_url);
     assert.equal(payload.duration,"5");assert.equal(payload.generate_audio,false);
     assert.equal(payload.draft_id,undefined);assert.equal(payload.draft_job_id,undefined);
     klingPayloads.push({model,payload});
    }
    requests.set(requestId,kind);submissions++;if(kind==="image"&&uncertainImage){uncertainImage=false;throw new Error("Fixture accepted image response lost");}return {request_id:requestId};
   }
   const requestId=url.match(/requests\/([^/]+)/)?.[1];assert(requestId&&requests.has(requestId));
   if(url.endsWith("/status")){
    if(requestId===pendingCastRequest){pendingCastRequest=null;return {status:"IN_PROGRESS",request_id:requestId};}
    return {status:"COMPLETED",request_id:requestId};
   }
   const kind=requests.get(requestId);
   if(kind==="alignment")return {text:script,chunks:timing.words.map(w=>({text:w.word,timestamp:[w.start,w.end]}))};
   if(kind==="image")return {images:[{url:`https://v3.fal.media/${requestId}.png`}]};
   return {video:{url:`https://v3.fal.media/${requestId}.mp4`}};
  };
  const higgsfield:McpCall=async(name,args)=>{
   const params=args.params as Record<string,unknown>;
   if(name==="generate_video"){
    assert.equal(params.use_unlim,false);
    if(params.get_cost===true){if(!draftMode)throw new Error("Video candidate disabled in legacy fixture");return {structuredContent:{cost:{credits:params.draft?1:2}}};}
    assert(draftMode);assert.equal(params.model,HF_SEEDANCE);submissions++;
    if(params.draft){assert.equal(params.resolution,"480p");assert(Array.isArray(params.medias));requests.set("offline-draft","draft");return {structuredContent:{results:[{id:"offline-draft",type:"video",model:HF_SEEDANCE}]}};}
    assert.equal(params.draft_job_id,"offline-draft");assert.equal(params.resolution,"1080p");requests.set("offline-final","final");return {structuredContent:{results:[{id:"offline-final",type:"video",model:HF_SEEDANCE}]}};
   }
   if(name==="media_import_url")return {structuredContent:{media_id:"offline-reference"}};
   if(name==="generate_audio"&&params.get_cost===true)return {structuredContent:{cost:{credits:.15,credits_exact:.15}}};
   if(name==="generate_audio"){
    assert.equal(params.use_unlim,false);assert.equal(params.voice_id,CAM_VOICE.voiceId);assert.equal(params.prompt,script);submissions++;
    return {structuredContent:{results:[{id:"offline-bram-request",type:"audio",model:"text2speech_v2"}]}};
   }
   assert.equal(name,"jobs_wait");
   const requested=(args.jobs as {job_id:string}[])[0].job_id;
   if(requests.has(requested))return {structuredContent:{jobs:[{job_id:requested,index:0,status:"completed",type:"video",model:HF_SEEDANCE,result_url:`https://cdn.higgsfield.ai/${requested}.mp4`}]}};
   if(lostPoll){lostPoll=false;throw new Error("Fixture lost poll response after acknowledgement");}
   return {structuredContent:{jobs:[{job_id:"offline-bram-request",index:0,status:"completed",type:"audio",model:"text2speech_v2",result_url:"https://cdn.higgsfield.ai/offline-fixture.wav"}]}};
  };
  const expectedSheet=(await lockedAssets()).find(r=>r.id==="narrator")!;
  assert(expectedSheet.characterSheet);
  const uploadedHashes=new Set<string>();
  const assets:AssetTransport={mode:"live",upload:async bytes=>{uploadedHashes.add(sha256(bytes));return {url:`https://v3.fal.media/${sha256(bytes)}`,expiresAt:Date.now()+86400000};},download:async url=>new Response(new Uint8Array(url.endsWith(".wav")?wav:url.endsWith(".png")?(castImages.get(url.split("/").at(-1)!.replace(".png",""))??png):video))};
  const dependencies={providers:async()=>({fal,higgsfield,close:async()=>{}}),assets:()=>assets,budgetScope:scope};
  await db.insert(schema.conversations).values({id:conversationId,title:"Disposable connected controller QA"});
  await db.insert(schema.jobs).values({id,conversationId,script,status:"estimated",params:{...params,live:true,executionMode:"fal"}});
  process.env.PROVIDER_MODE="fal";
  await runLiveProduction(id,dependencies);assert.equal(submissions,0);
  await updateLiveProduction(id,{action:"quote"},"qa",(plan,options)=>priceCamPlan(plan,{fal,higgsfield},Date.now(),options));
  let view=await liveView(id);assert(view.quote);assert.equal(submissions,0);assert.equal(view.quote.falBillingAvailable,false);
  assert.equal(view.quote.scope,"storyboard");assert(view.quote.lines.every(line=>line.kind==="image"));
  const {index,narration,imagePrompt,motionPrompt,endImagePrompt,clipSeconds,...direction}=board.shots[0];
  void narration;void imagePrompt;void motionPrompt;void endImagePrompt;void clipSeconds;
  const staging=klingMode||castMode
   ? {scene:"A clay presenter faces the camera with one hand raised.",endScene:"The same presenter lowers his hand after a wave.",motion:"Small natural waving gesture, fixed camera.",visualMode:"presenter-text" as const,stateChange:false}
   : {scene:"A clay presenter holds a closed vertical scroll.",endScene:"The same presenter holds the fully opened vertical scroll.",motion:"Unroll the scroll downward from its closed top roll, fixed camera.",visualMode:"metaphor" as const,stateChange:true};
  await updateLiveProduction(id,{action:"edit",scene:index,direction:{...direction,...staging,overlay:script,references:["narrator"],actionSeconds:5}},"qa");
  assert.equal((await liveView(id)).quote,null);
  await assert.rejects(()=>updateLiveProduction(id,{action:"approve",quote:"0".repeat(64)},"qa"),/quote changed/);
  const launchInput={script,mode:"auto" as const,overrides:{aspectRatio:"16:9" as const}};
  const launchOptions={secret:"offline-fixture-secret-never-used-in-production",readImageUnitPrice:async()=>.15,readCustomerMultiplier:async()=>2};
  const launchNotice=await createStoryboardLaunch(launchInput,"qa",launchOptions);
  const launchReceipt=verifyStoryboardLaunch(launchNotice.token,launchInput,"qa",launchOptions);
  // This source naturally plans an opening archive with two necessary frames.
  // The fixture's simple/complex staging changes the route, never the image
  // manifest authorized by the actual launch disclosure.
  assert.deepEqual(launchReceipt.imageOperations,["scene-1-start","scene-1-end"]);
  assert.equal(launchReceipt.imageCountCap,2);
  assert.equal(launchReceipt.maxSupplierUsdMicros,300000);
  let launchQuotes=0,launchApprovals=0;
  const launchServices={
   view:liveView,
   quote:async(jobId:string,actorId:string)=>{launchQuotes++;return updateLiveProduction(jobId,{action:"quote"},actorId,(plan,options)=>priceCamPlan(plan,{fal,higgsfield},Date.now(),options));},
   customerQuote:async(_jobId:string,quote:Parameters<typeof assertStoryboardLaunchQuote>[1])=>({id:"offline-customer-quote",amountCents:100,expiresAt:quote.expiresAt}),
   // This diagnostic intentionally omits a real customer wallet reservation.
   approve:async(jobId:string,quote:{quote:string;customerQuote:string},actorId:string)=>{launchApprovals++;return updateLiveProduction(jobId,{action:"approve",quote:quote.quote},actorId);},
   validate:assertStoryboardLaunchQuote,
  };
  assert((await initializeStoryboardLaunch({jobId:id,actorId:"qa",receipt:launchReceipt},launchServices)).advance);
  assert((await initializeStoryboardLaunch({jobId:id,actorId:"qa",receipt:launchReceipt},launchServices)).advance);
  assert.equal(launchQuotes,1);assert.equal(launchApprovals,1);
  view=await liveView(id);assert.equal(view.quote!.scope,"storyboard");assert.equal(view.quote!.lines.length,2);
  await assert.rejects(()=>updateLiveProduction(id,{action:"edit",scene:index,direction},"qa"),/approved/);
  await runLiveProduction(id,dependencies);assert.equal(submissions,0);view=await liveView(id);assert.match(view.error!,/connection not established/);
  if(uncertainMode){
   await runLiveProduction(id,dependencies);view=await liveView(id);assert(view.recovery);assert.equal(submissions,1);
   const oldQuote=view.quote!,target=view.recovery.target;
   await updateLiveProduction(id,{action:"recovery-quote",target},"qa",(plan,options)=>priceCamPlan(plan,{fal,higgsfield},Date.now(),options));
   view=await liveView(id);assert(view.renewing);assert.equal(view.quote!.caps.usd,oldQuote.caps.usd+150000);
   await runLiveProduction(id,dependencies);assert.equal(submissions,1,"A recovery quote alone must not submit");
   await updateLiveProduction(id,{action:"approve",quote:view.quote!.id},"qa");
  }
  await runLiveProduction(id,dependencies);view=await liveView(id);assert(!view.error,view.error??"");assert.equal(submissions,2+extra);assert.equal(view.review?.stage,"storyboard");
  assert([...requests.values()].every(kind=>kind==="image"),"Only images may be submitted before storyboard approval");
  assert.equal(view.review.audio,null);
  let storyboardTarget=view.review.target;
  assert.equal((await initializeStoryboardLaunch({jobId:id,actorId:"qa",receipt:launchReceipt},launchServices)).advance,false);
  await runLiveProduction(id,{...dependencies,providers:async()=>{throw new Error("Fixture connection unavailable");}});
  assert.match((await liveView(id)).error!,/connection unavailable/);
  await runLiveProduction(id,dependencies);assert.equal(submissions,2+extra);view=await liveView(id);assert.equal(view.review!.target,storyboardTarget);
  assert(view.storyboard);assert.equal(view.storyboard.status,"pending");
  assert(view.storyboard.panels[0].start && view.storyboard.panels[0].end);
  // Exercise the real comment controller, saved schema round trip and worker
  // resume. Local graphics must reach the final montage without another image.
  const originalStoryboardTarget=storyboardTarget;
  await updateLiveProduction(id,{action:"storyboard-comment",target:storyboardTarget,scene:1,text:"Add Muslim, Jewish and Christian symbols around the character."},"qa");
  await assert.rejects(()=>updateLiveProduction(id,{action:"review",target:storyboardTarget,decision:"approved",storyboardConfirmed:true},"qa"),/Resolve or withdraw/);
  await updateLiveProduction(id,{action:"storyboard-apply",target:storyboardTarget,scene:1},"qa");
  view=await liveView(id);storyboardTarget=view.storyboard!.target;
  assert.notEqual(storyboardTarget,originalStoryboardTarget);assert.equal(view.storyboard!.panels[0].comment?.status,"applied");
  assert.deepEqual(view.storyboard!.panels[0].graphicLayers?.map(layer=>layer.symbol),["crescent","star-of-david","cross"]);
  await assert.rejects(()=>updateLiveProduction(id,{action:"review",target:originalStoryboardTarget,decision:"approved",storyboardConfirmed:true},"qa"),/review changed|finishing preview changed/);
  await runLiveProduction(id,dependencies);view=await liveView(id);assert.equal(submissions,2+extra);assert.equal(view.review!.target,storyboardTarget);
  if(holdStoryboard){
   if(castMode)await updateLiveProduction(id,{action:"storyboard-comment",target:storyboardTarget,scene:1,text:"Show two soldiers side by side in the field"},"qa");
   const fixture={id,conversationId,scope,workspace,url:`http://127.0.0.1:3108/production/${id}`,note:"Disposable UI fixture; flat local images, injected providers, no real generations",networkCalls:network,paidCalls:0};
   await writeFile("storage/qa/storyboard-ui-fixture.json",JSON.stringify(fixture,null,2));
   retainedForUi=true;console.log(fixture);return;
  }
  const beforeRevision=submissions,previousImageQuote=view.quote!,beforeRevisionTarget=storyboardTarget;
  await updateLiveProduction(id,{action:"storyboard-comment",target:storyboardTarget,scene:1,text:castMode?"Show two soldiers side by side in the field":"Use a low camera angle."},"qa");
  await updateLiveProduction(id,{action:"storyboard-apply",target:storyboardTarget,scene:1},"qa");
  view=await liveView(id);assert.equal(view.storyboard!.panels[0].comment?.status,"needs-image-revision");assert.equal(submissions,beforeRevision);
  await updateLiveProduction(id,{action:"storyboard-revision-quote",target:storyboardTarget,scene:1},"qa",(plan,options)=>priceCamPlan(plan,{fal,higgsfield},Date.now(),options));
  view=await liveView(id);assert(view.renewing);assert.equal(view.quote!.caps.usd,previousImageQuote.caps.usd+(castMode?600000:300000));
  assert(view.quote!.lines.every(line=>line.kind==="image"&&(/^scene-1-(start|end)(-retry-\d+)?$/.test(line.id)||castMode&&line.id.startsWith("cast-"))));
  await runLiveProduction(id,dependencies);assert.equal(submissions,beforeRevision,"A scene revision quote must never submit its images");
  await updateLiveProduction(id,{action:"approve",quote:view.quote!.id},"qa");
  await runLiveProduction(id,dependencies);view=await liveView(id);assert(!view.error,view.error??"");
  if(castMode){
   assert.equal(view.status,"pending");assert.equal(submissions,beforeRevision+1);
   await runLiveProduction(id,dependencies);view=await liveView(id);assert(!view.error,view.error??"");
  }
  extra+=castMode?4:2;assert.equal(submissions,2+extra,"Only the scene's approved start/end replacement images may be submitted");
  assert.equal(view.storyboard!.panels[0].comment?.status,"applied");
  if(castMode){
   assert.equal(view.storyboard!.panels[0].characterSheets?.length,2);
   const castPayloads=imagePayloads.slice(-4);assert.equal(castPayloads[0].aspect_ratio,"16:9");assert.equal(castPayloads[1].aspect_ratio,"16:9");
   assert.equal((castPayloads[2].image_urls as string[]).length,3);
   assert.deepEqual((castPayloads[2].image_urls as string[]).slice(1),[...castImages.values()].map(bytes=>`https://v3.fal.media/${sha256(bytes)}`));assert.equal((castPayloads[3].image_urls as string[]).length,4);
   assert.match(String(castPayloads[2].prompt),/two soldiers/);assert(!String(castPayloads[2].prompt).includes("Depict only the exact originally locked cast"));
  }
  storyboardTarget=view.storyboard!.target;assert.notEqual(storyboardTarget,beforeRevisionTarget);
  assert.equal(view.review?.stage,"storyboard");assert.equal(view.review.target,storyboardTarget);
  assert.deepEqual(view.storyboard!.panels[0].graphicLayers?.map(layer=>layer.symbol),["crescent","star-of-david","cross"]);
  await assert.rejects(()=>updateLiveProduction(id,{action:"review",target:"f".repeat(64),decision:"approved"},"qa"),/review changed|finishing preview changed/);
  await assert.rejects(()=>updateLiveProduction(id,{action:"review",target:storyboardTarget,decision:"approved"},"qa"),/Confirm that you reviewed/);
  await runLiveProduction(id,dependencies);assert.equal(submissions,2+extra);
  const approved=await updateLiveProduction(id,{action:"review",target:storyboardTarget,decision:"approved",storyboardConfirmed:true},"qa");assert.equal(approved.advance,false);
  view=await liveView(id);assert(view.needsProductionBudget);
  await runLiveProduction(id,dependencies);assert.equal(submissions,2+extra,"Storyboard approval alone cannot pay for voice or animation");
  await updateLiveProduction(id,{action:"quote"},"qa",(plan,options)=>priceCamPlan(plan,{fal,higgsfield},Date.now(),options));
  view=await liveView(id);assert(view.renewing);assert.equal(view.quote!.scope,"production");assert.equal(view.quote!.selection?.scenes[0].selected,selectedModel);
  const productionQuote=view.quote!;
  if(klingMode){
   assert.equal(productionQuote.lines.find(l=>l.id==="scene-1-draft")?.maximum,420000);
   assert.equal(productionQuote.lines.find(l=>l.id==="scene-1-clip")?.maximum,700000);
  }
  await runLiveProduction(id,dependencies);assert.equal(submissions,2+extra);
  await updateLiveProduction(id,{action:"approve",quote:productionQuote.id},"qa");
  await runLiveProduction(id,dependencies);view=await liveView(id);assert.equal(submissions,3+extra);assert.match(view.error!,/lost poll/);
  Date.now=()=>realNow()+7200_000;
  await runLiveProduction(id,dependencies);view=await liveView(id);assert.match(view.error!,/quote expired/);
  renewalPrices=true;
  await updateLiveProduction(id,{action:"quote"},"qa",(plan,options)=>priceCamPlan(plan,{fal,higgsfield},Date.now(),options));
  view=await liveView(id);assert(view.renewing);assert.equal(view.quote!.selection?.scenes[0].selected,selectedModel);assert.notEqual(view.quote!.id,productionQuote.id);
  await assert.rejects(()=>updateLiveProduction(id,{action:"approve",quote:productionQuote.id},"qa"),/quote changed/);
  await runLiveProduction(id,dependencies);assert.equal(submissions,3+extra);
  await updateLiveProduction(id,{action:"approve",quote:view.quote!.id},"qa");
  await runLiveProduction(id,dependencies);view=await liveView(id);assert(!view.error,view.error??"");
  let reviews=1;const renewed=true;
  while(!view.finished){
   assert(view.review,JSON.stringify(view));assert(!["voice","direction","start","end","storyboard"].includes(view.review.stage),"The validated storyboard and technical preparation must not need another approval");
   assert.equal(view.storyboard?.target,storyboardTarget);
   await assert.rejects(()=>updateLiveProduction(id,{action:"review",target:"f".repeat(64),decision:"approved"},"qa"),/review changed|finishing preview changed/);
   if(view.review.stage==="draft-film"){
    assert.equal(view.review.scene,null);assert(view.review.media?.includes("/draft-montage/draft.mp4"));
    assert.equal(submissions,5+extra);assert(!requests.has("offline-final"));
    if(klingMode){assert.equal(klingPayloads.length,1);assert.equal(klingPayloads[0].model,KLING_STANDARD);}
    await runLiveProduction(id,dependencies);assert.equal(submissions,5+extra);
   }
   if(view.review.stage==="finishing-film"){
    const [pending]=await db.select().from(schema.jobs).where(eq(schema.jobs.id,id));assert.equal(pending.outputPath,null);
    assert.equal(view.finished,false);
    const before:number=submissions;await runLiveProduction(id,dependencies);assert.equal(submissions,before);
   }
   await updateLiveProduction(id,{action:"review",target:view.review.target,decision:"approved"},"qa");reviews++;
   await runLiveProduction(id,dependencies);view=await liveView(id);assert(!view.error,view.error??"");assert(reviews<=3,"Only visual and finishing reviews may require approval after the storyboard");
  }
  assert.equal(submissions,6+extra);assert.equal(view.costsPending,castMode?8:6);assert.equal(network,0);
  if(klingMode){
   assert.equal(klingPayloads.length,2);assert.equal(klingPayloads[1].model,KLING_PRO);
   assert.deepEqual(klingPayloads[1].payload,klingPayloads[0].payload);
  }
  const [job]=await db.select().from(schema.jobs).where(eq(schema.jobs.id,id));assert.equal(job.status,"succeeded");assert(job.outputPath);assert.equal(job.billedUsd,null);
  const output=await readFile(job.outputPath);assert(output.length>1000);
  const finishing=JSON.parse(await readFile(path.join("storage/concepts",id,"live/finishing.json"),"utf8"));
  assert(finishing.approvedAt);
  const montage=await readFile(path.join(path.dirname(finishing.file),"index.html"),"utf8");
  assert(montage.includes("star-of-david")&&montage.includes("crescent")&&montage.includes("cross"));
  assert(montage.includes('tl.fromTo("#graphic-0-0"'),"Reviewed graphics must animate in the final montage");
  await queueExports(id);await runExports(id);
  const [exported]=await db.select().from(schema.jobs).where(eq(schema.jobs.id,id));
  const downloads=await exportView(exported);assert.equal(downloads.state?.status,"complete");assert.equal(downloads.state.files.length,3);
  await runLiveProduction(id,dependencies);assert.equal(submissions,6+extra);
  assert(uploadedHashes.has(expectedSheet.sha256),"The exact approved sheet must reach the upload adapter");
  const proof={automaticCharacterSheets:castMode,castSheetsUsedByScene:castMode,startClickAuthorizesPreparation:true,replayedStartReusesApproval:true,storyboardBeforeVoice:true,twoBudgetStages:true,localStoryboardFeedbackPreservesImages:true,sceneFeedbackReopensReview:true,quotedImageRevisionRequiresApproval:true,approvedImageRevisionReopensStoryboard:true,reviewedGraphicsReachAnimatedMontage:true,animationRoute:klingMode?"720p draft then separate native 1080p generation":"480p draft then 1080p completion",uncertainRecoveryBudgetTested:uncertainMode,unsentImageRecoveredWithoutDuplicateReservation:true,approvedCharacterSheetUploaded:true,status:"passed",draftHumanGate:draftMode,completeFilmReview:true,separateFinishingReview:true,downloadRequiresFinalApproval:true,noPerSceneFinishingReview:true,providerResponses:"injected fixtures only",voice:"local Daniel test voice, not Bram",networkCalls:network,paidCalls:0,creditsSpent:0,draftEditsInvalidateQuote:true,approvedScenesCannotMutate:true,threeFormats:true,staleQuoteRejected:true,staleReviewRejected:true,reconnectReusesVoice:true,expiredQuoteRenewedWithoutDuplicates:renewed,connectionErrorSaved:true,fullControllerRenders:true,quotedModelDispatched:true,cheaperRenewalDoesNotSwitchModel:true,explicitStoryboardConfirmationRequired:true,pendingCostsNotInvented:true,clientNotDebited:true,submissionsSimulated:submissions,reviews};
  await writeFile(klingMode?"storage/qa/cam-kling-controller-proof.json":draftMode?"storage/qa/cam-draft-controller-proof.json":"storage/qa/cam-connected-controller-proof.json",JSON.stringify(proof,null,2));console.log(proof);
 }finally{
  Date.now=realNow;
  if(!retainedForUi){
  await db.delete(schema.apiCalls).where(eq(schema.apiCalls.jobId,id));await db.delete(schema.jobs).where(eq(schema.jobs.id,id));await db.delete(schema.conversations).where(eq(schema.conversations.id,conversationId));
  await pool.query("DELETE FROM settings WHERE key=$1",[`cam-budget:live:${scope}`]);
  for(const dir of [workspace,path.join("storage/concepts",id),path.join("storage/imports",id),path.join("storage/exports",id)])await rm(dir,{recursive:true,force:true});
  await rm(path.join("storage/outputs",`${id}.mp4`),{force:true});
  }
  await pool.end();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
