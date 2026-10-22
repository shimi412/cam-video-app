import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({replay:vi.fn(),reserve:vi.fn(),settle:vi.fn(),failed:vi.fn(),uncertain:vi.fn(),rejected:vi.fn(),price:vi.fn()}));
vi.mock('../src/lib/credentials',()=>({openrouterKey:async()=> 'test-key-never-sent'}));
vi.mock('../src/lib/providers/mode',()=>({brainMode:()=> 'api'}));
vi.mock('../src/lib/providers/openrouter',async importOriginal=>({...await importOriginal<typeof import('../src/lib/providers/openrouter')>(),openrouterPrice:mocks.price}));
vi.mock('../src/lib/ai-usage',async importOriginal=>({...await importOriginal<typeof import('../src/lib/ai-usage')>(),recordRejectedAI:mocks.rejected,replayAI:mocks.replay,reserveAI:mocks.reserve,settleAI:mocks.settle,recordFailedAI:mocks.failed,uncertainAI:mocks.uncertain}));
import {claudeToolStep,canonicalAgentInput,type StepInput} from '../src/lib/agent/transport';
const input:StepInput={session:'video',turn:'request',step:0,model:'anthropic/claude-test',system:'CAM',messages:[{role:'user',content:'Original narration'}],tools:[{type:'function',function:{name:'submit_plan',description:'Submit a plan',parameters:{type:'object'}}}],remainingUsd:.25,maxOutputTokens:4000,minimumOutputTokens:1000};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CAM_LIVE_ENABLED','1');mocks.replay.mockResolvedValue(null);mocks.reserve.mockResolvedValue({replayed:false});mocks.price.mockResolvedValue({input:.000001,output:.000005,request:0,context:200000,id:input.model});});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
function response(finish='tool_calls'){return {id:'provider-receipt',model:input.model,choices:[{finish_reason:finish,message:{content:null,tool_calls:[{id:'one',type:'function',function:{name:'submit_plan',arguments:'{"title":"Original narration"}'}}]}}],usage:{prompt_tokens:20,completion_tokens:20,cost:.001}};}
it('sends native tool results and settles a received answer exactly once',async()=>{
 const fetch=vi.fn(async(_url,options)=>{const body=JSON.parse(options.body);expect(body).not.toHaveProperty("parallel_tool_calls");expect(body.provider.require_parameters).toBe(true);expect(body.tool_choice).toBe('required');expect(body.tools).toEqual(input.tools);return Response.json(response());});vi.stubGlobal('fetch',fetch);
 const result=await claudeToolStep(input);expect(result.message.tool_calls?.[0].id).toBe('one');expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({actualUsd:.001}));
 mocks.replay.mockResolvedValue({result});await claudeToolStep(input);expect(fetch).toHaveBeenCalledOnce();expect(mocks.price).toHaveBeenCalledOnce();
});
it('keeps a known truncation receipt and never retries it',async()=>{
 const fetch=vi.fn(async()=>Response.json(response('length')));vi.stubGlobal('fetch',fetch);
 await expect(claudeToolStep(input)).rejects.toThrow();expect(mocks.failed).toHaveBeenCalledWith(expect.objectContaining({failure:expect.objectContaining({code:'incomplete',receipt:expect.objectContaining({actualUsd:.001})})}));expect(fetch).toHaveBeenCalledOnce();expect(mocks.settle).not.toHaveBeenCalled();
});
it('stops before sending when previous submission is uncertain',async()=>{
 mocks.replay.mockRejectedValue(Error('Unconfirmed request'));const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 await expect(claudeToolStep(input)).rejects.toThrow('Unconfirmed');expect(fetch).not.toHaveBeenCalled();expect(mocks.reserve).not.toHaveBeenCalled();
});
it('marks an unknown network outcome without retrying or manufacturing a receipt',async()=>{
 const fetch=vi.fn(async()=>{throw Error('Network stopped');});vi.stubGlobal('fetch',fetch);
 await expect(claudeToolStep(input)).rejects.toThrow('Network');expect(mocks.uncertain).toHaveBeenCalledOnce();expect(mocks.settle).not.toHaveBeenCalled();expect(fetch).toHaveBeenCalledOnce();
});
it('enforces the remaining turn allowance before reserving',async()=>{
 vi.stubGlobal('fetch',vi.fn());await expect(claudeToolStep({...input,remainingUsd:.0001})).rejects.toThrow();expect(mocks.reserve).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
it('records malformed output with its known receipt instead of losing the cost',async()=>{const body={...response(),choices:[]};vi.stubGlobal('fetch',vi.fn(async()=>Response.json(body)));await expect(claudeToolStep(input)).rejects.toThrow();expect(mocks.failed).toHaveBeenCalledWith(expect.objectContaining({failure:expect.objectContaining({code:'invalid-output',receipt:expect.objectContaining({actualUsd:.001})})}));expect(mocks.uncertain).not.toHaveBeenCalled();});

it('retains a definitive routing rejection without treating it as unknown or resending',async()=>{const fetch=vi.fn(async()=>Response.json({error:{message:'No endpoints found that support the requested parameters'}},{status:404}));vi.stubGlobal('fetch',fetch);await expect(claudeToolStep(input)).rejects.toThrow('No endpoints');expect(mocks.rejected).toHaveBeenCalledWith(expect.any(String),404,expect.stringContaining('No endpoints'),'claude-tools-v4-effort');expect(mocks.uncertain).not.toHaveBeenCalled();expect(fetch).toHaveBeenCalledOnce();});

it('uses a stable persisted identity and forces plan submission after context collection',async()=>{expect(canonicalAgentInput({z:1,a:{b:2,a:1}})).toBe(canonicalAgentInput({a:{a:1,b:2},z:1}));const fetch=vi.fn(async(_u,o)=>{expect(JSON.parse(o.body).tool_choice).toEqual({type:'function',function:{name:'submit_plan'}});return Response.json(response());});vi.stubGlobal('fetch',fetch);await claudeToolStep({...input,identityVersion:2,requirePlan:true});const first=mocks.reserve.mock.calls[0][0];await claudeToolStep(Object.fromEntries(Object.entries({...input,identityVersion:2,requirePlan:true}).reverse()) as StepInput);expect(mocks.reserve.mock.calls[1][0].id).toBe(first.id);expect(mocks.reserve.mock.calls[1][0].hash).toBe(first.hash);});
it('compacts redundant history and fixed machinery without changing saved messages or scene code',async()=>{
 const {compactAgentMessages}=await import('../src/lib/agent/transport');const source='fixed machinery\n# ============================================================ A\nscene("sA", NAVY)';const messages:StepInput['messages']=[{role:'user',content:[{type:'text',text:JSON.stringify({currentRequest:JSON.stringify({script:'Exact narration',repair:{failedSource:source}})})}]},{role:'assistant',content:null,tool_calls:[{id:'h',type:'function',function:{name:'read_video_history',arguments:'{}'}}]},{role:'tool',tool_call_id:'h',content:JSON.stringify([{content:'old source'.repeat(2000)}])}];const before=JSON.stringify(messages);const out=compactAgentMessages(messages,'You write executable typographic films');expect(JSON.stringify(messages)).toBe(before);const p=JSON.parse(JSON.parse((out[0].content as {text:string}[])[0].text).currentRequest);expect(p.script).toBe('Exact narration');expect(p.repair.failedSource).toBe(source.slice(source.indexOf('# ===')));expect((out[2].content as string).length).toBeLessThan(1200);
});
it('adds explicit cache breakpoints only on the wire and only when enabled, keeping identity and saved messages',async()=>{
 const bodies:Record<string,unknown>[]=[];const fetch=vi.fn(async(_u:string,o:{body:string})=>{bodies.push(JSON.parse(o.body));return Response.json({...response(),usage:{prompt_tokens:20,completion_tokens:20,cost:.001,prompt_tokens_details:{cached_tokens:15,cache_write_tokens:0}}});});vi.stubGlobal('fetch',fetch);
 const rich:StepInput={...input,messages:[{role:'user',content:[{type:'text',text:'Request'},{type:'image_url',image_url:{url:'data:image/png;base64,AA=='}}]},{role:'assistant',content:null,tool_calls:[{id:'c',type:'function',function:{name:'read_skill',arguments:'{"id":"x"}'}}]},{role:'tool',tool_call_id:'c',content:'skill'}]};
 const before=JSON.stringify(rich.messages);
 await claudeToolStep(rich);
 vi.stubEnv('CAM_AGENT_PROMPT_CACHE','1');const result=await claudeToolStep(rich);
 expect(JSON.stringify(rich.messages)).toBe(before);
 expect(bodies[0].messages).toEqual([{role:'system',content:'CAM'},...rich.messages]);expect(bodies[0]).not.toHaveProperty('session_id');
 const cached=bodies[1].messages as {role:string;content:unknown}[];
 expect(cached[0]).toEqual({role:'system',content:[{type:'text',text:'CAM',cache_control:{type:'ephemeral'}}]});
 expect((cached[1].content as {cache_control?:unknown}[]).map(p=>Boolean(p.cache_control))).toEqual([false,true]);
 expect(cached[2]).toEqual(rich.messages[1]);expect(cached[3]).toEqual({role:'tool',tool_call_id:'c',content:[{type:'text',text:'skill',cache_control:{type:'ephemeral'}}]});expect(bodies[1].session_id).toBe('video');
 expect(mocks.reserve.mock.calls[0][0].hash).toBe(mocks.reserve.mock.calls[1][0].hash);
 expect(mocks.settle).toHaveBeenLastCalledWith(expect.objectContaining({usage:expect.objectContaining({cachedTokens:15,cacheWriteTokens:0})}));
 expect(result.message.tool_calls?.[0].id).toBe('one');
});
it('bounds later steps by the measured prefix of the same turn and records definitive request refusals',async()=>{
 const {boundInputTokens}=await import('../src/lib/agent/transport');
 const big=[{role:'user' as const,content:'x'.repeat(100000)},{role:'assistant' as const,content:null,tool_calls:[{id:'a',type:'function' as const,function:{name:'submit_plan',arguments:'{}'}}]},{role:'tool' as const,tool_call_id:'a',content:'{"accepted":false,"error":"fix"}'}];
 const loose=boundInputTokens('CAM',input.tools,big),exact=boundInputTokens('CAM',input.tools,big,{messages:1,promptTokens:30000});
 expect(loose).toBeGreaterThan(104000);expect(exact).toBeLessThan(31000);expect(exact).toBeGreaterThan(30000);
 expect(boundInputTokens('CAM',input.tools,big,{messages:5,promptTokens:30000})).toBe(loose);
 // A warm, verified cache prices the cached prefix at 0.1x; a cold one never does.
 const now=Date.now();
 expect(boundInputTokens('CAM',input.tools,big,{messages:1,promptTokens:30000,cachedTokens:29000,at:now-30000},true,now)).toBeLessThan(5000);
 expect(boundInputTokens('CAM',input.tools,big,{messages:1,promptTokens:30000,cachedTokens:29000,at:now-30000},false,now)).toBe(exact);
 expect(boundInputTokens('CAM',input.tools,big,{messages:1,promptTokens:30000,cachedTokens:29000,at:now-10*60000},true,now)).toBe(exact);
 expect(boundInputTokens('CAM',input.tools,big,{messages:1,promptTokens:30000,cachedTokens:0,cacheWriteTokens:29000,at:now-30000},true,now)).toBeLessThan(5000);
 const fetch=vi.fn(async()=>Response.json({error:{message:'Invalid cache_control block'}},{status:400}));vi.stubGlobal('fetch',fetch);
 await expect(claudeToolStep(input)).rejects.toThrow('Invalid cache_control');expect(mocks.rejected).toHaveBeenCalledWith(expect.any(String),400,expect.stringContaining('cache_control'),'claude-tools-v4-effort');expect(mocks.uncertain).not.toHaveBeenCalled();
});
it('takes the reasoning effort from configuration without changing the request identity',async()=>{
 const bodies:Record<string,{effort:string}>[]=[];vi.stubGlobal('fetch',vi.fn(async(_u:string,o:{body:string})=>{bodies.push(JSON.parse(o.body));return Response.json(response());}));
 await claudeToolStep(input);vi.stubEnv('CAM_MOTION_EFFORT','high');await claudeToolStep(input);vi.stubEnv('CAM_MOTION_EFFORT','nonsense');await claudeToolStep(input);
 expect(bodies.map(b=>(b.reasoning as {effort:string}).effort)).toEqual(['medium','high','medium']);
 expect(new Set(mocks.reserve.mock.calls.map(c=>c[0].hash)).size).toBe(1);
});
it('resends once with tool_choice auto when the provider refuses forced tool use, then remembers the model',async()=>{
 const model='anthropic/claude-auto-only-test';const choices:unknown[]=[];
 const fetch=vi.fn(async(_url:string,options:{body:string})=>{const body=JSON.parse(options.body);choices.push(body.tool_choice);if(body.tool_choice!=='auto')return Response.json({error:{message:'Provider returned error',code:400,metadata:{raw:'tool_choice: type "tool" and "any" are not supported for this model.'}}},{status:400});return Response.json({...response(),model});});
 vi.stubGlobal('fetch',fetch);mocks.price.mockResolvedValue({input:.000001,output:.000005,request:0,context:200000,id:model});
 const result=await claudeToolStep({...input,model});expect(result.message.tool_calls?.[0].id).toBe('one');
 expect(choices).toEqual(['required','auto']);expect(mocks.rejected).not.toHaveBeenCalled();expect(mocks.settle).toHaveBeenCalledOnce();
 await claudeToolStep({...input,model,turn:'next'});expect(choices).toEqual(['required','auto','auto']);
});
