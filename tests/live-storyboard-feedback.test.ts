import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProductionParams } from "../src/lib/brain";
import type { CharacterReference } from "../src/lib/concept/character-sheet-policy";

const mocks=vi.hoisted(()=>({job:null as unknown as {id:string;script:string;params:ProductionParams},reserve:vi.fn(),providers:vi.fn(),quote:vi.fn(),references:[] as (CharacterReference & {filePath:string})[]}));
vi.mock("@/db",()=>({schema:{jobs:{id:"id"}}}));
vi.mock("../src/lib/concept/assets",()=>({lockedAssets:async()=>mocks.references}));
vi.mock("../src/lib/customer-wallet",()=>({reserveCredits:mocks.reserve,settleCredits:vi.fn()}));
vi.mock("../src/lib/providers/live-policy",()=>({assertCamConfigured:()=>{},withCamExecution:async(_id:string,fn:()=>unknown)=>fn()}));
vi.mock("../src/lib/providers/cam",()=>({connectCamProviders:mocks.providers}));
vi.mock("../src/lib/job-lock",()=>({acquireJobLock:async()=>({assertOwned:async()=>{},release:async()=>{},db:{select:()=>({from:()=>({where:async()=>[mocks.job]})}),update:()=>({set:(values:Record<string,unknown>)=>({where:async()=>Object.assign(mocks.job,values)})})}})}));
vi.mock("../src/lib/concept/feedback-director",async importOriginal=>({...await importOriginal<typeof import("../src/lib/concept/feedback-director")>(),directFeedback:(...args:Parameters<typeof import("../src/lib/concept/feedback-director").directFeedback>)=>import("./fixtures/feedback-director").then(m=>m.fixtureFeedbackDirector(args[0],args[1]))}));
import { updateLiveProduction, runLiveProduction, liveView, LiveAction } from "../src/lib/concept/live-production";
import { sha256 } from "../src/lib/concept/checkpoints";
import { planConcept } from "../src/lib/concept/storyboard";
import { getRecipe } from "../src/lib/recipes";
import { resolveParams } from "../src/lib/brain";
import { placeholderTiming } from "../src/lib/concept/timing";
import { generationPlan, IMAGE_ENDPOINT } from "../src/lib/concept/generation-plan";
import { flowReviewTarget } from "../src/lib/concept/production-flow";
import { StoryboardSheetSchema, storyboardReviewContent } from "../src/lib/concept/storyboard-review";
import { CamQuoteSchema } from "../src/lib/providers/cam-pricing";

let id:string,dir:string,target:string;
const script="Check the original source before sharing. Read the full passage before deciding.";
const json=async(file:string)=>JSON.parse(await readFile(path.join(dir,file),"utf8"));
const save=async(file:string,value:unknown)=>{await mkdir(path.dirname(path.join(dir,file)),{recursive:true});await writeFile(path.join(dir,file),JSON.stringify(value));};
function price(plan:ReturnType<typeof generationPlan>){
 const lines=plan.operations.filter(op=>op.kind==="image").map(op=>({id:op.id,model:IMAGE_ENDPOINT,kind:"image" as const,unit:"usd" as const,quantity:1,unitPrice:.15,maximum:150000,description:"One image"}));
 const content={plan:plan.fingerprint,scope:"storyboard" as const,createdAt:Date.now(),expiresAt:Date.now()+3600000,lines,caps:{usd:lines.length*150000,"higgsfield-credit":0},falBillingAvailable:false};
 return CamQuoteSchema.parse({...content,id:sha256(JSON.stringify(content))});
}
beforeEach(async()=>{
 vi.clearAllMocks();id=randomUUID();dir=path.join(process.cwd(),"storage/concepts",id,"live");
 vi.stubGlobal("fetch",vi.fn(()=>{throw new Error("Unexpected network request in offline feedback test");}));
 mocks.references=[{id:"narrator",filePath:"/fixture/narrator.png",url:"/sheet.png",sha256:"a".repeat(64),characterSheet:{status:"approved",sha256:"a".repeat(64),approvedAt:"2026-10-15"}}];
 const params={...resolveParams(script,"auto").params,templateSlug:"cam-clay",live:true,executionMode:"fal"};
 mocks.job={id,script,params};
 const board=planConcept(script,getRecipe("cam-clay")!,params.aspectRatio),timing=placeholderTiming(board.shots.map(s=>s.narration));
 const quote=price(generationPlan(script,params,board,timing,mocks.references));
 const panels=board.shots.map(s=>({scene:s.index,narration:s.narration,meaning:s.metaphor??"Explain the sentence",startScene:s.scene,endScene:s.endScene,motion:s.motion,actionSeconds:s.actionSeconds??s.clipSeconds,visualMode:s.visualMode,overlay:s.overlay,start:{id:randomUUID(),kind:"image" as const,sha256:String(s.index).repeat(64),width:1080,height:1920}}));
 target=flowReviewTarget("live",id,"storyboard",storyboardReviewContent(panels,params.aspectRatio));
 await save("storyboard-review.json",{version:1,target,panels,retrospective:false});
 await save("state.json",{status:"awaiting-review",phase:"storyboard",review:{target,stage:"storyboard",scene:null,storyboard:panels},events:[],paidGenerationAuthorized:true});
 await save("production.json",{version:1,storyboardFirst:true,inputHash:sha256(JSON.stringify({script,format:params.aspectRatio,directions:params.sceneDirections??{},narrations:params.sceneNarrations,references:mocks.references.map(({id,sha256})=>({id,sha256}))})),quote,pendingQuote:null,approval:{quote:quote.id,actor:"human",at:Date.now()},history:[],decisions:[],phases:{},error:null,finished:false});
 mocks.quote.mockImplementation(async plan=>price(plan));
});
afterEach(async()=>{expect(mocks.providers).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await rm(path.dirname(dir),{recursive:true,force:true});});

