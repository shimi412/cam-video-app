import {expect,it,vi,afterEach} from "vitest";
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {selectVideoModels,HF_SEEDANCE,HF_MINIMAX,SEEDANCE,MINIMAX,KLING_PRO,type SceneNeeds} from "../src/lib/concept/model-selection";
import {parseVideoRequest,type GenerationOperation} from "../src/lib/concept/generation-plan";
import {higgsfieldVideoQueue,type McpCall} from "../src/lib/concept/provider-transports";
import {advanceRequest,requestReceipts} from "../src/lib/concept/request-journal";
const need:SceneNeeds={operation:"scene-1-clip",scene:1,seconds:5,quoteSeconds:15,endFrame:true,complex:true,localText:false};
const offers=[{model:HF_SEEDANCE,resolution:"1080p",seconds:15,unit:"higgsfield-credit" as const,final:20,draft:3},{model:HF_MINIMAX,resolution:"2K (upscaled from 768p)",seconds:15,unit:"higgsfield-credit" as const,final:2}];
const prices=[{endpoint_id:KLING_PRO,unit_price:.14,unit:"seconds",currency:"USD"}];
afterEach(()=>vi.unstubAllEnvs());
it("compares total draft plus finish, with native quality and currencies kept distinct",()=>{
 const direct=selectVideoModels([need],prices,{offers});
 expect(direct.scenes[0].selected).toBe(KLING_PRO);
 expect(direct.scenes[0].candidates.find(c=>c.model===HF_MINIMAX)?.eligible).toBe(false);
 expect(selectVideoModels([need],prices,{offers,higgsfieldCreditUsd:.01}).scenes[0].selected).toBe(HF_SEEDANCE);
 expect(selectVideoModels([need],prices,{offers,minimumResolution:"720p",higgsfieldCreditUsd:.01}).scenes[0].selected).toBe(HF_MINIMAX);
 const draft=selectVideoModels([need],prices,{offers,workflow:"draft-first",higgsfieldCreditUsd:.01});
 expect(draft.scenes[0].selected).toBe(HF_SEEDANCE);
 expect(draft.scenes[0].candidates.find(c=>c.model===HF_SEEDANCE)?.maximumUsdMicros).toBe(230000);
 expect(selectVideoModels([{...need,seconds:3}],prices,{offers,workflow:"draft-first"}).scenes[0].selected).toBe(HF_SEEDANCE);
});
it("does not interpret generic fal token or base prices as resolution-specific prices",()=>{
 const s=selectVideoModels([need],[...prices,{endpoint_id:SEEDANCE,unit_price:.01,unit:"tokens",currency:"USD"},{endpoint_id:MINIMAX,unit_price:.01,unit:"seconds",currency:"USD"}]);
 expect(s.scenes[0].candidates.filter(c=>[SEEDANCE,MINIMAX].includes(c.model)).every(c=>!c.eligible)).toBe(true);
 expect(parseVideoRequest(MINIMAX,{prompt:"Action",image_url:"https://example.com/start.png",duration:5,resolution:"768P",prompt_expansion_mode:"disabled"})).toMatchObject({duration:5});
 expect(()=>parseVideoRequest(MINIMAX,{prompt:"Action",image_url:"https://example.com/start.png",duration:5,resolution:"1080p",prompt_expansion_mode:"disabled"})).toThrow();
});
function fixture(cost=3,adjustments:Record<string,unknown>={},quoteReplies:unknown[]=[],pollReplies:Record<string,unknown>[]=[]){
 vi.stubEnv("PROVIDER_MODE","dryrun");
 const op:GenerationOperation={id:"scene-1-draft",fingerprint:"a".repeat(64),kind:"video",transport:"higgsfield-mcp",model:HF_SEEDANCE,scene:1,dependsOn:[],gates:[],bindings:{},input:{}};
 const payload={model:HF_SEEDANCE,prompt:"Small gesture",duration:5,resolution:"480p",draft:true,generate_audio:false,bitrate_mode:"standard",mode:"omni_reference",count:1,aspect_ratio:"auto",start_image_url:"https://v3.fal.media/start.png"};
 const cache=new Map<string,string>();
 const calls: {name:string;args:Record<string,unknown>}[]=[];
 const call:McpCall=async(name,args)=>{calls.push({name,args});const p=args.params as Record<string,unknown>;
  if(name==="media_import_url")return {structuredContent:{media_id:"imported-image"}};
  if(name==="generate_video")return {structuredContent:p.get_cost?(quoteReplies.shift()??{cost:{credits:cost},adjustments}):{results:[{id:"saved-draft-job",model:HF_SEEDANCE,type:"video"}]}};
  return {structuredContent:{jobs:[{job_id:"saved-draft-job",index:0,status:"completed",model:HF_SEEDANCE,type:"video",result_url:"https://cdn.higgsfield.ai/result.mp4",...pollReplies.shift()}]}};
 };
 return {op,payload,calls,queue:()=>higgsfieldVideoQueue(op,payload,"simulation",call,3,{read:async url=>cache.get(url)??null,save:async(url,id)=>{cache.set(url,id);}})};
}
it("persists the draft handle and original submission time; resumes without import, preflight or paid POST",async()=>{
 const f=fixture(),directory=await mkdtemp(path.join(os.tmpdir(),"cam-draft-"));
 try{
  const run=()=>advanceRequest({directory,fingerprint:f.op.fingerprint,queue:f.queue(),assertOwned:async()=>{}});
  const first=await run();expect(first.draftId).toBe("saved-draft-job");expect(first.submittedAt).toBeGreaterThan(0);
  expect((f.calls.find(c=>c.name==="generate_video"&&!(c.args.params as Record<string,unknown>).get_cost)!.args.params as Record<string,unknown>).medias).toEqual([{role:"start_image",value:"imported-image"}]);
  const count=f.calls.length;expect(await run()).toMatchObject({reused:true,draftId:first.draftId,submittedAt:first.submittedAt});expect(f.calls).toHaveLength(count);
 }finally{await rm(directory,{recursive:true,force:true});}
});
it("stops an increased exact price before marking a paid request as attempted",async()=>{
 const f=fixture(4),directory=await mkdtemp(path.join(os.tmpdir(),"cam-draft-"));
 try{
  await expect(advanceRequest({directory,fingerprint:f.op.fingerprint,queue:f.queue(),assertOwned:async()=>{}})).rejects.toThrow(/exceeds/);
  expect(await requestReceipts(directory)).toEqual([]);
  expect(f.calls.filter(c=>c.name==="generate_video"&&!(c.args.params as Record<string,unknown>).get_cost)).toHaveLength(0);
 }finally{await rm(directory,{recursive:true,force:true});}
});

