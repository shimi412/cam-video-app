import { expect, it, vi } from "vitest";
import { selectVideoModels, KLING_PRO, KLING_STANDARD, KLING_TURBO, HF_SEEDANCE, selectedModels, type SceneNeeds, type ModelPrice, type SelectionOptions } from "../src/lib/concept/model-selection";
import { generationPlan, materializeRequest, IMAGE_ENDPOINT } from "../src/lib/concept/generation-plan";
import { priceCamPlan, renewCamQuote } from "../src/lib/providers/cam-pricing";
import { ALIGNMENT_ENDPOINT } from "../src/lib/concept/transcription";
import { resolveParams } from "../src/lib/brain";
import { planConcept } from "../src/lib/concept/storyboard";
import { getRecipe } from "../src/lib/recipes";
import { placeholderTiming, measuredPhraseTiming } from "../src/lib/concept/timing";
import { falQueue } from "../src/lib/concept/provider-transports";

const need:SceneNeeds={operation:"scene-1-clip",scene:1,seconds:5,endFrame:false,complex:false,localText:true};
const prices=[{endpoint_id:KLING_PRO,unit_price:.14,unit:"seconds",currency:"USD"},{endpoint_id:KLING_STANDARD,unit_price:.084,unit:"seconds",currency:"USD"},{endpoint_id:KLING_TURBO,unit_price:.1,unit:"seconds",currency:"USD"}];
it("chooses the cheapest compatible engine without lowering the requested resolution",()=>{
 expect(selectVideoModels([need],prices).scenes[0].selected).toBe(KLING_TURBO);
 expect(selectVideoModels([need],prices,{minimumResolution:"720p"}).scenes[0].selected).toBe(KLING_STANDARD);
 expect(selectVideoModels([{...need,complex:true,endFrame:true}],prices,{minimumResolution:"720p"}).scenes[0].selected).toBe(KLING_PRO);
 expect(selectVideoModels([{...need,endFrame:true}],prices).scenes[0].selected).toBe(KLING_PRO);
});
it("does not treat missing, duplicated, wrong-unit or invalid prices as a bargain",()=>{
 for(const bad of [{...prices[1],unit:"videos"},{...prices[1],unit_price:NaN},{...prices[1],currency:"EUR"}]){
  expect(selectVideoModels([need],[prices[0],bad],{minimumResolution:"720p"}).scenes[0].selected).toBe(KLING_PRO);
 }
 expect(selectVideoModels([need],[prices[0],prices[1],prices[1]],{minimumResolution:"720p"}).scenes[0].selected).toBe(KLING_PRO);
 expect(()=>selectVideoModels([need],[])).toThrow(/no eligible/);
 expect(()=>selectVideoModels([{...need,seconds:16}],prices)).toThrow(/split/);
});
it("never substitutes an approved model on price renewal",()=>{
 const options:import("../src/lib/concept/model-selection").SelectionOptions={minimumResolution:"720p" as const,lockedModels:{[need.operation]:KLING_STANDARD}};
 expect(selectVideoModels([need],[prices[0],{...prices[1],unit_price:2}],options).scenes[0].selected).toBe(KLING_STANDARD);
 expect(()=>selectVideoModels([need],[prices[0]],options)).toThrow(/no eligible/);
 expect(()=>selectVideoModels([need],prices,{lockedModels:{}})).toThrow(/missing/);
});
function fixture(){
 const script="Context can change everything.", {params}=resolveParams(script,"auto");
 const board=planConcept(script,getRecipe("cam-clay")!,params.aspectRatio);
 Object.assign(board.shots[0],{references:["narrator"],visualMode:"presenter-text",stateChange:false,endScene:null,endImagePrompt:null,actionSeconds:5});
 const references=["narrator","monster","effigy"].map(id=>({id,url:`/${id}.png`,sha256:"a".repeat(64), characterSheet:{status:"approved",sha256:"a".repeat(64),approvedAt:"2026-10-14"}}));
 const timing=placeholderTiming([script]);
 return {script,params,board,references,timing,plan:generationPlan(script,params,board,timing,references)};
}
it("quotes without generation; binds chosen model and ceiling into the approved quote",async()=>{
 const f=fixture();
 const fal=vi.fn(async(url:string,init:{method:string})=>{
  expect(init.method).toBe("GET");expect(url).not.toContain("queue.fal.run");
  if(url.includes("billing-events"))return {billing_events:[]};
  return {prices:[...prices,{endpoint_id:IMAGE_ENDPOINT,unit_price:.15,unit:"images",currency:"USD"},{endpoint_id:ALIGNMENT_ENDPOINT,unit_price:.0008,unit:"compute seconds",currency:"USD"}]};
 });
 const higgsfield=vi.fn(async(name:string,args:Record<string,unknown>)=>{expect(name).toBe("generate_audio");expect(args.params).toMatchObject({get_cost:true,use_unlim:false});return {structuredContent:{cost:{credits:.45}}};});
 const quote=await priceCamPlan(f.plan,{fal,higgsfield},100,{minimumResolution:"720p"});
 expect(quote.lines.find(l=>l.kind==="video")).toMatchObject({model:KLING_STANDARD,quantity:5,maximum:420_000});
 expect(quote.selection?.scenes[0].localText).toBe(true);
 const routed=generationPlan(f.script,f.params,f.board,f.timing,f.references,undefined,selectedModels(quote.lines));
 expect(routed.operations.find(op=>op.kind==="video")?.model).toBe(KLING_STANDARD);
 expect(routed.operations.find(op=>op.kind==="voice")?.fingerprint).toBe(f.plan.operations[0].fingerprint);
 expect(routed.fingerprint).not.toBe(f.plan.fingerprint);
 expect(()=>renewCamQuote(quote,{...quote,lines:quote.lines.map(l=>l.kind==="video"?{...l,model:KLING_PRO}:l)},new Set())).toThrow(/model changed/);
});
it("sends Turbo's actual input contract and refuses to drop a required end frame",async()=>{
 const f=fixture(),plan=generationPlan(f.script,f.params,f.board,f.timing,f.references,undefined,{"scene-1-clip":KLING_TURBO});
 const op=plan.operations.find(op=>op.kind==="video")!;
 const input=materializeRequest(op,{"output:scene-1-start":"https://example.com/start.png"});
 expect(input).toMatchObject({image_url:"https://example.com/start.png",duration:"5"});
 expect(input).not.toHaveProperty("generate_audio");expect(input).not.toHaveProperty("start_image_url");
 vi.stubEnv("PROVIDER_MODE","dryrun");
 try{
  const request=vi.fn(async(url:string,init:{method:string;body?:string})=>{expect(url).toBe(`https://queue.fal.run/${KLING_TURBO}`);expect(JSON.parse(init.body!)).toEqual(input);return {request_id:"test"};});
  await falQueue(op,input,"simulation",request).submit();expect(request).toHaveBeenCalledTimes(1);
 }finally{vi.unstubAllEnvs();}
 expect(()=>materializeRequest({...op,bindings:{...op.bindings,end_image_url:"output:end"}},{"output:scene-1-start":"https://example.com/start.png","output:end":"https://example.com/end.png"})).toThrow(/end frame/);
});