async function filmPreview(){
 target="f".repeat(64);
 await save("state.json",{status:"awaiting-review",phase:"draft-film",review:{stage:"draft-film",scene:null,target,film:{file:path.join(dir,"draft-montage/draft.mp4"),sha256:"e".repeat(64),duration:51.2}},events:[]});
}
it("persists global and timestamped film requests without generation, quotes or approval",async()=>{
 await filmPreview();const original=await json("production.json"),commentId=randomUUID();
 const action=LiveAction.parse({action:"film-comment",target,id:commentId,text:" Slow this movement ",seconds:18.2});
 expect(await updateLiveProduction(id,action,"human",mocks.quote)).toEqual({advance:false});
 await updateLiveProduction(id,action,"human",mocks.quote);
 await updateLiveProduction(id,LiveAction.parse({action:"film-comment",target,id:randomUUID(),text:"Quieter music",seconds:null}),"human",mocks.quote);
 const view=await liveView(id);expect(view.filmComments).toHaveLength(2);
 expect(view.filmComments[0]).toMatchObject({id:commentId,text:"Slow this movement",seconds:18.2});
 expect(view.filmComments[0]).not.toHaveProperty("actor");
 expect(await json("production.json")).toEqual(original);expect(mocks.quote).not.toHaveBeenCalled();expect(mocks.reserve).not.toHaveBeenCalled();
 await expect(updateLiveProduction(id,{action:"review",target,decision:"approved"},"human",mocks.quote)).rejects.toThrow(/requested changes/);
 await updateLiveProduction(id,{action:"film-comment-remove",target,id:commentId},"human",mocks.quote);
 expect((await liveView(id)).filmComments).toHaveLength(1);
});
it("rejects stale or out-of-range film feedback without losing the current preview",async()=>{
 await filmPreview();const original=await json("state.json");
 await expect(updateLiveProduction(id,{action:"film-comment",target:"a".repeat(64),id:randomUUID(),text:"Change",seconds:null},"human",mocks.quote)).rejects.toThrow(/preview changed/);
 await expect(updateLiveProduction(id,{action:"film-comment",target,id:randomUUID(),text:"Change",seconds:52},"human",mocks.quote)).rejects.toThrow(/within the current/);
 expect(await json("state.json")).toEqual(original);
});

it("atomically saves and classifies the client's unsaved soldiers request, including trailing whitespace",async()=>{
 const text="This case doesn't make sens with the sentence. You can show instead two soldiers in the same vibe of the main cartoon character being side by side on the field";
 const action=LiveAction.parse({action:"storyboard-apply",target,scene:1,text:` ${text}\n `});
 expect(action).toMatchObject({text});
 expect(await updateLiveProduction(id,action,"human",mocks.quote)).toEqual({advance:false});
 const feedback=await json("storyboard-feedback.json");
 expect(feedback.comments[1]).toMatchObject({text,status:"needs-image-revision"});
 expect(feedback.comments[1].message).toContain("character");
 expect((await liveView(id)).storyboard?.panels[0].comment).toEqual(feedback.comments[1]);
 expect(feedback.imageRevisions).toEqual({});expect(mocks.quote).not.toHaveBeenCalled();expect(mocks.reserve).not.toHaveBeenCalled();
});

it.each([
 ['Change the title to "Read the full context"',"title"],
 ["Add Muslim, Jewish and Christian symbols around him","symbols"],
])("applies an unsaved local correction in one action: %s",async(text,kind)=>{
 const before=await json("storyboard-review.json");
 expect(await updateLiveProduction(id,{action:"storyboard-apply",target,scene:1,text:` ${text} `},"human",mocks.quote)).toEqual({advance:false});
 const sheet=await json("storyboard-review.json"),feedback=await json("storyboard-feedback.json");
 expect(feedback.comments[1]).toMatchObject({text,status:"applied"});
 expect(sheet.target).not.toBe(target);expect(sheet.panels[0].start).toEqual(before.panels[0].start);expect(sheet.panels[1]).toEqual(before.panels[1]);
 if(kind==="title")expect(sheet.panels[0].overlay).toBe("Read the full context");
 else expect(sheet.panels[0].graphicLayers).toHaveLength(3);
 expect(mocks.quote).not.toHaveBeenCalled();expect(mocks.reserve).not.toHaveBeenCalled();
});

it("keeps a completed correction on duplicate save/apply even when the draft contains whitespace",async()=>{
 const text='Change the title to "Read the full context"';
 await updateLiveProduction(id,{action:"storyboard-apply",target,scene:1,text},"human",mocks.quote);
 const sheet=await json("storyboard-review.json"),feedback=await json("storyboard-feedback.json"),state=await json("production.json");
 for(const action of ["storyboard-comment","storyboard-apply"] as const){
  expect(await updateLiveProduction(id,{action,target:sheet.target,scene:1,text:`${text}\n `},"human",mocks.quote)).toEqual({advance:false});
  expect(await json("storyboard-feedback.json")).toEqual(feedback);
  expect(await json("storyboard-review.json")).toEqual(sheet);
  expect(await json("production.json")).toEqual(state);
 }
});

it("keeps the quoted replacement when Save or Apply is repeated with the same comment",async()=>{
 const text="Use a low camera angle";
 await updateLiveProduction(id,{action:"storyboard-apply",target,scene:1,text},"human",mocks.quote);
 await updateLiveProduction(id,{action:"storyboard-revision-quote",target,scene:1},"human",mocks.quote);
 const feedback=await json("storyboard-feedback.json"),state=await json("production.json");
 for(const action of ["storyboard-comment","storyboard-apply"] as const){
  await updateLiveProduction(id,{action,target,scene:1,text:` ${text} `},"human",mocks.quote);
  expect(await json("storyboard-feedback.json")).toEqual(feedback);expect(await json("production.json")).toEqual(state);
 }
 expect(mocks.quote).toHaveBeenCalledOnce();expect(mocks.reserve).not.toHaveBeenCalled();
});

