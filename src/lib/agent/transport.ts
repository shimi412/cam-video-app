import {z} from 'zod';
import {openrouterKey} from '../credentials';
import {brainMode} from '../providers/mode';
import {budgetedOutputTokens,openrouterPrice} from '../providers/openrouter';
import {replayAI,reserveAI,settleAI,recordFailedAI,uncertainAI,recordRejectedAI,recordTransientAI,AIHttpRejection} from '../ai-usage';
/** The provider did not run the request (rate limit, overload, gateway error). Retryable. */
export class AIHttpTransient extends Error{constructor(public status:number,public detail:string){super(`The writing service is temporarily unavailable (HTTP ${status}): ${detail}`);}}
import {AIResponseError} from '../ai-response';
import {createHash} from 'node:crypto';
/** Models that only accept tool_choice 'auto' (learned from a 400 in this process). */
export const autoOnlyModels=new Set<string>();
export type ToolCall={id:string;type:'function';function:{name:string;arguments:string}};
export type AgentMessage={role:'user'|'assistant'|'tool';content:string|null|{type:string;text?:string;image_url?:{url:string}}[];tool_calls?:ToolCall[];tool_call_id?:string};
export type AgentTool={type:'function';function:{name:string;description:string;parameters:unknown}};
export type StepInput={/** Reasoning effort for this turn; defaults to the Motion knob. */effort?:'low'|'medium'|'high';/** Caps the model's hidden reasoning so a long answer cannot be truncated by its own thinking (Fable wrote 32,000 tokens and lost the whole plan on 2026-10-21). */reasoningMaxTokens?:number;identityVersion?:2;requirePlan?:boolean;session:string;turn:string;step:number;model:string;system:string;messages:AgentMessage[];tools:AgentTool[];remainingUsd:number;maxOutputTokens:number;minimumOutputTokens:number;jobId?:string;conversationId?:string;measured?:{messages:number;promptTokens:number;cachedTokens?:number;cacheWriteTokens?:number;at?:number}};
export type StepResult={message:AgentMessage;actualUsd:number;promptTokens?:number;cachedTokens?:number;cacheWriteTokens?:number};
export type AgentTransport=(input:StepInput)=>Promise<StepResult>;
const ResponseSchema=z.object({id:z.string(),model:z.string(),choices:z.array(z.object({finish_reason:z.string(),message:z.object({content:z.string().nullable(),tool_calls:z.array(z.object({id:z.string(),type:z.literal('function'),function:z.object({name:z.string(),arguments:z.string()})})).optional()})})).length(1),usage:z.object({prompt_tokens:z.number().nonnegative(),completion_tokens:z.number().nonnegative(),cost:z.number().finite().nonnegative()})});
/** One ledger entry per tool-loop step. Unknown outcomes are never resubmitted. */
export const claudeToolStep:AgentTransport=async(input)=>{
 if(brainMode()!=='api'||process.env.CAM_LIVE_ENABLED!=='1')throw Error('The connected agent is disabled.');
 if(!input.model.startsWith('anthropic/claude-'))throw Error('The CAM agent requires Claude.');
 const encoded=input.identityVersion===2?canonicalAgentInput(input):JSON.stringify(input);
 const hash=createHash('sha256').update(encoded).digest('hex');
 const id=`${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
 // Optional explicit prompt caching (Anthropic cache_control breakpoints via
 // OpenRouter). The stable prefix of a tool loop is the system prompt and the
 // first request; later steps then pay cache reads instead of full input.
 // Identity, reservation bound and the saved messages are unchanged: the
 // breakpoints exist only on the wire. Off until verified on a live turn. A
 // definitive rejection of one wire version can be retried under the other.
 const cache=process.env.CAM_AGENT_PROMPT_CACHE==='1';
 const wireVersion=cache?"claude-tools-v4-effort-cache":"claude-tools-v4-effort";
 const prior=await replayAI({id,hash,retryRejectedVersion:wireVersion});if(prior)return prior.result as StepResult;
 const key=await openrouterKey();if(!key)throw Error('Connect the production agent in Admin.');
 const price=await openrouterPrice(input.model);
 const messages=compactAgentMessages(input.messages,input.system);
 const system=compactAgentSystem(input.system);
 const wire=cache?cachedWire(system,messages):{system:system as string|{type:string;text:string;cache_control:{type:'ephemeral'}}[],messages};
 const tokens=boundInputTokens(system,input.tools,messages,input.measured,cache);
 const maxTokens=budgetedOutputTokens(price,tokens,input.remainingUsd,input.maxOutputTokens,input.minimumOutputTokens);
 const bound=tokens*price.input+maxTokens*price.output+price.request;
 const reservation=await reserveAI({id,hash,purpose:'cam-agent-step',retryRejectedVersion:wireVersion,maximumUsd:bound,conversationId:input.conversationId});if(reservation.replayed)return reservation.result as StepResult;
 try{
  const send=(toolChoice:unknown)=>fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(maxTokens>8000?900000:240000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','X-OpenRouter-Title':'CAM Studio'},body:JSON.stringify({model:input.model,messages:[{role:'system',content:wire.system},...wire.messages],tools:input.tools,...(cache?{session_id:input.session.slice(0,256)}:{}),tool_choice:toolChoice,max_tokens:maxTokens,stream:false,// Fable ignores a reasoning token budget (12,000 reasoning tokens against a 3,000 cap, live 2026-10-21 17:24) and OpenRouter refuses effort and max_tokens together (400, 17:40): effort is the only lever and the only field sent.
   reasoning:{effort:input.effort??agentEffort(),exclude:true},provider:{require_parameters:true,data_collection:'deny',allow_fallbacks:false,max_price:{prompt:Number((price.input*1e6).toPrecision(12)),completion:Number((price.output*1e6).toPrecision(12))}}})});
  const forced=input.requirePlan?{type:'function',function:{name:'submit_plan'}}:'required';
  let response=await send(autoOnlyModels.has(input.model)?'auto':forced);
  if([400,404].includes(response.status)&&!autoOnlyModels.has(input.model)){
   // Claude 5 models refuse forced tool use: Bedrock and Vertex answer 400 ("tool_choice: type tool and any are not supported"), OpenRouter answers 404 ("No endpoints found that support the provided 'tool_choice' value") when no provider accepts it (both live 2026-10-21). Neither is billed; resend once with 'auto' and remember the model for this process.
   const probe=await response.clone().text().catch(()=>'');
   if(/tool_choice/i.test(probe)){autoOnlyModels.add(input.model);response=await send('auto');}
  }
  if(!response.ok){
   // Keep bounded diagnostic data. Never include headers, credentials or prompts.
   const reader=response.body?.getReader();let detail='Provider rejected the request.';
   if(reader){const parts:Uint8Array[]=[];let bytes=0;try{while(bytes<8192){const {value,done}=await reader.read();if(done)break;parts.push(value);bytes+=value.length;}await reader.cancel();const body=JSON.parse(Buffer.concat(parts).subarray(0,8192).toString());if(typeof body?.error?.message==='string')detail=body.error.message.slice(0,1000).replace(/sk-[a-zA-Z0-9_-]+/g,'[redacted]');}catch{}finally{reader.releaseLock();}}
   // A routing rejection or a request the provider refused to accept never
   // executed: keep it as a definitive rejection, not an unknown outcome.
   if(response.status===404 && /no endpoints|no available|not found/i.test(detail) || [400,422].includes(response.status) && detail!=='Provider rejected the request.'){
    await recordRejectedAI(id,response.status,detail,wireVersion);throw new AIHttpRejection(response.status,detail);
   }
   // 402 from OpenRouter ("would exceed your available credits given in-flight requests") is a capacity condition, not a refusal of this request: retryable once credits or in-flight requests settle (live 2026-10-21).
   if([402,408,409,425,429].includes(response.status)||response.status>=500){await recordTransientAI(id,response.status,detail);throw new AIHttpTransient(response.status,detail);}
   throw Error(`Agent connection failed (HTTP ${response.status}): ${detail}`);
  }
  const reader=response.body?.getReader();if(!reader)throw Error('Empty agent response.');const parts:Uint8Array[]=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();throw Error('Agent response too large.');}parts.push(value);}}finally{reader.releaseLock();}
  const raw=JSON.parse(Buffer.concat(parts).toString('utf8'));
  const known=z.object({id:z.string(),model:z.string(),usage:z.object({prompt_tokens:z.number().nonnegative(),completion_tokens:z.number().nonnegative(),cost:z.number().finite().nonnegative()})}).safeParse(raw);
  const parsed=ResponseSchema.safeParse(raw);
  if(!parsed.success&&known.success)throw new AIResponseError({kind:'ai-response-failure-v1',code:'invalid-output',finishReason:'invalid-message',receipt:{actualUsd:known.data.usage.cost,model:known.data.model,usage:{inputTokens:known.data.usage.prompt_tokens,outputTokens:known.data.usage.completion_tokens,requestId:known.data.id}}});
  if(!parsed.success)throw Error('The agent response and receipt could not be verified.');
  const body=parsed.data;
  const details=(raw as {usage?:{prompt_tokens_details?:{cached_tokens?:unknown;cache_write_tokens?:unknown}}}).usage?.prompt_tokens_details;
 const cached=typeof details?.cached_tokens==='number'?{cachedTokens:details.cached_tokens}:{},written=typeof details?.cache_write_tokens==='number'?{cacheWriteTokens:details.cache_write_tokens}:{};
 const reasoningTokens=(raw as {usage?:{completion_tokens_details?:{reasoning_tokens?:unknown}}}).usage?.completion_tokens_details?.reasoning_tokens;const reasoning=typeof reasoningTokens==='number'?{reasoningTokens}:{};
 const receipt={actualUsd:body.usage.cost,model:body.model,usage:{inputTokens:body.usage.prompt_tokens,outputTokens:body.usage.completion_tokens,requestId:body.id,...cached,...written,...reasoning}};
  // Keep what a cut answer contained (bounded), so a truncation can be diagnosed from the ledger: which tool, how much visible text, how much reasoning.
  if(!['stop','tool_calls'].includes(body.choices[0].finish_reason)){const m=body.choices[0].message;const preview={tool:m.tool_calls?.[0]?.function.name??null,argumentsChars:m.tool_calls?.[0]?.function.arguments.length??0,argumentsHead:(m.tool_calls?.[0]?.function.arguments??'').slice(0,1500),contentHead:(m.content??'').slice(0,500)};throw new AIResponseError({kind:'ai-response-failure-v1',code:'incomplete',finishReason:body.choices[0].finish_reason,receipt:{...receipt,usage:{...receipt.usage,...reasoning}},preview});}
  const result:StepResult={message:{role:'assistant',...body.choices[0].message},actualUsd:body.usage.cost,promptTokens:body.usage.prompt_tokens,...(typeof details?.cached_tokens==='number'?{cachedTokens:details.cached_tokens}:{}),...(typeof details?.cache_write_tokens==='number'?{cacheWriteTokens:details.cache_write_tokens}:{})};
  await settleAI({id,result,...receipt,jobId:input.jobId,conversationId:input.conversationId});return result;
 }catch(e){if(e instanceof AIResponseError)await recordFailedAI({id,failure:e.failure,jobId:input.jobId,conversationId:input.conversationId});else if(!(e instanceof AIHttpRejection)&&!(e instanceof AIHttpTransient))await uncertainAI(id);throw e;}
};

/** Upper bound on prompt tokens for the reservation. Bytes bound tokens for new
 * text; the prefix already measured by the previous receipt of this same turn
 * (identical system, tools and earlier messages) counts at its exact size. */
export const CACHE_WARM_MS=4*60*1000;
export function boundInputTokens(system:string,tools:AgentTool[],messages:AgentMessage[],measured?:{messages:number;promptTokens:number;cachedTokens?:number;cacheWriteTokens?:number;at?:number},cache=false,now=Date.now()){
 const text=(m:AgentMessage)=>{let n=100+Buffer.byteLength(JSON.stringify(m.tool_calls??[]));if(Array.isArray(m.content)){for(const p of m.content)n+=p.type==='image_url'?12000:Buffer.byteLength(p.text??'');}else n+=Buffer.byteLength(m.content??'');return n;};
 const exact=measured&&measured.messages>0&&measured.messages<=messages.length&&Number.isInteger(measured.promptTokens)&&measured.promptTokens>0;
 // Within the provider's cache window, the prefix the previous receipt reported
 // as cached is priced at the verified 0.1x read rate. Outside it, full price.
 // Tokens read from the cache or just written to it are served from it next time.
 const warmTokens=Math.max(measured?.cachedTokens??0,measured?.cacheWriteTokens??0);
 const warm=exact&&cache&&warmTokens>0&&warmTokens<=measured.promptTokens&&typeof measured.at==='number'&&now-measured.at<CACHE_WARM_MS;
 const cached=warm?warmTokens:0;
 let tokens=exact?(measured.promptTokens-cached+Math.ceil(cached*.1))+600:Buffer.byteLength(system)+Buffer.byteLength(JSON.stringify(tools))+4000;
 for(const m of messages.slice(exact?measured.messages:0))tokens+=text(m);
 return tokens;
}
/** Explicit cache breakpoints on the stable prefix: the system prompt and the
 * last block of the first request. Nothing else changes on the wire. */
export function cachedWire(system:string,messages:AgentMessage[]){
 const breakpoint={type:'ephemeral' as const};
 const first=messages.findIndex(m=>m.role==='user');
 // Third, moving breakpoint on the last message: every earlier step of the same turn is then read from
 // the cache instead of being billed again (verified live on 2026-10-21: a tool result as a text part
 // with cache_control is accepted and cached; without it each agent step re-billed ~24k tokens).
 const last=messages.length-1;
 return {
  system:[{type:'text',text:system,cache_control:breakpoint}],
  messages:messages.map((m,i)=>{
   if(i!==first&&i!==last)return m;
   if(m.role==='assistant')return m;
   const parts=typeof m.content==='string'?[{type:'text',text:m.content}]:(m.content??[]);
   if(!parts.length)return m;
   return {...m,content:parts.map((p,j)=>j===parts.length-1?{...p,cache_control:breakpoint}:p)};
  }),
 };
}
/** Reasoning effort of every Claude tool-loop step. CAM_MOTION_EFFORT (low, medium, high)
 * selects it; medium is the historical default. Not part of the request identity. */
export function agentEffort():'low'|'medium'|'high'{
 const value=process.env.CAM_MOTION_EFFORT?.trim();
 return value==='low'||value==='high'?value:'medium';
}
/** JSONB changes object key order. Request identities must survive persistence. */
export function canonicalAgentInput(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonicalAgentInput).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonicalAgentInput(v)).join(',')+'}';
 return JSON.stringify(value);
}

/** Keep raw history in PostgreSQL, but do not repeatedly send whole prior source
 * files inside tool history. The current authoritative source stays in input. */
export function compactAgentMessages(messages:AgentMessage[],system:string):AgentMessage[]{
 const calls=new Map(messages.flatMap(m=>(m.tool_calls??[]).map(c=>[c.id,c.function.name] as const)));
 return messages.map(m=>{
  if(m.role==='tool'&&calls.get(m.tool_call_id??'')==='read_video_history'&&typeof m.content==='string'){
   try{const events=JSON.parse(m.content);if(Array.isArray(events))return {...m,content:JSON.stringify(events.map(e=>({...e,content:JSON.stringify(e.content).slice(0,800),excerpt:true,notice:'Historical excerpt; current request contains the authoritative script and source.'}))) };}catch{}
  }
  if(m.role==='user'&&Array.isArray(m.content)&&system.includes('You write executable typographic films')){
   return {...m,content:m.content.map(p=>{if(p.type!=='text'||!p.text)return p;try{const envelope=JSON.parse(p.text),request=JSON.parse(envelope.currentRequest);const source=request.repair?.failedSource,marker='# ============================================================ A';if(typeof source==='string'&&source.includes(marker)){request.repair.failedSource=source.slice(source.indexOf(marker));request.repair.fixedMachinery='Use the complete protected machinery in the system reference; the application assembles it unchanged.';envelope.currentRequest=JSON.stringify(request);return {...p,text:JSON.stringify(envelope)};}}catch{}return p;})};
  }
  return m;
 });
}

export function compactAgentSystem(system:string){
 const marker='Required skill motion-method:\n',start=system.indexOf(marker),boundary='\nCurrent phase contract:\n';
 if(start<0)return system;const end=system.indexOf(boundary,start);if(end<0)return system;
 const method=system.slice(start+marker.length,end),contract=system.slice(end+boundary.length);
 if(method.length<500||!contract.includes(method))return system;
 return system.slice(0,end+boundary.length)+contract.replace(method,'[The authoritative method is loaded in the required skill above.]');
}
