import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {z} from "zod";
const mocks=vi.hoisted(()=>({key:vi.fn(),setting:vi.fn(),reserve:vi.fn(),replay:vi.fn(),settle:vi.fn(),failed:vi.fn(),uncertain:vi.fn()}));
vi.mock("../src/lib/credentials",()=>({openrouterKey:mocks.key}));
vi.mock("../src/lib/settings",()=>({getSetting:mocks.setting}));
vi.mock("../src/lib/providers/mode",()=>({brainMode:()=>"api"}));
vi.mock("../src/lib/ai-usage",()=>({AI_REQUEST_MAXIMUM_USD:.25,reserveAI:mocks.reserve,replayAI:mocks.replay,settleAI:mocks.settle,recordFailedAI:mocks.failed,uncertainAI:mocks.uncertain}));
import {budgetedOutputTokens,openrouterObject,type ModelPrice} from "../src/lib/providers/openrouter";
import {requestBrainObject,withBrainRequest} from "../src/lib/providers/brain";
import {AIResponseError} from "../src/lib/ai-response";
import {productionError} from "../src/lib/production-error";
const price:ModelPrice={id:"anthropic/claude-sonnet-5",input:.000002,output:.00001,request:0,context:1000000,modalities:["text"]};
const schema=z.object({scene:z.string()});
const input={schema,system:"Direct the film",messages:[{role:"user" as const,content:"A complete meaningful idea."}],price,inputTokens:20000,maximumUsd:.25,deep:true,maxOutputTokens:16000};
const receipt={id:"generation-fixture",model:price.id,choices:[{finish_reason:"length",message:{content:'{"scene":"unfinished'}}],usage:{prompt_tokens:6257,completion_tokens:5730,cost:.069814}};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("CAM_LIVE_ENABLED","1");mocks.key.mockResolvedValue("offline-test-key");mocks.setting.mockResolvedValue(null);mocks.reserve.mockResolvedValue({replayed:false});mocks.replay.mockResolvedValue(null);vi.stubGlobal("fetch",vi.fn(async(url:string)=>url.endsWith("/chat/completions")?Response.json(receipt):Response.json({data:{id:price.id,context_length:price.context,pricing:{prompt:price.input,completion:price.output},architecture:{input_modalities:price.modalities}}})));});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it("leaves room for reasoning AND the whole storyboard without raising the spending ceiling",()=>{
 expect(budgetedOutputTokens(price,30000,.25,16000,10000)).toBe(16000);
 const tokens=budgetedOutputTokens(price,50000,.25,16000,10000);
 expect(tokens).toBeGreaterThan(14000);expect(tokens).toBeLessThanOrEqual(15000);
 expect(50000*price.input+tokens*price.output).toBeLessThanOrEqual(.25);
 expect(()=>budgetedOutputTokens(price,100000,.25,16000,10000)).toThrow(/budget/);
 expect(budgetedOutputTokens({...price,context:32000},20000,.25,16000,10000)).toBe(12000);
 expect(()=>budgetedOutputTokens({...price,context:21000},20000,.25,16000,10000)).toThrow(/budget/);
 expect(budgetedOutputTokens({...price,output:0},20000,.25,16000,10000)).toBe(16000);
});
it.each(["partial","empty"])("keeps the receipt of a truncated %s response without a second request",async kind=>{
 vi.mocked(fetch).mockResolvedValue(Response.json({...receipt,choices:[{finish_reason:"length",message:{content:kind==="partial"?receipt.choices[0].message.content:null}}]}));
 const error=await openrouterObject(input).catch(e=>e);
 expect(error).toBeInstanceOf(AIResponseError);
 expect(error.failure).toEqual({kind:"ai-response-failure-v1",code:"incomplete",finishReason:"length",receipt:{model:price.id,actualUsd:.069814,usage:{inputTokens:6257,outputTokens:5730,requestId:receipt.id}}});
 expect(JSON.stringify(error.failure)).not.toContain("unfinished");
 expect(productionError(error)).toContain("scene plan was interrupted");
 expect(productionError(error)).not.toMatch(/Claude|OpenRouter|5730/);
 expect(fetch).toHaveBeenCalledTimes(1);
});
it.each(['not json','{"scene":42}'])("records a received invalid answer without losing its cost",async content=>{
 vi.mocked(fetch).mockResolvedValue(Response.json({...receipt,choices:[{finish_reason:"stop",message:{content}}]}));
 const error=await openrouterObject(input).catch(e=>e);
 expect(error.failure.code).toBe("invalid-output");expect(error.failure.receipt.actualUsd).toBe(.069814);expect(fetch).toHaveBeenCalledTimes(1);
});
it("settles a complete validated answer normally",async()=>{
 vi.mocked(fetch).mockResolvedValue(Response.json({...receipt,choices:[{finish_reason:"stop",message:{content:'{"scene":"complete"}'}}]}));
 expect(await openrouterObject(input)).toMatchObject({object:{scene:"complete"},actualUsd:.069814});
});
it("sends the larger affordable allowance once and persists known truncation instead of losing the receipt",async()=>{
 await expect(withBrainRequest({requestId:"offline-request"},()=>requestBrainObject({schema,prompt:"Whole script",maxOutputTokens:16000,minimumOutputTokens:10000}))).rejects.toBeInstanceOf(AIResponseError);
 const posts=vi.mocked(fetch).mock.calls.filter(([,o])=>o?.method==="POST");expect(posts).toHaveLength(1);
 expect(JSON.parse(String(posts[0][1]!.body))).toMatchObject({max_tokens:16000,reasoning:{effort:"medium",exclude:true}});
 expect(mocks.failed).toHaveBeenCalledWith(expect.objectContaining({failure:expect.objectContaining({code:"incomplete",receipt:expect.objectContaining({actualUsd:.069814})})}));
 expect(mocks.settle).not.toHaveBeenCalled();expect(mocks.uncertain).not.toHaveBeenCalled();
});
it("keeps an actual transport failure uncertain and never retries",async()=>{
 vi.mocked(fetch).mockRejectedValue(new Error("network interrupted"));
 // Price is cached by the preceding planning call; the only request is inference.
 await expect(withBrainRequest({requestId:"offline-network"},()=>requestBrainObject({schema,prompt:"Whole script",maxOutputTokens:16000,minimumOutputTokens:10000}))).rejects.toThrow("network interrupted");
 expect(fetch).toHaveBeenCalledTimes(1);expect(mocks.uncertain).toHaveBeenCalledOnce();expect(mocks.failed).not.toHaveBeenCalled();
});

it("reuses a settled answer even when external prices are unavailable",async()=>{
 mocks.replay.mockResolvedValue({result:{scene:"already received"}});
 vi.mocked(fetch).mockRejectedValue(new Error("pricing service unavailable"));
 expect(await withBrainRequest({requestId:"offline-replay"},()=>requestBrainObject({schema,prompt:"Whole script"}))).toEqual({scene:"already received"});
 expect(fetch).not.toHaveBeenCalled();expect(mocks.reserve).not.toHaveBeenCalled();expect(mocks.settle).not.toHaveBeenCalled();
});