it("replaces the old pending comment before applying a changed draft and invalidates its old price",async()=>{
 await updateLiveProduction(id,{action:"storyboard-apply",target,scene:1,text:"Use a low camera angle"},"human",mocks.quote);
 await updateLiveProduction(id,{action:"storyboard-revision-quote",target,scene:1},"human",mocks.quote);
 const oldQuote=(await json("production.json")).pendingQuote.id;
 await updateLiveProduction(id,{action:"storyboard-apply",target,scene:1,text:'Change the title to "Context matters"'},"human",mocks.quote);
 const feedback=await json("storyboard-feedback.json"),state=await json("production.json");
 expect(feedback.comments[1]).toMatchObject({status:"applied",text:'Change the title to "Context matters"'});
 expect((await json("storyboard-review.json")).panels[0].overlay).toBe("Context matters");
 expect(feedback.pendingImageRevisions).toEqual({});expect(state.pendingQuote).toBeNull();expect(state.pendingRevision).toBeNull();
 await expect(updateLiveProduction(id,{action:"approve",quote:oldQuote},"human",mocks.quote)).rejects.toThrow(/quote changed/);
 expect(mocks.reserve).not.toHaveBeenCalled();
});

it("rejects stale, invalid and missing atomic comments before writing any scene state",async()=>{
 const before=await Promise.all(["production.json","state.json","storyboard-review.json"].map(file=>json(file)));
 expect(LiveAction.safeParse({action:"storyboard-apply",target,scene:1,text:" \n "}).success).toBe(false);
 await expect(updateLiveProduction(id,{action:"storyboard-apply",target:"f".repeat(64),scene:1,text:"Use a low camera angle"},"human",mocks.quote)).rejects.toThrow(/changed/);
 await expect(updateLiveProduction(id,{action:"storyboard-apply",target,scene:36,text:"Use a low camera angle"},"human",mocks.quote)).rejects.toThrow(/Scene not found/);
 await expect(updateLiveProduction(id,{action:"storyboard-apply",target,scene:1,text:" \n "},"human",mocks.quote)).rejects.toThrow();
 await expect(updateLiveProduction(id,{action:"storyboard-apply",target,scene:1},"human",mocks.quote)).rejects.toThrow(/Save a comment/);
 expect(await Promise.all(["production.json","state.json","storyboard-review.json"].map(file=>json(file)))).toEqual(before);
 await expect(json("storyboard-feedback.json")).rejects.toMatchObject({code:"ENOENT"});
 expect(mocks.quote).not.toHaveBeenCalled();expect(mocks.reserve).not.toHaveBeenCalled();
});

it("persists a comment and applies local symbols without scheduling generation",async()=>{
 await updateLiveProduction(id,{action:"storyboard-comment",target,scene:1,text:"Rajoute un symbole musulman, juif et chrétien en motion design autour du personnage."},"human",mocks.quote);
 await expect(updateLiveProduction(id,{action:"review",target,decision:"approved",storyboardConfirmed:true},"human",mocks.quote)).rejects.toThrow(/Resolve/);
 const result=await updateLiveProduction(id,{action:"storyboard-apply",target,scene:1},"human",mocks.quote);
 expect(result.advance).toBe(false);expect(mocks.quote).not.toHaveBeenCalled();expect(mocks.reserve).not.toHaveBeenCalled();
 const sheet=await json("storyboard-review.json");expect(sheet.target).not.toBe(target);expect(sheet.panels[0].graphicLayers).toHaveLength(3);
 const view=await liveView(id);expect(view.storyboard?.panels[0].comment?.status).toBe("applied");
});
it("prices only the selected image replacement and requires explicit approval before scheduling it",async()=>{
 await updateLiveProduction(id,{action:"storyboard-comment",target,scene:1,text:"Use a low camera angle and cool lighting"},"human",mocks.quote);
 const result=await updateLiveProduction(id,{action:"storyboard-revision-quote",target,scene:1},"human",mocks.quote);
 expect(result.advance).toBe(false);expect(mocks.reserve).not.toHaveBeenCalled();
 const state=await json("production.json");
 expect(state.pendingQuote.lines.map((l:{id:string})=>l.id)).toEqual([...state.quote.lines.map((l:{id:string})=>l.id),"scene-1-start-retry-1"]);
 expect(state.pendingQuote.caps.usd-state.quote.caps.usd).toBe(150000);
 expect(state.pendingRetries).toEqual({"scene-1-start":1});
 const queued=await json("storyboard-feedback.json");expect(queued.imageRevisions).toEqual({});expect(queued.pendingImageRevisions[1].note).toContain("low camera");
 expect(await updateLiveProduction(id,{action:"approve",quote:state.pendingQuote.id,customerQuote:"c".repeat(64)},"human",mocks.quote)).toEqual({advance:true});
 expect(mocks.reserve).toHaveBeenCalledOnce();
 const approved=await json("storyboard-feedback.json");expect(approved.imageRevisions[1].note).toContain("low camera");expect(approved.pendingImageRevisions).toEqual({});expect(approved.comments[1].status).toBe("regenerating");
});
it("invalidates the quoted replacement when its comment changes",async()=>{
 await updateLiveProduction(id,{action:"storyboard-comment",target,scene:1,text:"Use a low camera angle"},"human",mocks.quote);
 await updateLiveProduction(id,{action:"storyboard-revision-quote",target,scene:1},"human",mocks.quote);
 const offered=(await json("production.json")).pendingQuote.id;
 await updateLiveProduction(id,{action:"storyboard-comment",target,scene:1,text:"Use overhead framing"},"human",mocks.quote);
 const state=await json("production.json"),feedback=await json("storyboard-feedback.json");
 expect(state.pendingQuote).toBeNull();expect(state.pendingRetries).toBeUndefined();expect(feedback.pendingImageRevisions).toEqual({});
 await expect(updateLiveProduction(id,{action:"approve",quote:offered},"human",mocks.quote)).rejects.toThrow(/quote changed/);
});
it("quotes new characters plus only the selected scene and keeps generation behind approval",async()=>{
 await expect(updateLiveProduction(id,{action:"storyboard-comment",target:"f".repeat(64),scene:1,text:"Change it"},"human",mocks.quote)).rejects.toThrow(/changed/);
 const text="Show two soldiers side by side on the field";
 // Recover the exact previously stuck state without requiring another comment.
 await save("storyboard-feedback.json",{version:1,edits:{},comments:{1:{text,actor:"human",at:new Date().toISOString(),status:"needs-character-sheet",message:"Old blocker"}}});
 await updateLiveProduction(id,{action:"storyboard-apply",target,scene:1,text},"human",mocks.quote);
 expect((await json("storyboard-feedback.json")).comments[1].status).toBe("needs-image-revision");
 const before=await json("storyboard-review.json");
 await updateLiveProduction(id,{action:"storyboard-revision-quote",target,scene:1},"human",mocks.quote);
 const state=await json("production.json"),feedback=await json("storyboard-feedback.json");
 expect(feedback.pendingImageRevisions[1].cast.characters).toHaveLength(2);
 expect(state.pendingQuote.lines.filter((line:{id:string})=>line.id.startsWith("cast-"))).toHaveLength(2);
 expect(state.pendingQuote.caps.usd-state.quote.caps.usd).toBe(450000);
 expect(state.pendingRetries).toEqual({"scene-1-start":1});expect(feedback.imageRevisions).toEqual({});
 expect(await json("storyboard-review.json")).toEqual(before);expect(mocks.reserve).not.toHaveBeenCalled();
 await updateLiveProduction(id,{action:"approve",quote:state.pendingQuote.id,customerQuote:"c".repeat(64)},"human",mocks.quote);
 expect((await json("storyboard-feedback.json")).imageRevisions[1].cast.characters).toHaveLength(2);
 expect((await json("storyboard-feedback.json")).comments[1].status).toBe("regenerating");
});
it("canonicalizes visible graphics before hashing the human review",async()=>{
 const raw=await json("storyboard-review.json");raw.panels[0]={...raw.panels[0],graphicLayers:[{kind:"symbol",symbol:"cross",position:"top-center"}],treatment:"infographic"};
 const parsed=StoryboardSheetSchema.parse(raw);
 expect(flowReviewTarget("live",id,"storyboard",storyboardReviewContent(raw.panels,"9:16"))).toBe(flowReviewTarget("live",id,"storyboard",storyboardReviewContent(parsed.panels,"9:16")));
});