it("quotes and requests a supported four-second draft for a three-second gesture",async()=>{
 const f=fixture();f.board.shots[0].actionSeconds=3;
 const short=generationPlan(f.script,f.params,f.board,f.timing,f.references);
 const fal=vi.fn(async(url:string)=>url.includes("billing-events")?{billing_events:[]}:{prices:[...prices,{endpoint_id:IMAGE_ENDPOINT,unit_price:.15,unit:"images",currency:"USD"},{endpoint_id:ALIGNMENT_ENDPOINT,unit_price:.0008,unit:"compute seconds",currency:"USD"}]});
 const higgsfield=vi.fn(async(_name:string,args:Record<string,unknown>)=>{expect(args.params).toMatchObject({get_cost:true});return {structuredContent:{cost:{credits:1}}};});
 const quote=await priceCamPlan(short,{fal,higgsfield},100,{workflow:"draft-first",lockedModels:{"scene-1-clip":HF_SEEDANCE}});
 expect(quote.selection?.scenes[0].selected).toBe(HF_SEEDANCE);
 const videoQuotes=higgsfield.mock.calls.filter(([name])=>name==="generate_video");
 expect(videoQuotes.length).toBeGreaterThan(0);
 expect(videoQuotes.every(([,args])=>(args.params as Record<string,unknown>).duration===4)).toBe(true);
 const routed=generationPlan(f.script,f.params,f.board,f.timing,f.references,undefined,selectedModels(quote.lines));
 expect(routed.operations.find(op=>op.kind==="video")?.input.duration).toBe("4");
 expect(f.board.shots[0].actionSeconds).toBe(3);
 const aligned={...short,timingBasis:"reviewed-voice-alignment" as const};
 await priceCamPlan(aligned,{fal,higgsfield},100,{workflow:"draft-first",lockedModels:{"scene-1-clip":HF_SEEDANCE}});
 expect(higgsfield.mock.calls.some(([name,args])=>name==="generate_video"&&(args.params as Record<string,unknown>).duration===4)).toBe(true);
});

