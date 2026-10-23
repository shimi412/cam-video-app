/** Clay single journey (Shimi, 2026-10-23): one estimate, one approval, unattended production, whole-version
 * feedback priced as a revision, until a version is approved. Offline: injected director, no provider, no paid call. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile, access } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import type { ProductionParams } from "../src/lib/brain";
import type { CharacterReference } from "../src/lib/concept/character-sheet-policy";

const mocks=vi.hoisted(()=>({job:null as unknown as {id:string;script:string;params:ProductionParams;outputPath?:string|null;status?:string},reserve:vi.fn(),settle:vi.fn(),customerQuote:vi.fn(),providers:vi.fn(),references:[] as (CharacterReference & {filePath:string})[]}));
vi.mock("@/db",()=>({schema:{jobs:{id:"id"}}}));
vi.mock("../src/lib/concept/assets",()=>({lockedAssets:async()=>mocks.references}));
vi.mock("../src/lib/customer-wallet",()=>({reserveCredits:mocks.reserve,settleCredits:mocks.settle,customerQuote:mocks.customerQuote,customerPricing:async()=>({mode:"tiers-v2",multiplier:2,higgsfieldCreditUsd:.1}),creditHold:async()=>({quoteId:"h".repeat(64),amountCents:3000,state:"reserved"})}));
vi.mock("../src/lib/providers/live-policy",()=>({assertCamConfigured:()=>{},withCamExecution:async(_id:string,fn:()=>unknown)=>fn()}));
vi.mock("../src/lib/providers/cam",()=>({connectCamProviders:mocks.providers}));
vi.mock("../src/lib/job-lock",()=>({acquireJobLock:async()=>({assertOwned:async()=>{},release:async()=>{},db:{select:()=>({from:()=>({where:async()=>[mocks.job]})}),update:()=>({set:(values:Record<string,unknown>)=>({where:async()=>Object.assign(mocks.job,values)})})}})}));
vi.mock("../src/lib/agent/observations",()=>({observeVideo:async()=>{}}));
import { updateLiveProduction, liveView, automaticReplacement } from "../src/lib/concept/live-production";
import { deliveryReviewDependencies } from "../src/lib/agent/delivery-review";
import { sha256 } from "../src/lib/concept/checkpoints";
import { planConcept } from "../src/lib/concept/storyboard";
import { getRecipe } from "../src/lib/recipes";
import { resolveParams } from "../src/lib/brain";
import { placeholderTiming } from "../src/lib/concept/timing";
import { generationPlan, IMAGE_ENDPOINT } from "../src/lib/concept/generation-plan";
import { flowReviewTarget, advanceProductionFlow, type FlowInput, type FlowDecision } from "../src/lib/concept/production-flow";
import { storyboardReviewContent } from "../src/lib/concept/storyboard-review";
import { CamQuoteSchema, type CamQuote } from "../src/lib/providers/cam-pricing";
import { HF_SEEDANCE, KLING_PRO, KLING_STANDARD } from "../src/lib/concept/model-selection";
import { finishingTarget, FinishingSettings } from "../src/lib/concept/finishing-review";
import { estimatedMinutes, supplierCostUsd, firstVersionAmountCents, revisionAmountCents, withinApprovedPrice } from "../src/lib/concept/single-journey";
import type { FeedbackDirector } from "../src/lib/concept/feedback-director";
import { createBudget, quoteHash, type BudgetBook, type BudgetQuote } from "../src/lib/concept/budget";

describe("single-journey estimates",()=>{
 it("estimates about 45 minutes for an 8-scene film, never under 15",()=>{expect(estimatedMinutes(8)).toBe(45);expect(estimatedMinutes(1)).toBe(15);expect(estimatedMinutes(13)).toBe(70);expect(()=>estimatedMinutes(-1)).toThrow();});
 it("prices a first version by tiers on media plus allowances and a revision on its additional cost only",()=>{
  const v1={caps:{usd:6_950_000,"higgsfield-credit":135_700_000}};
  expect(supplierCostUsd(v1,.04)).toBeCloseTo(12.378,3);
  expect(firstVersionAmountCents(v1,.04,2.5)).toBe(3000);
  expect(firstVersionAmountCents({caps:{usd:19_000_000,"higgsfield-credit":0}},.04,2.5)).toBe(4000);
  const next={caps:{usd:8_050_000,"higgsfield-credit":135_700_000}};
  const revision=revisionAmountCents(v1,next,.04,.5,3000);
  expect(revision).toMatchObject({additionalCents:400,amountCents:3400});expect(revision.additionalSupplierUsd).toBeCloseTo(1.6,6);
  expect(revisionAmountCents(v1,v1,.04,.5,3000)).toMatchObject({additionalCents:100,amountCents:3100});
  expect(withinApprovedPrice(next,.04,3000)).toBe(true);expect(withinApprovedPrice({caps:{usd:31_000_000,"higgsfield-credit":0}},.04,3000)).toBe(false);
 });
});

let id:string,dir:string,target:string,quote:CamQuote;
const script="Check the original source before sharing. Read the full passage before deciding.";
const json=async(file:string)=>JSON.parse(await readFile(path.join(dir,file),"utf8"));
const save=async(file:string,value:unknown)=>{await mkdir(path.dirname(path.join(dir,file)),{recursive:true});await writeFile(path.join(dir,file),JSON.stringify(value));};
const selection={version:1,minimumResolution:"1080p",workflow:"whimsical",method:"capabilities-and-live-prices",scenes:[],notes:[]};
function fullPrice(plan:ReturnType<typeof generationPlan>){
 const lines=[...plan.operations.filter(op=>op.kind==="image").map(op=>({id:op.id,model:IMAGE_ENDPOINT,kind:"image" as const,unit:"usd" as const,quantity:1,unitPrice:.15,maximum:150000,description:"One image"})),
  ...plan.operations.filter(op=>op.kind==="video").map(op=>({id:op.id,model:KLING_PRO,kind:"video" as const,unit:"usd" as const,quantity:5,unitPrice:.2,maximum:1000000,seconds:5,billing:"seconds" as const,description:"Clip"})),
  {id:"voice",model:"text2speech_v2",kind:"voice" as const,unit:"higgsfield-credit" as const,quantity:1,unitPrice:3,maximum:3000000,description:"Voice"},{id:"alignment",model:"whisper",kind:"alignment" as const,unit:"usd" as const,quantity:1,unitPrice:1,maximum:1000000,description:"Alignment"}];
 const caps={usd:lines.filter(l=>l.unit==="usd").reduce((s,l)=>s+l.maximum,0),"higgsfield-credit":3000000};
 const content={plan:plan.fingerprint,scope:"production" as const,createdAt:Date.now(),expiresAt:Date.now()+3600000,lines,caps,falBillingAvailable:false,selection};
 return CamQuoteSchema.parse({...content,id:sha256(JSON.stringify(content))});
}
const director:FeedbackDirector=async input=>({decisions:input.notes.map(note=>{
 if(note.text==="Lower the music")return {id:note.id,stage:"finishing" as const,status:"planned" as const,message:"The music will be quieter under the narration.",changes:[],finishing:FinishingSettings.parse({...input.settings,musicLevel:"quiet"})};
 if(note.text==="Make scene 1 brighter")return {id:note.id,stage:"visual" as const,status:"planned" as const,message:"Scene 1 gets brighter lighting; the other scenes are kept.",changes:[{scene:1,edit:null,imageInstruction:"Brighter, warmer lighting on the same composition",characters:[]}],finishing:null};
 if(note.text==="Keep the music as it is")return {id:note.id,stage:"finishing" as const,status:"planned" as const,message:"The music stays as it is.",changes:[],finishing:FinishingSettings.parse({...input.settings})};
 return {id:note.id,stage:"visual" as const,status:"clarify" as const,message:"Name the scene or the moment you want changed.",changes:[],finishing:null};
})});
async function finishedVersion(){
 const settings=FinishingSettings.parse({}),fileDir=path.join(dir,"finishing","a".repeat(64));await mkdir(fileDir,{recursive:true});
 const file=path.join(fileDir,"preview.mp4");await writeFile(file,"the complete finished version");const hash=sha256(await readFile(file));
 await writeFile(path.join(fileDir,"editorial-timeline.json"),JSON.stringify({fps:30,scenes:[{scene:1,startFrame:0,endFrame:120},{scene:2,startFrame:120,endFrame:240}]}));
 target=finishingTarget("p".repeat(64),hash,settings);
 await save("finishing.json",{version:1,packet:{fingerprint:"p".repeat(64)},settings,pending:null,file,sha256:hash,duration:8,target,appliedComments:[],pendingComments:[]});
 await save("state.json",{status:"ready-to-render",phase:"montage",events:[],paidGenerationAuthorized:true});
 return {file,hash};
}
beforeEach(async()=>{
 vi.clearAllMocks();id=randomUUID();dir=path.join(process.cwd(),"storage/concepts",id,"live");
 vi.stubGlobal("fetch",vi.fn(()=>{throw new Error("Unexpected network request in offline single-journey test");}));
 mocks.references=[{id:"narrator",filePath:"/fixture/narrator.png",url:"/sheet.png",sha256:"a".repeat(64),characterSheet:{status:"approved",sha256:"a".repeat(64),approvedAt:"2026-10-15"}}];
 const params={...resolveParams(script,"auto",{templateSlug:"cam-clay"}).params,live:true,executionMode:"fal",productionMethod:"whimsical-v1" as const,journey:"single-v1"};
 mocks.job={id,script,params};
 const board=planConcept(script,getRecipe("cam-clay")!,params.aspectRatio),timing=placeholderTiming(board.shots.map(s=>s.narration));
 quote=fullPrice(generationPlan(script,params,board,timing,mocks.references));
 const panels=board.shots.map(s=>({scene:s.index,narration:s.narration,meaning:s.metaphor??"Explain the sentence",startScene:s.scene,endScene:s.endScene,motion:s.motion,actionSeconds:s.actionSeconds??s.clipSeconds,visualMode:s.visualMode,overlay:s.overlay,start:{id:randomUUID(),kind:"image" as const,sha256:String(s.index).repeat(64),width:1080,height:1920}}));
 await save("storyboard-review.json",{version:1,target:flowReviewTarget("live",id,"storyboard",storyboardReviewContent(panels,params.aspectRatio)),panels,retrospective:false});
 await save("production.json",{version:1,journey:"single-v1",filmVersion:1,storyboardFirst:true,inputHash:sha256(JSON.stringify({script,format:params.aspectRatio,directions:params.sceneDirections??{},narrations:params.sceneNarrations,references:mocks.references.map(({id,sha256})=>({id,sha256}))})),quote,pendingQuote:null,approval:null,history:[],decisions:[],phases:{},error:null,finished:false});
 mocks.customerQuote.mockImplementation(async(_job:string,q:CamQuote,basis?:{amountCents?:number})=>({id:sha256(`customer:${q.id}`),amountCents:basis?.amountCents??3000,expiresAt:q.expiresAt}));
});
afterEach(async()=>{expect(mocks.providers).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await rm(path.dirname(dir),{recursive:true,force:true});await rm(path.join(process.cwd(),"storage/outputs",`${id}.mp4`),{force:true});});

describe("single-journey controller",()=>{
 it("approves the complete version in one action: production scope, wallet reservation, worker launched, no storyboard or budget gate",async()=>{
  const price=vi.fn(async()=>quote);
  const view=await liveView(id);expect(view.journey).toBe("single-v1");expect(view.approved).toBe(false);expect(view.needsProductionBudget).toBe(false);
  await expect(updateLiveProduction(id,{action:"approve",quote:"x".repeat(64),customerQuote:"c".repeat(64)},"client",price)).rejects.toThrow(/quote changed/);
  expect(await updateLiveProduction(id,{action:"approve",quote:quote.id,customerQuote:"c".repeat(64)},"client",price)).toEqual({advance:true});
  expect(mocks.reserve).toHaveBeenCalledExactlyOnceWith(id,"c".repeat(64),quote.id);
  const state=await json("production.json");expect(state.approval.quote).toBe(quote.id);expect(state.decisions).toHaveLength(1);expect(state.background.enabled).toBe(true);
  expect(mocks.job.status).toBe("running");expect(price).not.toHaveBeenCalled();
 });
 it("quotes a finishing-only revision as the allowance x2, archives the version on approval and renders the next one locally",async()=>{
  const state=await json("production.json");state.approval={quote:quote.id,actor:"client",at:Date.now()};await save("production.json",state);
  await finishedVersion();
  const price=vi.fn(async()=>quote),noteId=randomUUID();
  expect((await liveView(id)).review).toMatchObject({stage:"finishing-film",target});
  await updateLiveProduction(id,{action:"film-comment",target,id:noteId,text:"Lower the music",seconds:null},"client",price,director);
  expect((await liveView(id)).filmComments.map(c=>c.stage)).toEqual(["unreviewed"]);
  expect(await updateLiveProduction(id,{action:"film-apply-all",target,ids:[noteId]},"client",price,director)).toEqual({advance:false});
  const quoted=await json("production.json");
  expect(quoted.filmCorrection).toMatchObject({status:"quoted",scenes:[],version:2,finishing:{musicLevel:"quiet"},summary:"The music will be quieter under the narration."});
  expect(quoted.pendingQuote.lines).toEqual(quote.lines);expect(quoted.pendingQuote.id).not.toBe(quote.id);expect(price).not.toHaveBeenCalled();expect(mocks.reserve).not.toHaveBeenCalled();
  expect((await liveView(id)).filmComments[0].interpretation).toBe("The music will be quieter under the narration.");
  await expect(updateLiveProduction(id,{action:"review",target,decision:"approved"},"client",price,director)).rejects.toThrow(/remaining finishing feedback/);
  expect(await updateLiveProduction(id,{action:"approve",quote:quoted.pendingQuote.id,customerQuote:"r".repeat(64)},"client",price,director)).toEqual({advance:true});
  expect(mocks.reserve).toHaveBeenCalledExactlyOnceWith(id,"r".repeat(64),quoted.pendingQuote.id);
  const approved=await json("production.json");expect(approved.filmVersion).toBe(2);expect(approved.filmCorrection.status).toBe("working");expect(approved.quote.id).toBe(quoted.pendingQuote.id);
  const finishing=await json("finishing.json");expect(finishing.pending).toMatchObject({musicLevel:"quiet"});expect(finishing.pendingComments).toEqual([noteId]);
  await access(path.join(dir,"film-history",target,"finishing.json"));
  expect((await json("state.json")).status).toBe("ready-to-render");
 });
 it("quotes a visual revision on its additional media only and reruns the unattended chain after approval",async()=>{
  const state=await json("production.json");state.approval={quote:quote.id,actor:"client",at:Date.now()};await save("production.json",state);
  await finishedVersion();
  const price=vi.fn(async(plan:ReturnType<typeof generationPlan>)=>fullPrice(plan)),noteId=randomUUID();
  await updateLiveProduction(id,{action:"film-comment",target,id:noteId,text:"Make scene 1 brighter",seconds:2},"client",price,director);
  await updateLiveProduction(id,{action:"film-apply-all",target,ids:[noteId]},"client",price,director);
  const quoted=await json("production.json");
  expect(quoted.filmCorrection).toMatchObject({status:"quoted",scenes:[1],version:2});expect(Object.keys(quoted.filmCorrection.revisions)).toEqual(["1"]);
  expect(quoted.pendingRetries).toEqual({"scene-1-start":1,"scene-1-clip":1});
  expect(quoted.pendingQuote.lines.map((l:{id:string})=>l.id)).toEqual(expect.arrayContaining(["scene-1-start-retry-1","scene-1-clip-retry-1"]));
  expect(quoted.pendingQuote.caps.usd-quote.caps.usd).toBe(1150000);
  expect(price).toHaveBeenCalledOnce();
  await updateLiveProduction(id,{action:"approve",quote:quoted.pendingQuote.id,customerQuote:"r".repeat(64)},"client",price,director);
  await expect(access(path.join(dir,"finishing.json"))).rejects.toThrow();
  await access(path.join(dir,"film-history",target,"finishing.json"));
  const approved=await json("production.json");expect(approved.filmVersion).toBe(2);expect(approved.retries).toEqual({"scene-1-start":1,"scene-1-clip":1});expect(approved.finishingSettings).toMatchObject({musicLevel:"normal"});
  expect((await json("state.json"))).toMatchObject({status:"pending",phase:"film-correction"});
  expect((await json("storyboard-feedback.json")).imageRevisions[1].note).toContain("Brighter");
  const view=await liveView(id);expect(view.review).toBeNull();expect(view.phase).toBe("film-correction");
 });
 it("charges nothing for a note with no executable request or no change, and keeps the notes",async()=>{
  const state=await json("production.json");state.approval={quote:quote.id,actor:"client",at:Date.now()};await save("production.json",state);
  await finishedVersion();
  const price=vi.fn(async()=>quote),vague=randomUUID(),same=randomUUID();
  await updateLiveProduction(id,{action:"film-comment",target,id:vague,text:"Do something",seconds:null},"client",price,director);
  await expect(updateLiveProduction(id,{action:"film-apply-all",target,ids:[vague]},"client",price,director)).rejects.toThrow(/Name the scene or the moment/);
  await updateLiveProduction(id,{action:"film-comment-remove",target,id:vague},"client",price,director);
  await updateLiveProduction(id,{action:"film-comment",target,id:same,text:"Keep the music as it is",seconds:null},"client",price,director);
  await expect(updateLiveProduction(id,{action:"film-apply-all",target,ids:[same]},"client",price,director)).rejects.toThrow(/do not change this version/);
  expect((await json("production.json")).pendingQuote).toBeNull();expect((await liveView(id)).filmComments).toHaveLength(1);expect(mocks.reserve).not.toHaveBeenCalled();
 });
 it("releases the approved version: settlement, download file, no finishing gate",async()=>{
  const state=await json("production.json");state.approval={quote:quote.id,actor:"client",at:Date.now()};await save("production.json",state);
  const {hash}=await finishedVersion();
  deliveryReviewDependencies.review=async input=>({mediaHash:input.mediaHash,ready:true,reason:"Offline injected delivery decision.",corrections:[]});
  expect(await updateLiveProduction(id,{action:"review",target,decision:"approved"},"client",vi.fn())).toEqual({advance:false});
  expect(mocks.settle).toHaveBeenCalledExactlyOnceWith(id,true);
  expect(mocks.job.status).toBe("succeeded");expect(sha256(await readFile(mocks.job.outputPath!))).toBe(hash);
  expect((await json("production.json")).finished).toBe(true);
 });
 it("replaces a definitively failed draft automatically inside the approved price, keeping receipts and the client's price",async()=>{
  const line=(opId:string,model:string,amount:number):CamQuote["lines"][number]=>({id:opId,model,kind:"video",unit:"usd",quantity:4,unitPrice:amount/4e6,maximum:amount,seconds:4,billing:"seconds",description:opId});
  const previous:CamQuote={id:"a".repeat(64),plan:"b".repeat(64),scope:"production",createdAt:1,expiresAt:Date.now()+3600000,lines:[line("scene-1-clip",KLING_PRO,2e6),line("scene-2-draft",HF_SEEDANCE,3e6),line("scene-2-draft-retry-1",HF_SEEDANCE,3e6),line("scene-2-clip",HF_SEEDANCE,4e6)],caps:{usd:12e6,"higgsfield-credit":0},falBillingAvailable:false,selection:{version:1,minimumResolution:"1080p",workflow:"whimsical",method:"capabilities-and-live-prices",scenes:[1,2].map(scene=>({scene,operation:`scene-${scene}-clip`,selected:scene===2?HF_SEEDANCE:KLING_PRO,reason:"old",localText:false,candidates:[]})),notes:[]}};
  const current:CamQuote={...previous,createdAt:3,expiresAt:Date.now()+3600000,lines:[line("scene-1-clip",KLING_PRO,2e6),line("scene-2-clip",KLING_PRO,2e6)],selection:{...previous.selection!,scenes:previous.selection!.scenes.map(s=>({...s,selected:KLING_PRO}))}};
  const failed={mode:"live",fingerprint:"c".repeat(64),state:"failed",requestId:"failed-id",failureReason:"failed",binding:{jobId:id,operation:"scene-2-draft-retry-1",model:HF_SEEDANCE,transport:"higgsfield-mcp",payloadSha256:"d".repeat(64)}};
  await save(`requests/${failed.fingerprint}.json`,failed);
  // The first attempt also keeps its receipt and its cost; it is superseded, never refunded.
  await save(`requests/${"e".repeat(64)}.json`,{...failed,fingerprint:"e".repeat(64),requestId:"first-id",binding:{...failed.binding,operation:"scene-2-draft"}});
  const state={...await json("production.json"),quote:previous,approval:{quote:previous.id,actor:"client",at:Date.now()},retries:{"scene-2-draft":1}};
  const quoteRead=vi.fn(async()=>current);
  const references=mocks.references as unknown as Parameters<typeof automaticReplacement>[2]["references"];
  const result=await automaticReplacement(id,state,{script,params:mocks.job.params,recipe:getRecipe("cam-clay")!,references,quote:quoteRead,pricing:{higgsfieldCreditUsd:.1},hold:{amountCents:3000}});
  expect(result).toEqual({ok:true});
  expect(state.quote.lines.find((l:{id:string})=>l.id==="scene-2-clip")?.model).toBe(KLING_PRO);
  expect(state.quote.lines.filter((l:{id:string})=>l.id.startsWith("scene-2-draft"))).toHaveLength(2);
  expect(state.retries).toEqual({"scene-2-draft":2});expect(state.approval.actor).toBe("automatic-replacement");expect(state.automaticReplacements).toEqual({"scene-2-draft":1});
  expect(mocks.customerQuote).toHaveBeenCalledWith(id,state.quote,{amountCents:3000});expect(mocks.reserve).toHaveBeenCalledOnce();
  // Beyond the price or the per-scene bound, nothing is replaced and the reason is kept for the admin.
  const again=await automaticReplacement(id,{...state,quote:previous,retries:{"scene-2-draft":1},automaticReplacements:{"scene-2-draft":2}},{script,params:mocks.job.params,recipe:getRecipe("cam-clay")!,references,quote:quoteRead,pricing:{higgsfieldCreditUsd:.1},hold:{amountCents:3000}});
  expect(again).toMatchObject({ok:false,reason:expect.stringContaining("already replaced")});
  const costly=await automaticReplacement(id,{...state,quote:previous,retries:{"scene-2-draft":1},automaticReplacements:{}},{script,params:mocks.job.params,recipe:getRecipe("cam-clay")!,references,quote:quoteRead,pricing:{higgsfieldCreditUsd:.1},hold:{amountCents:500}});
  expect(costly).toMatchObject({ok:false,reason:expect.stringContaining("exceed the approved price")});
  expect(KLING_STANDARD).toBeTruthy();
 });
});

describe("unattended production flow",()=>{
 let directory:string;
 beforeEach(async()=>{vi.stubEnv("PROVIDER_MODE","dryrun");directory=await import("node:fs/promises").then(fs=>fs.mkdtemp(path.join(os.tmpdir(),"cam-single-")));});
 afterEach(async()=>{vi.unstubAllEnvs();await rm(directory,{recursive:true,force:true});});
 it("approves the storyboard itself and moves on to the narration without any human decision",async()=>{
  const flowScript="Offline unattended test.",{params}=resolveParams(flowScript,"auto",{templateSlug:"cam-clay"});
  const image=await sharp({create:{width:48,height:48,channels:3,background:"#245765"}}).png().toBuffer();
  const filePath=path.join(directory,"reference.png");await writeFile(filePath,image);const hash=sha256(image);
  const jobId=randomUUID();
  let book:BudgetBook|null=null;
  const budget=createBudget({mode:"simulation",transaction:async update=>{const next=update(book);book=next.book;return next.result;}},{usd:1_000_000,"higgsfield-credit":0});
  const reservations=new Map<string,NonNullable<Awaited<ReturnType<FlowInput["services"]["authorize"]>>>>();
  const submitted:string[]=[];const reviews:string[]=[];
  const input:FlowInput={directory,jobId,script:flowScript,params:{...params,productionMethod:"whimsical-v1"},recipe:getRecipe(params.templateSlug)!,
   references:[{id:"narrator",url:"/narrator.png",sha256:hash,filePath,characterSheet:{status:"approved",sha256:hash,approvedAt:"2026-10-15"}}],assertOwned:async()=>{},
   services:{mode:"simulation",storyboardBeforeVoice:true,reviewPolicy:"unattended",videoWorkflow:"whimsical",videoModels:{"scene-1-clip":KLING_PRO},
    review:async request=>{reviews.push(request.stage);return request.stage==="script"?{id:randomUUID(),target:request.target,mode:"simulation",decision:"approved"} as FlowDecision:null;},
    authorize:async plan=>{const op=plan.operations[0];if(op.kind!=="image")return null;if(!reservations.has(plan.fingerprint)){const q:BudgetQuote={plan:plan.fingerprint,source:"simulation-fixture",expiresAt:Date.now()+86400000,lines:[{operation:op.fingerprint,unit:"usd",maximum:1000}]};reservations.set(plan.fingerprint,{budget,quote:q,approval:{id:randomUUID(),mode:"simulation",plan:plan.fingerprint,quote:quoteHash(q),expiresAt:q.expiresAt,caps:{usd:1000,"higgsfield-credit":0}}});}return reservations.get(plan.fingerprint)!;},
    queue:op=>({mode:"simulation",submit:async()=>{submitted.push(op.id);return {requestId:op.fingerprint};},poll:async()=>({state:"complete",output:"https://simulation.invalid/image.png"})}),
    cost:async()=>({unit:"usd",actual:1000,evidence:"fixture"}),
    assets:{mode:"simulation",upload:async bytes=>({url:`https://simulation.invalid/${sha256(bytes)}`,expiresAt:Date.now()+86400000}),download:async()=>new Response(new Uint8Array(image))}}};
  try{
   const outcome=await advanceProductionFlow(input);
   expect(outcome).toMatchObject({status:"awaiting-budget",phase:"voice"});
   expect(submitted).toEqual(["scene-1-start"]);
   expect(outcome.events.map(e=>e.stage)).toContain("prepare-storyboard");
   expect(reviews).toContain("storyboard");
   expect((await json2(path.join(directory,"storyboard-review.json"))).panels).toHaveLength(1);
  }finally{await rm(path.join(process.cwd(),"storage/imports",jobId),{recursive:true,force:true});}
 });
});
const json2=async(file:string)=>JSON.parse(await readFile(file,"utf8"));