it("fails closed if a saved comment changes before the pending quote checkpoint is cleared",async()=>{
 await updateLiveProduction(id,{action:"storyboard-comment",target,scene:1,text:"Use a low camera angle"},"human",mocks.quote);
 await updateLiveProduction(id,{action:"storyboard-revision-quote",target,scene:1},"human",mocks.quote);
 const state=await json("production.json"),feedback=await json("storyboard-feedback.json");
 feedback.comments[1].text="Use overhead framing";feedback.pendingImageRevisions={};await save("storyboard-feedback.json",feedback);
 await expect(updateLiveProduction(id,{action:"approve",quote:state.pendingQuote.id,customerQuote:"c".repeat(64)},"human",mocks.quote)).rejects.toThrow(/comment changed/);
 expect(mocks.reserve).not.toHaveBeenCalled();
});
it("refreshes an expired creative quote without forgetting its selected revision",async()=>{
 await updateLiveProduction(id,{action:"storyboard-comment",target,scene:1,text:"Use a low camera angle"},"human",mocks.quote);
 await updateLiveProduction(id,{action:"storyboard-revision-quote",target,scene:1},"human",mocks.quote);
 const state=await json("production.json");state.pendingQuote.expiresAt=0;await save("production.json",state);
 expect(await updateLiveProduction(id,{action:"quote"},"human",mocks.quote)).toEqual({advance:false});
 const revised=await json("production.json");expect(revised.pendingQuote.expiresAt).toBeGreaterThan(Date.now());expect(revised.pendingRevision.scene).toBe(1);
});

it("does not price a new physical action against the old start/end states",async()=>{
 await updateLiveProduction(id,{action:"storyboard-comment",target,scene:1,text:"Make him unroll a scroll"},"human",mocks.quote);
 await expect(updateLiveProduction(id,{action:"storyboard-revision-quote",target,scene:1},"human",mocks.quote)).rejects.toThrow(/action change/);
 expect(mocks.quote).not.toHaveBeenCalled();
});

it("applies a clay-style request to all graphic layers while keeping each scene's feedback",async()=>{
 const sheet=await json("storyboard-review.json"),outcome=await json("state.json");
 for(const panel of sheet.panels)panel.graphicLayers=[{kind:"symbol",symbol:"cross",position:"top-left"}];
 // Simulate a stored board approved against the previous renderer.
 const oldTarget=target;await save("storyboard-review.json",sheet);
 await save(`storyboard-reviews/${oldTarget}.json`,{target:oldTarget,decision:"approved",actor:"human",at:new Date().toISOString(),note:"Old graphic appearance"});
 const before=await json("storyboard-review.json"),view=await liveView(id,mocks.job.params.aspectRatio);
 expect(view.storyboard?.target).not.toBe(oldTarget);expect(view.storyboard?.status).toBe("pending");expect(view.review?.target).toBe(view.storyboard?.target);
 expect(await json("storyboard-review.json")).toEqual(before); // GET is read-only.
 target=view.storyboard!.target;
 await updateLiveProduction(id,{action:"storyboard-apply",target,scene:2,text:"Show two soldiers in the field"},"human",mocks.quote);
 const personal=(await json("storyboard-feedback.json")).comments;
 expect(await updateLiveProduction(id,{action:"storyboard-global-apply",target,text:"Make all floating symbols look like clay."},"human",mocks.quote)).toEqual({advance:false});
 const feedback=await json("storyboard-feedback.json"),updated=await liveView(id,mocks.job.params.aspectRatio);
 expect(feedback.globalComment).toMatchObject({status:"applied",scenes:[1,2]});expect(feedback.comments).toEqual(personal);
 expect(updated.storyboard?.globalComment).toEqual(feedback.globalComment);expect(updated.review?.target).toBe(updated.storyboard?.target);
 expect((await json("state.json")).review.target).not.toBe(outcome.review.target);
 await expect(updateLiveProduction(id,{action:"review",target:updated.storyboard!.target,decision:"approved",storyboardConfirmed:true},"human",mocks.quote)).rejects.toThrow(/Resolve/);
 expect(mocks.quote).not.toHaveBeenCalled();expect(mocks.reserve).not.toHaveBeenCalled();
});

