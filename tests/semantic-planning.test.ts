import {beforeEach,afterEach,expect,it,vi} from "vitest";
const brain=vi.hoisted(()=>vi.fn());
vi.mock("../src/lib/providers/brain",()=>({requestBrainObject:brain}));
import {directSemanticConcept} from "../src/lib/concept/ai-direction";
import {resolveParams} from "../src/lib/brain";
import {getRecipe} from "../src/lib/recipes";
import {IMAGE_ENDPOINT} from "../src/lib/concept/generation-plan";
import {planConcept} from "../src/lib/concept/storyboard";
import {createStoryboardLaunch,verifyStoryboardLaunch,assertStoryboardLaunchQuote} from "../src/lib/concept/storyboard-launch";
const recipe=getRecipe("cam-clay")!;
const scene=(narration:string,index:number,idea="Compare the two claims")=>({index,narration,idea,boundaryReason:index===1?"Establish the complete argument":"The subject changes from the archive to justice",continuityKey:"argument",scene:"Three-quarter view of the locked clay narrator beside a balanced clay scale in an uncluttered miniature room. Both trays are visible in soft side light.",motion:"One small welcoming gesture, then hold.",references:["narrator"],endScene:null,overlay:null,strike:false,visualMode:"metaphor",metaphor:idea,stateChange:false,actionSeconds:4,breathBefore:.3});
beforeEach(()=>{brain.mockReset();vi.stubGlobal("fetch",vi.fn(()=>{throw new Error("No network permitted");}));});
afterEach(()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();});
it("uses one whole-script model request to group a question and answer as one idea, then persists that exact plan",async()=>{
 const script="Does one country control everything? No, this is a misleading claim.",params=resolveParams(script,"auto").params;
 expect(params.sceneNarrations).toHaveLength(2);
 brain.mockResolvedValue({scenes:[scene(script,1)]});
 const result=await directSemanticConcept(script,params,recipe);
 expect(brain).toHaveBeenCalledTimes(1);
 const request=brain.mock.calls[0][0];
 expect(JSON.parse(request.prompt)).toEqual({format:params.aspectRatio,script});
 expect(request.maxOutputTokens).toBe(16000);expect(request.minimumOutputTokens).toBe(10000);
 expect(request.system).toContain("First read the WHOLE script");
 expect(request.system).not.toContain("Keep their number, order and exact indices");
 expect(request.system).not.toContain("Only the supplied imageManifest may include");
 expect(result.sceneNarrations).toEqual([script]);expect(result.shotCount).toBe(1);
 expect(result.editorialPlan?.beats[0]).toMatchObject({idea:"Compare the two claims",narration:script});
 expect(result.concept?.imageCount).toBe(1);
 expect(planConcept(script,recipe,result.aspectRatio,result.sceneDirections,result.sceneNarrations).shots).toHaveLength(1);
 expect(params.sceneNarrations).toHaveLength(2); // immutable input / saved historical plans
});
it("can split one sentence at a real change of idea, rather than keeping a fixed sentence count",async()=>{
 const a="The archive preserves the past,",b="while the courtroom decides current disputes.",script=`${a} ${b}`;
 brain.mockResolvedValue({scenes:[scene(a,1,"Investigating history"),scene(b,2,"Present-day justice")]});
 const params=resolveParams(script,"auto").params;expect(params.sceneNarrations).toHaveLength(1);
 const result=await directSemanticConcept(script,params,recipe);
 expect(result.sceneNarrations).toEqual([a,b]);expect(result.shotCount).toBe(2);
});
it("keeps the Qatar/Israel comparison together with its directed composition",async()=>{
 const script="Meanwhile, Qatar has longstanding ties to the Muslim Brotherhood, an Islamist movement with extremist ideologies, and has poured billions into American universities, media, and lobbying far more than Israel.";
 brain.mockResolvedValue({scenes:[{...scene(script,1),scene:"A clay balance holds Qatar's flag on one tray and Israel's flag on the other. The locked narrator observes both from a three-quarter angle."}]});
 const result=await directSemanticConcept(script,resolveParams(script,"auto").params,recipe);
 expect(result.sceneNarrations).toEqual([script]);
 expect(result.sceneDirections?.[1].scene).toContain("Qatar's flag");expect(result.sceneDirections?.[1].scene).toContain("Israel's flag");
 expect(result.editorialPlan?.version).toBe("semantic-ideas-v1");
});
it.each(["missing words","dangling comparison","overlong shot","unavailable"])("stops an invalid semantic result (%s) before images, without an automatic retry or word-count fallback",async kind=>{
 const script=kind==="overlong shot"?Array.from({length:50},()=>"word").join(" ")+".":"One country spends more than another country. Context matters.";
 brain.mockResolvedValue(kind==="unavailable"?null:{scenes:kind==="missing words"?[scene("Context matters.",1)]:kind==="dangling comparison"?[scene("One country spends more than",1),scene("another country. Context matters.",2)]:[scene(script,1)]});
 await expect(directSemanticConcept(script,resolveParams(script,"auto").params,recipe)).rejects.toThrow();
 expect(brain).toHaveBeenCalledTimes(1);
});
it("validates output coverage even when model metadata claims a good editorial rationale",async()=>{
 const script="One country spends more than another country. Context matters.";
 brain.mockResolvedValue({scenes:[scene("One country spends less than another country. Context matters.",1)]});
 await expect(directSemanticConcept(script,resolveParams(script,"auto").params,recipe)).rejects.toThrow(/changed or omitted/);
});
it("allows a cheaper semantic composition within the initial allowance but never exceeds it silently",async()=>{
 const script="Does one country control everything? No, this is a misleading claim.",input={script,mode:"auto" as const};
 const options={secret:"offline-semantic-test-secret-at-least-32-characters",readImageUnitPrice:async()=>.15,readCustomerMultiplier:async()=>2};
 const launch=await createStoryboardLaunch(input,"actor",options),receipt=verifyStoryboardLaunch(launch.token,input,"actor",options);
 expect(receipt.version).toBe(3);
 const lines=[1,2,3].map(i=>({id:`scene-${i}-start`,kind:"image" as const,model:IMAGE_ENDPOINT,unit:"usd" as const,quantity:1,unitPrice:.15,maximum:150000,description:"Image"}));
 const quote={id:"a".repeat(64),plan:"b".repeat(64),scope:"storyboard" as const,createdAt:Date.now(),expiresAt:Date.now()+60000,lines,caps:{usd:450000,"higgsfield-credit":0},falBillingAvailable:false};
 expect(()=>assertStoryboardLaunchQuote(receipt,{...quote,lines:lines.slice(0,1),caps:{usd:150000,"higgsfield-credit":0}},{amountCents:100})).not.toThrow();
 expect(()=>assertStoryboardLaunchQuote(receipt,quote,{amountCents:100})).toThrow();
});