it("rejects adjusted settings during the free estimate before any paid submission",async()=>{
 const f=fixture(3,{resolution:"720p"});
 await expect(f.queue().prepare!()).rejects.toThrow(/changed the requested settings/);
 expect(f.calls.filter(c=>c.name==="generate_video"&&!(c.args.params as Record<string,unknown>).get_cost)).toHaveLength(0);
});
it("uses only the quote for the exact reserved duration",()=>{
 const selection=selectVideoModels([need],prices,{offers:[...offers,{...offers[0],seconds:5,final:1}],higgsfieldCreditUsd:.01});
 expect(selection.scenes[0].candidates.find(c=>c.model===HF_SEEDANCE)?.maximumUsdMicros).toBe(200000);
});

const presetId="24bae836-2c4a-48e0-89b6-49fcc0b21612";
const presetOffer=(decline=presetId)=>({notice:{type:"preset_recommendation",data:{preset:{id:presetId,name:"Unrequested effect"},retry_literal_with:{declined_preset_id:decline}}}});
it("declines an unrelated preset in free preflight and submits only the priced literal scene",async()=>{
 const f=fixture(3,{},[presetOffer()]);const queue=f.queue();
 await queue.prepare!();
 const quotes=f.calls.filter(c=>c.name==="generate_video");expect(quotes).toHaveLength(2);
 expect(quotes.every(c=>(c.args.params as Record<string,unknown>).get_cost===true)).toBe(true);
 const original=quotes[0].args.params as Record<string,unknown>,literal=quotes[1].args.params as Record<string,unknown>;
 expect(literal).toEqual({...original,declined_preset_id:presetId});
 await queue.submit();
 expect(f.calls.at(-1)?.args.params).toEqual({...literal,get_cost:undefined});
 expect((f.calls.at(-1)?.args.params as Record<string,unknown>).model).toBe(HF_SEEDANCE);
});
it.each([presetOffer("00000000-0000-4000-8000-000000000000"),{notice:{type:"upgrade_required"}},{notice:{type:"preset_recommendation",data:{preset:{id:presetId},retry_literal_with:{declined_preset_id:presetId,model:"different"}}}}])("never submits on an unrecognized or inconsistent recommendation",async response=>{
 const f=fixture(3,{},[response]),queue=f.queue();await expect(queue.prepare!()).rejects.toThrow(/No animation was submitted/);
 await expect(queue.submit()).rejects.toThrow(/Prepare the exact/);
 expect(f.calls.filter(c=>c.name==="generate_video"&&!(c.args.params as Record<string,unknown>).get_cost)).toHaveLength(0);
});
it("keeps the price ceiling after declining a preset and bounds repeated notices",async()=>{
 for(const replies of [[presetOffer(),{cost:{credits:4}}],[presetOffer(),presetOffer()]]){
  const f=fixture(3,{},replies),queue=f.queue();await expect(queue.prepare!()).rejects.toThrow(/No animation was submitted/);
  expect(f.calls.filter(c=>c.name==="generate_video")).toHaveLength(2);
  await expect(queue.submit()).rejects.toThrow(/Prepare the exact/);
 }
});

it("tracks Seedance's mislabeled pending/failure without ever resubmitting the saved job",async()=>{
 const f=fixture(3,{},[],[{status:"in_progress",type:"image"},{status:"failed",type:"image"}]);
 const directory=await mkdtemp(path.join(os.tmpdir(),"cam-poll-"));
 try{
  const run=()=>advanceRequest({directory,fingerprint:f.op.fingerprint,queue:f.queue(),assertOwned:async()=>{}});
  expect((await run()).state).toBe("submitted");
  await expect(run()).rejects.toThrow(/original request failed/);
  expect(await requestReceipts(directory)).toEqual([expect.objectContaining({state:"failed",requestId:"saved-draft-job",failureReason:"failed"})]);
  await expect(run()).rejects.toThrow(/explicit new attempt/i);
  expect(f.calls.filter(c=>c.name==="generate_video"&&!(c.args.params as Record<string,unknown>).get_cost)).toHaveLength(1);
 }finally{await rm(directory,{recursive:true,force:true});}
});
it.each([{job_id:"other",status:"failed",type:"image"},{index:1,status:"failed"},{model:"other",status:"in_progress"},{status:"completed",type:"image"}])("rejects mismatched identity and nonvideo completed output",async response=>{
 const f=fixture(3,{},[],[response]);await expect(f.queue().poll("saved-draft-job")).rejects.toThrow();
 expect(f.calls).toHaveLength(1);
});