it("applies a video-wide local title correction without changing personal comments or image requests",async()=>{
 const before=await json("storyboard-review.json");
 await updateLiveProduction(id,{action:"storyboard-comment",target,scene:2,text:"Use cooler lighting"},"human",mocks.quote);
 const personal=(await json("storyboard-feedback.json")).comments;
 expect(await updateLiveProduction(id,{action:"storyboard-global-apply",target,text:'Change the title to "Context matters"'},"human",mocks.quote)).toEqual({advance:false});
 const feedback=await json("storyboard-feedback.json"),sheet=await json("storyboard-review.json");
 expect(feedback.globalComment).toMatchObject({status:"applied",scenes:[1,2]});expect(feedback.comments).toEqual(personal);
 expect(sheet.panels.map((panel:{overlay:string})=>panel.overlay)).toEqual(["Context matters","Context matters"]);
 expect(sheet.panels.map((panel:{start:unknown})=>panel.start)).toEqual(before.panels.map((panel:{start:unknown})=>panel.start));
 expect(feedback.edits).toEqual({});expect(Object.keys(feedback.globalEdits)).toEqual(["1","2"]);
 expect(mocks.quote).not.toHaveBeenCalled();expect(mocks.reserve).not.toHaveBeenCalled();
});

it("quotes every actually affected image once and never applies unresolved personal cast instructions",async()=>{
 const personalNote="Show two soldiers side by side in the field",globalNote="Use cool lighting and wider camera framing throughout the video";
 await updateLiveProduction(id,{action:"storyboard-apply",target,scene:2,text:personalNote},"human",mocks.quote);
 const personal=(await json("storyboard-feedback.json")).comments;
 expect(await updateLiveProduction(id,{action:"storyboard-global-apply",target,text:globalNote},"human",mocks.quote)).toEqual({advance:false});
 await expect(updateLiveProduction(id,{action:"review",target,decision:"approved",storyboardConfirmed:true},"human",mocks.quote)).rejects.toThrow(/video-wide/);
 expect(await updateLiveProduction(id,{action:"storyboard-global-revision-quote",target},"human",mocks.quote)).toEqual({advance:false});
 const state=await json("production.json"),feedback=await json("storyboard-feedback.json"),view=await liveView(id,mocks.job.params.aspectRatio);
 expect(state.pendingRevision).toMatchObject({scope:"global",scenes:[1,2],noteHash:sha256(globalNote)});
 expect(state.pendingQuote.lines.map((line:{id:string})=>line.id)).toEqual(["scene-1-start","scene-2-start","scene-1-start-retry-1","scene-2-start-retry-1"]);
 expect(state.pendingQuote.caps.usd-state.quote.caps.usd).toBe(300000);expect(state.pendingRetries).toEqual({"scene-1-start":1,"scene-2-start":1});
 expect(view).toMatchObject({revisionScope:"global",revisionScene:null,revisionScenes:[1,2]});
 expect(feedback.comments).toEqual(personal);expect(feedback.imageRevisions).toEqual({});
 expect(Object.values(feedback.pendingImageRevisions)).toEqual([{note:"",globalNote,attempt:1,animationContract:2,instructionContract:3},{note:"",globalNote,attempt:1,animationContract:2,instructionContract:3}]);
 const plan=mocks.quote.mock.calls.at(-1)![0];
 expect(plan.operations.filter((operation:{kind:string})=>operation.kind==="image").every((operation:{input:{prompt:string}})=>operation.input.prompt.includes(globalNote))).toBe(true);
 expect(JSON.stringify(plan)).not.toContain(personalNote);
 expect(mocks.reserve).not.toHaveBeenCalled();
 expect(await updateLiveProduction(id,{action:"approve",quote:state.pendingQuote.id,customerQuote:"c".repeat(64)},"human",mocks.quote)).toEqual({advance:true});
 const approved=await json("storyboard-feedback.json");
 expect(approved.globalComment.status).toBe("regenerating");expect(approved.comments).toEqual(personal);expect(Object.keys(approved.imageRevisions)).toEqual(["1","2"]);
 expect(mocks.reserve).toHaveBeenCalledOnce();
});

it("binds a global replacement quote to the exact global comment before credit reservation",async()=>{
 await updateLiveProduction(id,{action:"storyboard-global-apply",target,text:"Use cooler lighting throughout"},"human",mocks.quote);
 await updateLiveProduction(id,{action:"storyboard-global-revision-quote",target},"human",mocks.quote);
 const state=await json("production.json"),feedback=await json("storyboard-feedback.json");
 feedback.globalComment.text="Use warmer lighting instead";await save("storyboard-feedback.json",feedback);
 await expect(updateLiveProduction(id,{action:"approve",quote:state.pendingQuote.id,customerQuote:"c".repeat(64)},"human",mocks.quote)).rejects.toThrow(/comment changed/);
 expect(mocks.reserve).not.toHaveBeenCalled();
});

it("withdraws only the global request and its quote, keeping personal feedback intact",async()=>{
 await updateLiveProduction(id,{action:"storyboard-apply",target,scene:2,text:"Show two soldiers in the field"},"human",mocks.quote);
 const personal=(await json("storyboard-feedback.json")).comments;
 await updateLiveProduction(id,{action:"storyboard-global-apply",target,text:"Use cool lighting throughout"},"human",mocks.quote);
 await updateLiveProduction(id,{action:"storyboard-global-revision-quote",target},"human",mocks.quote);
 const oldQuote=(await json("production.json")).pendingQuote.id;
 expect(await updateLiveProduction(id,{action:"storyboard-global-withdraw",target},"human",mocks.quote)).toEqual({advance:false});
 const state=await json("production.json"),feedback=await json("storyboard-feedback.json");
 expect(feedback.globalComment).toBeNull();expect(feedback.comments).toEqual(personal);expect(feedback.pendingImageRevisions).toEqual({});
 expect(state.pendingQuote).toBeNull();expect(state.pendingRevision).toBeNull();expect(state.pendingRetries).toBeUndefined();
 await expect(updateLiveProduction(id,{action:"approve",quote:oldQuote},"human",mocks.quote)).rejects.toThrow(/quote changed/);
 expect(mocks.reserve).not.toHaveBeenCalled();
});