it("does not reject many short sentences before the model can group them by meaning",async()=>{
 const sentences=Array.from({length:40},(_,i)=>`Claim ${i+1}.`),script=sentences.join(" ");
 const params=resolveParams(script,"auto").params;
 expect(params.sceneNarrations!.length).toBeGreaterThan(36);
 const groups=Array.from({length:4},(_,i)=>sentences.slice(i*10,(i+1)*10).join(" "));
 brain.mockResolvedValue({scenes:groups.map((text,i)=>scene(text,i+1))});
 const launch=await createStoryboardLaunch({script,mode:"auto"},"actor",{secret:"offline-semantic-test-secret-at-least-32-characters",readImageUnitPrice:async()=>.15,readCustomerMultiplier:async()=>2});
 expect(launch.sceneCount).toBe(36);
 const result=await directSemanticConcept(script,params,recipe);
 expect(result.sceneNarrations).toEqual(groups);expect(result.shotCount).toBe(4);
 expect(brain).toHaveBeenCalledTimes(1);
});

it("preserves numbered source text exactly in a new semantic plan",async()=>{
 const script="1. Check the complete source before sharing.\n2. Read the surrounding context.";
 brain.mockResolvedValue({scenes:[scene(script,1)]});
 const result=await directSemanticConcept(script,resolveParams(script,"auto").params,recipe);
 expect(result.sceneNarrations).toEqual([script]);
});

it("completes missing transformation endpoints before saving or pricing a semantic plan",async()=>{
 const script="The same fabricated claim is repeated through different eras.";
 brain.mockResolvedValue({scenes:[{...scene(script,1),stateChange:true,motion:"The monster presses a seal into the clay, then lifts it to reveal the mark and holds.",endScene:null}]});
 const result=await directSemanticConcept(script,resolveParams(script,"auto").params,recipe);
 expect(result.sceneDirections![1].endScene).toContain("reveal");
 expect(result.concept?.imageCount).toBe(2);expect(result.sceneNarrations).toEqual([script]);expect(brain).toHaveBeenCalledTimes(1);
});