function durationProviders(extraPrices:ModelPrice[]=[],voiceCredits=.45){
 const fal=vi.fn(async(url:string,init:{method:string})=>{
  expect(init.method).toBe("GET");expect(url).not.toContain("queue.fal.run");
  return url.includes("billing-events")?{billing_events:[]}:{prices:[...prices,...extraPrices,{endpoint_id:IMAGE_ENDPOINT,unit_price:.15,unit:"images",currency:"USD"},{endpoint_id:ALIGNMENT_ENDPOINT,unit_price:.0008,unit:"compute seconds",currency:"USD"}]};
 });
 const higgsfield=vi.fn(async(name:string,args:Record<string,unknown>)=>{
  expect(["generate_audio","generate_video"]).toContain(name);
  const params=args.params as Record<string,unknown>;
  expect(params).toMatchObject({get_cost:true,use_unlim:false});
  return {structuredContent:{cost:{credits:name==="generate_audio"?voiceCredits:Number(params.duration)*(params.draft?3:16)}}};
 });
 return {fal,higgsfield};
}

it("prices mixed scene lengths for both draft and completion using the actual supported request durations",async()=>{
 const f=fixture(),script="First scene.\nSecond scene.\nThird scene.";
 const board=planConcept(script,getRecipe("cam-clay")!,f.params.aspectRatio);
 for(const [index,shot] of board.shots.entries())Object.assign(shot,{references:["narrator"],visualMode:"presenter-text",stateChange:false,endScene:null,endImagePrompt:null,actionSeconds:[3,5,8][index]});
 const timing=placeholderTiming(board.shots.map(shot=>shot.narration));
 const plan=generationPlan(script,f.params,board,timing,f.references);
 const providers=durationProviders();
 const quote=await priceCamPlan(plan,providers,100,{workflow:"draft-first",lockedModels:Object.fromEntries(plan.modelNeeds.map(need=>[need.operation,HF_SEEDANCE]))});
 const routed=generationPlan(script,f.params,board,timing,f.references,undefined,selectedModels(quote.lines));
 const expected=[4,5,8];
 for(const [index,seconds] of expected.entries()){
  const id=`scene-${index+1}`;
  expect(quote.lines.find(line=>line.id===`${id}-draft`)).toMatchObject({model:HF_SEEDANCE,maximum:seconds*3e6});
  expect(quote.lines.find(line=>line.id===`${id}-clip`)).toMatchObject({model:HF_SEEDANCE,maximum:seconds*16e6});
  const op=routed.operations.find(operation=>operation.id===`${id}-clip`)!;
  const request=materializeRequest({...op,input:{...op.input,draft:true}},{[`output:${id}-start`]:"https://example.com/start.png"});
  expect(request).toMatchObject({duration:seconds,draft:true,resolution:"480p"});
 }
 expect(quote.caps["higgsfield-credit"]).toBe(323_450_000);
 const quotedDurations=providers.higgsfield.mock.calls.filter(([name])=>name==="generate_video").map(([,args])=>(args.params as Record<string,unknown>).duration);
 expect([...new Set(quotedDurations)].sort((a,b)=>Number(a)-Number(b))).toEqual(expected);
 expect(quotedDurations).not.toContain(15);
});