it("rejects stale global actions and keeps new cast or action requests pending without pricing them",async()=>{
 const initial=await json("storyboard-review.json");
 await expect(updateLiveProduction(id,{action:"storyboard-global-apply",target:"f".repeat(64),text:"Use cool light"},"human",mocks.quote)).rejects.toThrow(/changed/);
 await expect(json("storyboard-feedback.json")).rejects.toMatchObject({code:"ENOENT"});
 for(const [text,status] of [["Show two doctors throughout this video","needs-character-sheet"],["Make the character dance in all scenes","needs-action-plan"]]){
  expect(await updateLiveProduction(id,{action:"storyboard-global-apply",target,text},"human",mocks.quote)).toEqual({advance:false});
  expect((await json("storyboard-feedback.json")).globalComment.status).toBe(status);
  await expect(updateLiveProduction(id,{action:"storyboard-global-revision-quote",target},"human",mocks.quote)).rejects.toThrow();
 }
 expect(await json("storyboard-review.json")).toEqual(initial);expect(mocks.quote).not.toHaveBeenCalled();expect(mocks.reserve).not.toHaveBeenCalled();
});

it("accepts one fresh human approval for the current graphic renderer and persists that target",async()=>{
 const sheet=await json("storyboard-review.json");sheet.panels[0].graphicLayers=[{kind:"symbol",symbol:"cross",position:"top-left"}];await save("storyboard-review.json",sheet);
 const view=await liveView(id,mocks.job.params.aspectRatio),effective=view.storyboard!.target;
 expect(effective).not.toBe(target);
 await expect(updateLiveProduction(id,{action:"review",target,decision:"approved",storyboardConfirmed:true},"human",mocks.quote)).rejects.toThrow(/changed/);
 expect(await updateLiveProduction(id,{action:"review",target:effective,decision:"approved",storyboardConfirmed:true},"human",mocks.quote)).toEqual({advance:false});
 const reviewed=await liveView(id,mocks.job.params.aspectRatio);
 expect(reviewed.storyboard?.status).toBe("approved");expect(reviewed.needsProductionBudget).toBe(true);
 expect((await json("storyboard-review.json")).target).toBe(effective);expect((await json("state.json")).review.target).toBe(effective);
 expect(mocks.quote).not.toHaveBeenCalled();expect(mocks.reserve).not.toHaveBeenCalled();
});

it("quotes a timed film correction once, preserves the preview, and applies only after price approval",async()=>{
 await filmPreview();
 const selection={version:1,minimumResolution:"1080p",workflow:"draft-first",method:"capabilities-and-live-prices",scenes:[],notes:[]};
 const fullPrice=(plan:ReturnType<typeof generationPlan>)=>{
  const base=price(plan);
  const lines=[...base.lines,...plan.operations.filter(op=>op.kind==="video").flatMap(op=>[{id:op.id.replace(/-clip$/,"-draft"),model:op.model,kind:"video",unit:"usd",quantity:1,unitPrice:.5,maximum:500000,description:"Draft"},{id:op.id,model:op.model,kind:"video",unit:"usd",quantity:1,unitPrice:1,maximum:1000000,description:"Final"}])];
  return CamQuoteSchema.parse({...base,scope:"production",selection,lines,caps:{usd:lines.reduce((sum,l)=>sum+l.maximum,0),"higgsfield-credit":0}});
 };
 mocks.quote.mockImplementation(async plan=>fullPrice(plan));
 const state=await json("production.json");
 const originalBoard=planConcept(mocks.job.script,getRecipe("cam-clay")!,mocks.job.params.aspectRatio);
 state.quote=fullPrice(generationPlan(mocks.job.script,mocks.job.params,originalBoard,placeholderTiming(originalBoard.shots.map(s=>s.narration)),mocks.references));
 state.approval.quote=state.quote.id;await save("production.json",state);
 await save("draft-montage/editorial-timeline.json",{fps:30,scenes:[{scene:1,startFrame:0,endFrame:120},{scene:2,startFrame:120,endFrame:240}]});
 await save("draft-film.json",{target});
 const commentId=randomUUID();await updateLiveProduction(id,{action:"film-comment",target,id:commentId,text:"Use a low camera angle",seconds:5},"human",mocks.quote);
 const original=await json("state.json"),sheet=await json("storyboard-review.json");
 const action={action:"film-apply" as const,target,id:commentId};
 expect(await updateLiveProduction(id,action,"human",mocks.quote)).toEqual({advance:false});
 const quoted=await json("production.json");expect(quoted.filmCorrection).toMatchObject({status:"quoted",scenes:[2]});
 expect(quoted.pendingRetries).toEqual({"scene-2-start":1,"scene-2-draft":1});expect(await json("state.json")).toEqual(original);expect(await json("storyboard-review.json")).toEqual(sheet);
 await updateLiveProduction(id,action,"human",mocks.quote);expect(mocks.quote).toHaveBeenCalledOnce();expect(mocks.reserve).not.toHaveBeenCalled();
 expect(await updateLiveProduction(id,{action:"approve",quote:quoted.pendingQuote.id,customerQuote:"c".repeat(64)},"human",mocks.quote)).toEqual({advance:true});
 expect(mocks.reserve).toHaveBeenCalledOnce();expect((await json("production.json")).filmCorrection.status).toBe("working");
 expect(Object.keys((await json("storyboard-feedback.json")).imageRevisions)).toEqual(["2"]);
 expect(await json(`film-history/${target}/state.json`)).toEqual(original);
 expect((await json("state.json")).phase).toBe("film-correction");
});


