/** Multi-scene regression: real local montage, injected media only, no network. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveParams } from "../src/lib/brain";
import { getRecipe } from "../src/lib/recipes";
import { planConcept } from "../src/lib/concept/storyboard";
import { localNarration } from "../src/lib/concept/local-voice";
import { productionFixture } from "../src/lib/concept/production-rehearsal";
import { advanceProductionFlow } from "../src/lib/concept/production-flow";
import { HF_SEEDANCE,KLING_PRO } from "../src/lib/concept/model-selection";
import { requestReceipts } from "../src/lib/concept/request-journal";

process.env.PROVIDER_MODE="dryrun";process.env.BRAIN_MODE="mock";
const whimsical=process.env.CAM_TEST_WHIMSICAL==="1";
let network=0;
globalThis.fetch=async()=>{network++;throw new Error("Network forbidden in full-film preview check");};
const id=randomUUID(),directory=path.join(process.cwd(),"storage/qa",`film-preview-${id}`);
const assertOwned=async()=>{};
async function main(){
 try{
  const script="Check the original source before sharing a claim. Read the full passage to understand its context. Compare the evidence before reaching a conclusion.";
  const {params}=resolveParams(script,"auto",{aspectRatio:"16:9"});
  const recipe=getRecipe(params.templateSlug)!;
  const board=planConcept(script,recipe,params.aspectRatio);
  assert(board.shots.length>=3,"This regression must exercise multiple scenes");
  await mkdir(path.join(directory,"assets"),{recursive:true});
  const timing=await localNarration(directory,board.shots.map(s=>s.narration),"local-en");
  const fixture=await productionFixture({jobId:id,directory,script,params,recipe,timing,voiceFile:path.join(directory,"assets/narration.wav"),assertOwned});
  fixture.services.reviewPolicy="storyboard-first";
  fixture.services.videoWorkflow=whimsical?"whimsical":"draft-first";
  fixture.services.videoModels=Object.fromEntries(board.shots.map(s=>[`scene-${s.index}-clip`,s.index===2?HF_SEEDANCE:KLING_PRO]));
  const advance=()=>advanceProductionFlow(fixture.flow);
  let state=await advance();assert.equal(state.review?.stage,"script");await fixture.decide(state.review!);
  state=await advance();assert.equal(state.review?.stage,"storyboard");await fixture.decide(state.review!);
  // Emulate an existing production stopped after its first completed draft.
  const queue=fixture.services.queue;let interrupted=false;let failed=false;
  fixture.services.queue=(op,payload)=>{
   const q=op.model===HF_SEEDANCE?{mode:"simulation" as const,submit:async()=>{fixture.stats.submissions++;return {requestId:"offline-failed-seedance"};},poll:async()=>({state:"failed" as const,failureReason:"failed"})}:queue(op,payload);
   return {...q,poll:async requestId=>{
    if(op.id==="scene-2-draft"&&!interrupted){interrupted=true;return {state:"pending" as const};}
    if(op.id==="scene-2-draft"&&!failed){failed=true;return {state:"failed" as const,failureReason:"failed"};}
    return q.poll(requestId);
   }};
  };
  state=await advance();assert.equal(state.status,"pending");assert.equal(state.phase,"scene-2-draft");
  const afterPause=fixture.stats.submissions;
  state=await advance();assert.equal(state.status,"blocked-scenes");assert.deepEqual(state.sceneFailures,[2]);assert.equal(state.review,undefined);
  const afterOtherScenes=fixture.stats.submissions;
  assert.equal(afterOtherScenes,afterPause+board.shots.length-2,"Later independent drafts continue after scene 2 fails");
  const preserved=(await requestReceipts(path.join(directory,"requests"))).filter(r=>r.state==="complete");
  state=await advance();assert.equal(state.status,"blocked-scenes");assert.equal(state.review,undefined);
  assert.equal(fixture.stats.submissions,afterOtherScenes,"Failed request cannot silently submit again");
  // Fixture-only approved replacement allowance; live retries are enabled only
  // by approval of the additional quoted line in the controller.
  fixture.services.imageRetries={"scene-2-draft":1};
  fixture.services.videoModels["scene-2-clip"]=KLING_PRO;
  state=await advance();assert.equal(state.review?.stage,"draft-film");assert.equal(state.review?.scene,null);
  assert.equal(fixture.stats.submissions,afterOtherScenes+1,"Only the failed draft gets a new request");
  const receipts=await requestReceipts(path.join(directory,"requests"));
  for(const old of preserved)assert.deepEqual(receipts.find(r=>r.fingerprint===old.fingerprint),old,"Completed receipts are unchanged by recovery");
  if(!whimsical)assert.equal(receipts.filter(r=>/^scene-\d+-draft(-retry-\d+)?$/.test(r.binding?.operation??"")&&r.state==="complete").length,board.shots.length);
  if(!whimsical)assert(!receipts.some(r=>r.binding?.operation.endsWith("-clip")),"No high-quality request before complete-film approval");
  let preview=state.review!;
  assert(preview.film);assert(preview.film.duration>timing.duration,"Preview includes the CAM ending");
  assert((await readFile(preview.film.file)).length>1000);
  const montage=await readFile(path.join(directory,"draft-montage/index.html"),"utf8");
  for(const shot of board.shots)assert(montage.includes(shot.narration.split(" ")[0]));
  const beforeApproval=fixture.stats.submissions;
  state=await advance();assert.equal(state.review?.target,preview.target);assert.equal(fixture.stats.submissions,beforeApproval);
  if(whimsical){
   assert.equal(receipts.filter(r=>/^scene-\d+-clip$/.test(r.binding?.operation??"")&&r.state==="complete").length,board.shots.length);
   await fixture.decide(preview);state=await advance();assert.equal(state.status,"ready-to-render");
   assert.equal(fixture.stats.submissions,beforeApproval,"Native clips are reused after full-film approval");
   assert.equal(network,0);
   const proof={status:"passed",workflow:"whimsical",failedMiddleSceneReplaced:true,completedReceiptsUnchanged:true,wholeFilmRendered:true,nativeClipsNotGeneratedTwice:true,externalCalls:network,paidCalls:0};
   await writeFile('storage/qa/whimsical-replacement-film-proof.json',JSON.stringify(proof,null,2));console.log(proof);return;
  }
  await fixture.decide(preview,"rejected");state=await advance();assert.equal(state.status,"rejected");assert.equal(fixture.stats.submissions,beforeApproval);
  // A film correction renews only one image/draft. Other completed payloads
  // survive the new whole-storyboard approval without provider resubmission.
  fixture.services.completedInputs=Object.fromEntries(receipts.filter(r=>r.state==="complete"&&r.binding).map(r=>[r.binding!.operation,r.binding!.payloadSha256]));
  fixture.services.imageRevisions={"1":{note:"Use a low camera angle",attempt:1,animationContract:2}};
  fixture.services.imageRetries={...fixture.services.imageRetries,"scene-1-start":1,"scene-1-draft":1};
  state=await advance();assert.equal(state.review?.stage,"storyboard");
  assert.equal(fixture.stats.submissions,beforeApproval+1,"Only the revised image precedes storyboard approval");
  await fixture.decide(state.review!);
  state=await advance();assert.equal(state.review?.stage,"draft-film");
  assert.equal(fixture.stats.submissions,beforeApproval+2,"Only the selected draft is replaced");
  assert.notEqual(state.review!.target,preview.target);preview=state.review!;
  assert(state.events.some(e=>e.stage==="reuse-completed-scene-2-draft-retry-1"));
  const afterCorrection=fixture.stats.submissions;
  // Fixture-only replacement of the rejected decision, never a live controller action.
  await fixture.decide(preview);
  state=await advance();assert.equal(state.status,"ready-to-render");assert.equal(state.review,undefined);
  assert.equal(fixture.stats.submissions,afterCorrection+board.shots.length);
  assert.equal(Object.keys(state.render!.media).length,board.shots.length);
  await advance();assert.equal(fixture.stats.submissions,afterCorrection+board.shots.length);
  assert.equal(network,0);
  const proof={status:"passed",scenes:board.shots.length,allDraftsBeforeAnyFinal:true,resumeReusesDrafts:true,failedSceneDoesNotBlockLaterDrafts:true,completedReceiptsUnchanged:true,failedDraftReplacedOnlyAfterExplicitAllowance:true,failedSeedanceReplacedWithKling:true,filmCorrectionPreservesOtherScenes:true,filmCorrectionRequiresNewStoryboardApproval:true,oneCompleteFilmReview:true,rejectionBlocksFinals:true,completeMontage:true,noClipReviews:true,networkCalls:network,paidCalls:0};
  await writeFile("storage/qa/cam-full-film-preview-proof.json",JSON.stringify(proof,null,2));console.log(proof);
 }finally{await rm(directory,{recursive:true,force:true});await rm(path.join(process.cwd(),"storage/imports",id),{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