it("keeps explicit action lengths and their quote stable after a slower recording is aligned",async()=>{
 const f=fixture(),providers=durationProviders();
 const before=await priceCamPlan(f.plan,providers,100,{workflow:"draft-first"});
 const timing=measuredPhraseTiming([f.script],[12]);timing.estimated=false;
 const aligned=generationPlan(f.script,f.params,f.board,timing,f.references,{audioSha256:"b".repeat(64),alignmentSha256:"c".repeat(64),source:"reviewed"});
 const after=await priceCamPlan(aligned,providers,100,{workflow:"draft-first"});
 expect(aligned.timingBasis).toBe("reviewed-voice-alignment");
 expect(aligned.operations.find(op=>op.kind==="video")?.input.duration).toBe("5");
 expect(after.lines.filter(line=>line.kind==="video").map(line=>line.maximum)).toEqual(before.lines.filter(line=>line.kind==="video").map(line=>line.maximum));
});

it("deduplicates provider duration offers when three- and four-second scenes share the same four-second minimum",async()=>{
 const f=fixture(),script="First scene.\nSecond scene.";
 const board=planConcept(script,getRecipe("cam-clay")!,f.params.aspectRatio);
 for(const [index,shot] of board.shots.entries())Object.assign(shot,{references:["narrator"],stateChange:false,endScene:null,endImagePrompt:null,actionSeconds:index+3});
 const plan=generationPlan(script,f.params,board,placeholderTiming(board.shots.map(shot=>shot.narration)),f.references);
 const providers=durationProviders();
 const quote=await priceCamPlan(plan,providers,100,{workflow:"draft-first",lockedModels:Object.fromEntries(plan.modelNeeds.map(need=>[need.operation,HF_SEEDANCE]))});
 expect(quote.selection?.scenes.map(scene=>scene.selected)).toEqual([HF_SEEDANCE,HF_SEEDANCE]);
 const seedanceQuotes=providers.higgsfield.mock.calls.filter(([name,args])=>name==="generate_video"&&(args.params as Record<string,unknown>).model===HF_SEEDANCE);
 expect(seedanceQuotes).toHaveLength(2);
 expect(seedanceQuotes.every(([,args])=>(args.params as Record<string,unknown>).duration===4)).toBe(true);
});

it("keeps a legacy scene's planned clip length when its recording is longer",async()=>{
 const f=fixture();delete f.board.shots[0].actionSeconds;
 f.board.shots[0].clipSeconds=6;
 const before=generationPlan(f.script,f.params,f.board,f.timing,f.references);
 const timing=measuredPhraseTiming([f.script],[12]);timing.estimated=false;
 const after=generationPlan(f.script,f.params,f.board,timing,f.references,{audioSha256:"b".repeat(64),alignmentSha256:"c".repeat(64),source:"reviewed"});
 expect(before.operations.find(op=>op.kind==="video")?.input.duration).toBe("6");
 expect(after.operations.find(op=>op.kind==="video")?.input.duration).toBe("6");
 const quote=await priceCamPlan(before,durationProviders(),100,{workflow:"draft-first",lockedModels:{"scene-1-clip":HF_SEEDANCE}});
 expect(quote.lines.find(line=>line.id==="scene-1-draft")?.maximum).toBe(18_000_000);
 expect(quote.lines.find(line=>line.id==="scene-1-clip")?.maximum).toBe(96_000_000);
});

it("does not quote video operations for an imported scene",async()=>{
 const f=fixture();
 f.params.sceneMedia={1:{id:"5462d54d-39a2-48a5-84c5-052c718f6ca5",kind:"video",sha256:"b".repeat(64),width:1080,height:1920,duration:5}};
 const plan=generationPlan(f.script,f.params,f.board,f.timing,f.references);
 const providers=durationProviders();
 const quote=await priceCamPlan(plan,providers,100,{workflow:"draft-first"});
 expect(quote.lines.some(line=>line.kind==="video"||line.kind==="image")).toBe(false);
 expect(providers.higgsfield.mock.calls.some(([name])=>name==="generate_video")).toBe(false);
 const storyboardProviders=durationProviders();
 const storyboard=await priceCamPlan(plan,storyboardProviders,100,{scope:"storyboard"});
 expect(storyboard.lines).toEqual([]);
 expect(storyboard.caps).toEqual({usd:0,"higgsfield-credit":0});
 expect(storyboardProviders.higgsfield).not.toHaveBeenCalled();
});