it("quotes only the scenes selected in storyboard-wide feedback and preserves other inputs",async()=>{
 const originalPlan=mocks.quote.mock.calls.length;
 await updateLiveProduction(id,{action:"storyboard-global-apply",target,text:"Scene 2: use cooler lighting"},"human",mocks.quote);
 expect(mocks.quote.mock.calls).toHaveLength(originalPlan);
 await updateLiveProduction(id,{action:"storyboard-global-revision-quote",target},"human",mocks.quote);
 const state=await json("production.json"),feedback=await json("storyboard-feedback.json");
 expect(state.pendingRevision).toMatchObject({scope:"global",scenes:[2]});
 expect(state.pendingRetries).toEqual({"scene-2-start":1});
 expect(state.pendingQuote.lines.map((line:{id:string})=>line.id)).toEqual(["scene-1-start","scene-2-start","scene-2-start-retry-1"]);
 expect(state.pendingQuote.caps.usd-state.quote.caps.usd).toBe(150000);
 expect(Object.keys(feedback.pendingImageRevisions)).toEqual(["2"]);
 const plan=mocks.quote.mock.calls.at(-1)![0];
 expect(plan.operations.find((o:{id:string})=>o.id==="scene-1-start").input.prompt).not.toContain("cooler lighting");
 expect(plan.operations.find((o:{id:string})=>o.id==="scene-2-start").input.prompt).toContain("cooler lighting");
 expect(mocks.reserve).not.toHaveBeenCalled();
 // A quote cannot later authorize a wider scope without a new price.
 feedback.globalComment.scenes=[1,2];await save("storyboard-feedback.json",feedback);
 await expect(updateLiveProduction(id,{action:"approve",quote:state.pendingQuote.id,customerQuote:"c".repeat(64)},"human",mocks.quote)).rejects.toThrow(/comment changed/);
 expect(mocks.reserve).not.toHaveBeenCalled();
});

it("locks scene and global notes without quoting or changing images, then prepares one exact batch",async()=>{
 const before=await json("storyboard-review.json");
 await updateLiveProduction(id,{action:"storyboard-lock",target,scene:1,text:"Use cooler lighting in this scene"},"human",mocks.quote);
 await updateLiveProduction(id,{action:"storyboard-lock",target,scene:2,text:"Use a wide camera angle"},"human",mocks.quote);
 await updateLiveProduction(id,{action:"storyboard-global-lock",target,text:"Make the walls blue",scenes:[1,2]},"human",mocks.quote);
 expect(await json("storyboard-review.json")).toEqual(before);expect(mocks.quote).not.toHaveBeenCalled();expect(mocks.reserve).not.toHaveBeenCalled();
 expect((await json("storyboard-feedback.json")).comments[1].status).toBe("locked");
 expect(await updateLiveProduction(id,{action:"storyboard-batch-apply",target},"human",mocks.quote)).toEqual({advance:false});
 const feedback=await json("storyboard-feedback.json"),state=await json("production.json");
 expect(state.pendingRevision).toMatchObject({scope:"batch",scenes:[1,2]});expect(mocks.quote).toHaveBeenCalledTimes(1);
 expect(feedback.pendingImageRevisions[1]).toMatchObject({note:"Make the walls blue\nUse cooler lighting in this scene"});
 expect(feedback.pendingImageRevisions[2]).toMatchObject({note:"Make the walls blue\nUse a wide camera angle"});
 expect(mocks.reserve).not.toHaveBeenCalled();
 await updateLiveProduction(id,{action:"approve",quote:state.pendingQuote.id,customerQuote:"a".repeat(64)},"human",mocks.quote);
 const approved=await json("storyboard-feedback.json");expect(approved.comments[1].status).toBe("regenerating");expect(approved.comments[2].status).toBe("regenerating");expect(approved.globalComment.status).toBe("regenerating");
});
it("keeps feedback editable when a previous image failed and invalidates an old batch price",async()=>{
 await save("state.json",{status:"pending",phase:"scene-1-start-retry-1",events:[]});
 await updateLiveProduction(id,{action:"storyboard-lock",target,scene:1,text:"Use cooler lighting"},"human",mocks.quote);
 await updateLiveProduction(id,{action:"storyboard-lock",target,scene:2,text:"Use a wider angle"},"human",mocks.quote);
 await updateLiveProduction(id,{action:"storyboard-batch-apply",target},"human",mocks.quote);
 const old=await json("production.json");
 await updateLiveProduction(id,{action:"storyboard-lock",target,scene:2,text:"Use warmer lighting instead"},"human",mocks.quote);
 await expect(updateLiveProduction(id,{action:"approve",quote:old.pendingQuote.id,customerQuote:"a".repeat(64)},"human",mocks.quote)).rejects.toThrow(/quote changed/);
 expect((await json("storyboard-feedback.json")).comments[1]).toMatchObject({text:"Use cooler lighting",status:"locked"});
 await updateLiveProduction(id,{action:"storyboard-batch-apply",target},"human",mocks.quote);
 expect((await json("production.json")).pendingRevision.scenes).toEqual([1,2]);
 await updateLiveProduction(id,{action:"storyboard-withdraw",target,scene:2},"human",mocks.quote);
 expect((await json("storyboard-feedback.json")).comments[1].status).toBe("locked");
 await updateLiveProduction(id,{action:"storyboard-batch-apply",target},"human",mocks.quote);
 expect((await json("production.json")).pendingRevision.scenes).toEqual([1]);
 expect(mocks.reserve).not.toHaveBeenCalled();
});
it("only changes local layers when the locked batch is explicitly applied",async()=>{
 const before=await json("storyboard-review.json");
 await updateLiveProduction(id,{action:"storyboard-lock",target,scene:1,text:'Change the title to "Locked title"'},"human",mocks.quote);
 expect(await json("storyboard-review.json")).toEqual(before);
 await updateLiveProduction(id,{action:"storyboard-batch-apply",target},"human",mocks.quote);
 expect((await json("storyboard-review.json")).panels[0].overlay).toBe("Locked title");expect(mocks.quote).not.toHaveBeenCalled();
});

it("applies the two reported notes as one free local batch without changing quotes, approvals or neighboring panels",async()=>{
 const sheet=await json("storyboard-review.json");
 sheet.panels[0].graphicLayers=[{kind:"symbol",symbol:"globe",position:"top-center"}];
 await save("storyboard-review.json",sheet);
 const first=await liveView(id,mocks.job.params.aspectRatio);target=first.storyboard!.target;
 const before=await json("production.json");
 await updateLiveProduction(id,{action:"storyboard-lock",target,scene:1,text:"Enlève les pastilles flotantes"},"human",mocks.quote);
 await updateLiveProduction(id,{action:"storyboard-lock",target,scene:2,text:"Je vreux juste une animation de texte ici, pas besoin du personnage"},"human",mocks.quote);
 expect(await updateLiveProduction(id,{action:"storyboard-batch-apply",target},"human",mocks.quote)).toEqual({advance:false});
 const after=await json("storyboard-review.json"),state=await json("production.json"),feedback=await json("storyboard-feedback.json");
 expect(after.panels[0].graphicLayers).toEqual([]);
 expect((await liveView(id,mocks.job.params.aspectRatio)).storyboard!.panels[1]).toMatchObject({textOnly:true,comment:{status:"applied"}});
 expect(after.panels[1]).toMatchObject({textOnly:true,overlay:sheet.panels[1].narration,visualMode:"presenter-text"});
 expect(after.panels.map((p:{start:unknown})=>p.start)).toEqual(sheet.panels.map((p:{start:unknown})=>p.start));
 expect(Object.values(feedback.comments).every(c=>(c as {status:string}).status==="applied")).toBe(true);
 expect(feedback.pendingImageRevisions).toEqual({});expect(state.quote).toEqual(before.quote);expect(state.approval).toEqual(before.approval);
 expect(mocks.quote).not.toHaveBeenCalled();expect(mocks.reserve).not.toHaveBeenCalled();
});

it('executes the semantic director plan rather than inferring a tool from client wording',async()=>{
 const original=await json('storyboard-review.json');
 const text="Les machins en l'air distraient, garde le reste exactement pareil.";
 const director=vi.fn(async()=>({decisions:[{id:'scene:1',stage:'visual' as const,status:'planned' as const,message:'Remove only the floating layers.',finishing:null,changes:[{scene:1,edit:{graphicLayers:[]},imageInstruction:null,characters:[]}]}]}));
 await updateLiveProduction(id,{action:'storyboard-lock',target,scene:1,text},'human',mocks.quote,director);
 expect(director).not.toHaveBeenCalled();
 await updateLiveProduction(id,{action:'storyboard-batch-apply',target},'human',mocks.quote,director);
 expect(director).toHaveBeenCalledTimes(1);expect(director.mock.calls[0]).toBeDefined();
 expect((await json('storyboard-feedback.json')).comments[1]).toMatchObject({text,status:'applied'});
 expect((await json('storyboard-review.json')).panels[0].start).toEqual(original.panels[0].start);
 expect(mocks.quote).not.toHaveBeenCalled();
});
it('keeps locked client notes and media intact when the semantic director fails',async()=>{
 await updateLiveProduction(id,{action:'storyboard-lock',target,scene:1,text:'A much more readable composition please'},'human',mocks.quote);
 const feedback=await json('storyboard-feedback.json'),sheet=await json('storyboard-review.json');
 await expect(updateLiveProduction(id,{action:'storyboard-batch-apply',target},'human',mocks.quote,async()=>{throw Error('Director unavailable');})).rejects.toThrow('recovery analysis could not complete');
 expect(await json('storyboard-feedback.json')).toEqual(feedback);expect(await json('storyboard-review.json')).toEqual(sheet);expect(mocks.quote).not.toHaveBeenCalled();
});
it('reopens image review for a semantic local film correction with no media spending permission',async()=>{
 await filmPreview();const state=await json('production.json');state.quote.scope='production';await save('production.json',state);
 await mkdir(path.join(dir,'draft-montage'),{recursive:true});await save('draft-montage/editorial-timeline.json',{fps:30,scenes:[{scene:1,startFrame:0,endFrame:900},{scene:2,startFrame:900,endFrame:1536}]});
 const commentId=randomUUID();await updateLiveProduction(id,{action:'film-comment',target,id:commentId,text:'Retire cette décoration',seconds:5},'human',mocks.quote);
 const director=vi.fn(async()=>({decisions:[{id:commentId,stage:'visual' as const,status:'planned' as const,message:'Remove local graphic layers and review the updated composition.',finishing:null,changes:[{scene:1,edit:{graphicLayers:[]},imageInstruction:null,characters:[]}]}]}));
 expect(await updateLiveProduction(id,{action:'film-apply',target,id:commentId},'human',mocks.quote,director)).toEqual({advance:false});
 expect((await json('production.json')).filmCorrection).toMatchObject({status:'working',reuseOnly:true,revisions:{}});
 expect((await json('state.json')).review.stage).toBe('storyboard');expect(mocks.quote).not.toHaveBeenCalled();
});

it("prices an approved locally revised storyboard without changing its original quote, and rejects unrelated plan changes",async()=>{
 const params=mocks.job.params,baseBoard=planConcept(script,getRecipe("cam-clay")!,params.aspectRatio,params.sceneDirections,params.sceneNarrations);
 const baseQuote=price(generationPlan(script,params,baseBoard,placeholderTiming(baseBoard.shots.map(s=>s.narration)),mocks.references));
 const original=await json("production.json");await save("production.json",{...original,quote:baseQuote,approval:{...original.approval,quote:baseQuote.id}});
 await updateLiveProduction(id,{action:"storyboard-lock",target,scene:2,text:"Text only, no character"},"human",mocks.quote);
 await updateLiveProduction(id,{action:"storyboard-batch-apply",target},"human",mocks.quote);
 const revised=(await liveView(id,mocks.job.params.aspectRatio)).storyboard!;
 await updateLiveProduction(id,{action:"review",target:revised.target,decision:"approved",storyboardConfirmed:true},"human",mocks.quote);
 const before=await json("production.json");
 mocks.quote.mockImplementation(async plan=>({...price(plan),scope:"production"}));
 await expect(updateLiveProduction(id,{action:"quote"},"human",mocks.quote)).resolves.toEqual({advance:false});
 const after=await json("production.json");
 expect(after.pendingQuote.scope).toBe("production");expect(after.quote).toEqual(before.quote);expect(after.approval).toEqual(before.approval);
 expect(after.pendingQuote.plan).not.toBe(before.quote.plan);
 await save("production.json",{...before,quote:{...before.quote,plan:"f".repeat(64)}});
 await expect(updateLiveProduction(id,{action:"quote"},"human",mocks.quote)).rejects.toThrow(/different production/);
});

it('never rewrites a checkpoint belonging to a different database during worker discovery',async()=>{
 const before=await readFile(path.join(dir,'production.json'),'utf8');mocks.job=null as unknown as typeof mocks.job;
 await runLiveProduction(id,undefined,{background:true});
 expect(await readFile(path.join(dir,'production.json'),'utf8')).toBe(before);
});