it("prefers Kling for compatible draft-first scenes even with an end frame and a cheaper Seedance offer",()=>{
 const result=selectVideoModels([{...need,endFrame:true}],prices,{workflow:"draft-first",higgsfieldCreditUsd:.05,offers:[{model:HF_SEEDANCE,resolution:"1080p",seconds:5,unit:"higgsfield-credit",final:1,draft:1}]});
 expect(result.scenes[0].selected).toBe(KLING_PRO);
 const kling=result.scenes[0].candidates.find(candidate=>candidate.model===KLING_PRO)!;
 expect(kling).toMatchObject({eligible:true,maximumUsdMicros:1_120_000});
 expect(kling.final).toBeCloseTo(.7);expect(kling.draft).toBeCloseTo(.42);
 expect(result.scenes[0].candidates.find(candidate=>candidate.model===KLING_TURBO)?.eligible).toBe(false);
});

it("routes complex draft-first scenes to Seedance and preserves an already approved model",()=>{
 const options={workflow:"draft-first" as const,higgsfieldCreditUsd:.05,offers:[{model:HF_SEEDANCE,resolution:"1080p",seconds:5,unit:"higgsfield-credit" as const,final:80,draft:15}]};
 expect(selectVideoModels([{...need,complex:true,endFrame:true}],prices,options).scenes[0].selected).toBe(HF_SEEDANCE);
 expect(selectVideoModels([need],prices,{...options,lockedModels:{[need.operation]:HF_SEEDANCE}}).scenes[0].selected).toBe(HF_SEEDANCE);
 expect(selectVideoModels([{...need,complex:true,endFrame:true}],prices,{...options,lockedModels:{[need.operation]:KLING_PRO}}).scenes[0].selected).toBe(KLING_PRO);
 expect(()=>selectVideoModels([{...need,complex:true}],prices,{workflow:"draft-first"})).toThrow(/no eligible/);
});

it("requires a valid Standard per-second price before offering a Kling draft-first workflow",()=>{
 for(const invalid of [{...prices[1],unit:"videos"},{...prices[1],currency:"EUR"},{...prices[1],unit_price:NaN},{...prices[1],unit_price:-1}]){
  expect(()=>selectVideoModels([need],[prices[0],invalid],{workflow:"draft-first"})).toThrow(/no eligible/);
 }
 expect(()=>selectVideoModels([need],[prices[0]],{workflow:"draft-first"})).toThrow(/no eligible/);
 expect(()=>selectVideoModels([need],[...prices,prices[1]],{workflow:"draft-first"})).toThrow(/no eligible/);
});

it("prices both Kling stages by actual seconds and includes each only once",async()=>{
 const f=fixture(),providers=durationProviders();
 const quote=await priceCamPlan(f.plan,providers,100,{workflow:"draft-first"});
 expect(quote.scope).toBe("production");
 expect(quote.lines.find(line=>line.id==="scene-1-draft")).toMatchObject({model:KLING_STANDARD,billing:"seconds",quantity:5,seconds:5,unit:"usd",unitPrice:.084,maximum:420_000});
 expect(quote.lines.find(line=>line.id==="scene-1-clip")).toMatchObject({model:KLING_PRO,billing:"seconds",quantity:5,seconds:5,unit:"usd",unitPrice:.14,maximum:700_000});
 expect(quote.lines.filter(line=>line.kind==="video")).toHaveLength(2);
 expect(quote.caps.usd).toBe(2_270_000);
 expect(selectedModels(quote.lines)).toEqual({"scene-1-clip":KLING_PRO});
});

it("quotes only images before storyboard approval without requesting voice or video prices",async()=>{
 const f=fixture();
 Object.assign(f.board.shots[0],{endScene:"Final frame",endImagePrompt:"Final frame"});
 const plan=generationPlan(f.script,f.params,f.board,f.timing,f.references);
 const providers=durationProviders();
 const quote=await priceCamPlan(plan,providers,100,{scope:"storyboard",workflow:"draft-first"});
 expect(quote.scope).toBe("storyboard");
 expect(quote.selection).toBeUndefined();
 expect(quote.lines.map(line=>line.id)).toEqual(["scene-1-start","scene-1-end"]);
 expect(quote.lines.every(line=>line.kind==="image")).toBe(true);
 expect(quote.caps).toEqual({usd:300_000,"higgsfield-credit":0});
 expect(providers.higgsfield).not.toHaveBeenCalled();
 expect(providers.fal).toHaveBeenCalledTimes(1);
 const [url,init]=providers.fal.mock.calls[0];
 expect(init.method).toBe("GET");
 expect(new URL(url).searchParams.getAll("endpoint_id")).toEqual([IMAGE_ENDPOINT]);
});

it("expands the approved storyboard budget to production while preserving attempted images exactly once",async()=>{
 const f=fixture(),providers=durationProviders();
 const first=await priceCamPlan(f.plan,providers,100,{scope:"storyboard"});
 const full=await priceCamPlan(f.plan,providers,200,{workflow:"draft-first"});
 const changed={...full,lines:full.lines.map(line=>line.kind==="image"?{...line,unitPrice:.2,maximum:200_000}:line)};
 const expanded=renewCamQuote(first,changed,new Set(["scene-1-start"]));
 expect(expanded.scope).toBe("production");
 expect(expanded.selection?.workflow).toBe("draft-first");
 expect(expanded.lines.find(line=>line.id==="scene-1-start")).toEqual(first.lines[0]);
 expect(expanded.lines.filter(line=>line.id==="scene-1-start")).toHaveLength(1);
 expect(expanded.caps.usd).toBe(full.caps.usd);
 expect(()=>renewCamQuote(first,{...full,plan:"a".repeat(64)},new Set())).toThrow(/different production/);
 expect(()=>renewCamQuote(full,first,new Set())).toThrow(/workflow/);
});

it("Whimsical prices Kling once and reuses local text scenes without a video request",async()=>{
 const f=fixture();
 const local=generationPlan(f.script,{...f.params,productionMethod:"whimsical-v1"},f.board,f.timing,f.references);
 expect(local.operations.filter(op=>op.kind==="image")).toHaveLength(1);
 expect(local.operations.filter(op=>op.kind==="video")).toHaveLength(0);
 expect(local.modelNeeds).toHaveLength(0);
 const quote=await priceCamPlan(f.plan,durationProviders(),100,{workflow:"whimsical",lockedModels:{"scene-1-clip":KLING_PRO}});
 expect(quote.lines.filter(l=>l.kind==="video")).toHaveLength(1);
 expect(quote.lines.find(l=>l.kind==="video")?.id).toBe("scene-1-clip");
 expect(quote.selection?.workflow).toBe("whimsical");
 const seedance=await priceCamPlan(f.plan,durationProviders(),100,{workflow:"whimsical",lockedModels:{"scene-1-clip":HF_SEEDANCE}});
 expect(seedance.lines.filter(l=>l.kind==="video").map(l=>l.id)).toEqual(["scene-1-draft","scene-1-clip"]);
});

it('prices an explicitly requested new clip while preserving existing model locks',()=>{
 const newNeed={...need,scene:3,operation:'scene-3-clip'};
 const options:SelectionOptions={lockedModels:{[need.operation]:KLING_STANDARD},newOperations:[newNeed.operation],minimumResolution:'720p' as const};
 const selected=selectVideoModels([need,newNeed],prices,options);
 expect(selected.scenes[0].selected).toBe(KLING_STANDARD);
 expect(selected.scenes[1].operation).toBe(newNeed.operation);
 expect(()=>selectVideoModels([need,newNeed,{...newNeed,operation:'scene-9-clip',scene:9}],prices,options)).toThrow(/missing/);
 expect(()=>selectVideoModels([need,newNeed],prices.filter(p=>p.endpoint_id!==KLING_STANDARD),options)).toThrow(/no eligible/);
});
