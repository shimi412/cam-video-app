import type { ModelMessage } from "ai";
import { z } from "zod";
import { openrouterKey } from "../credentials";
import { inspectPdf } from "../pdf-inspection";
import { brainMode } from "./mode";
import { AIResponseError } from "../ai-response";

const ORIGIN="https://openrouter.ai/api/v1";
export type ModelPrice={id:string;input:number;output:number;request:number;context:number;modalities:string[]};
/** Reasoning and the visible storyboard share the output allowance. Use the
 * largest requested allowance affordable under the existing hard spending cap. */
export function budgetedOutputTokens(price:ModelPrice,inputTokens:number,maximumUsd:number,requested:number,minimum:number){
  const available=maximumUsd-inputTokens*price.input-price.request;
  const affordable=price.output===0?requested:Math.floor(available/price.output);
  const result=Math.min(requested,affordable,Math.floor(price.context-inputTokens));
  if(available<0||result<minimum)throw new Error(`This production analysis exceeds the $${maximumUsd.toFixed(2)} remaining request budget.`);
  // Floating-point rounding must never move the calculated bound above the cap.
  const safe=inputTokens*price.input+result*price.output+price.request>maximumUsd?result-1:result;
  if(safe<minimum)throw new Error(`This production analysis exceeds the $${maximumUsd.toFixed(2)} remaining request budget.`);
  return safe;
}
const catalog=new Map<string,{at:number;price:ModelPrice}>();
export async function openrouterPrice(id:string):Promise<ModelPrice>{
  if(!/^(deepseek\/deepseek-[a-zA-Z0-9.-]+|anthropic\/claude-[a-zA-Z0-9.-]+)$/.test(id))throw new Error("Choose a supported DeepSeek or Claude model.");
  const cached=catalog.get(id);if(cached&&Date.now()-cached.at<5*60000)return cached.price;
  const response=await fetch(`${ORIGIN}/model/${id}`,{redirect:"error",signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error("The selected model's current price could not be retrieved.");
  const model=z.object({data:z.object({id:z.string(),context_length:z.number().positive(),pricing:z.object({prompt:z.coerce.number().nonnegative(),completion:z.coerce.number().nonnegative(),request:z.coerce.number().nonnegative().optional()}),architecture:z.object({input_modalities:z.array(z.string())})})}).parse(await response.json()).data;
  const price={id:model.id,input:model.pricing.prompt,output:model.pricing.completion,request:model.pricing.request??0,context:model.context_length,modalities:model.architecture.input_modalities};
  catalog.set(id,{at:Date.now(),price});return price;
}
export async function checkOpenrouter(key?:string){
  const secret=key??await openrouterKey();if(!secret)return {ok:false,detail:"OpenRouter key missing"};
  const response=await fetch(`${ORIGIN}/key`,{headers:{Authorization:`Bearer ${secret}`},redirect:"error",signal:AbortSignal.timeout(15000)});
  return {ok:response.ok,detail:response.ok?"Connected. No generation was sent.":`Connection refused (HTTP ${response.status}).`};
}
export async function inputTokenBound(messages:ModelMessage[],system:string){
  let tokens=Buffer.byteLength(system)+4000;
  for(const message of messages){
    tokens+=100;
    if(typeof message.content==="string"){tokens+=Buffer.byteLength(message.content);continue;}
    for(const part of message.content){
      if(part.type==="text")tokens+=Buffer.byteLength(part.text);
      else if(part.type==="image")tokens+=12000;
      else if(part.type==="file"){
        const metadata=await inspectPdf(part.data as Uint8Array);
        tokens+=metadata.textBytes+metadata.pages*12000;
      }else throw new Error("Unsupported reference type.");
    }
  }
  return tokens;
}
export function routerMessages(messages:ModelMessage[]){
  return messages.map(m=>({role:m.role,content:typeof m.content==="string"?m.content:m.content.map(part=>{
    if(part.type==="text")return {type:"text",text:part.text};
    if(part.type==="image")return {type:"image_url",image_url:{url:`data:image/png;base64,${Buffer.from(part.image as Uint8Array).toString("base64")}`}};
    if(part.type==="file")return {type:"file",file:{filename:part.filename??"reference.pdf",file_data:`data:application/pdf;base64,${Buffer.from(part.data as Uint8Array).toString("base64")}`}};
    throw new Error("Unsupported assistant content.");
  })}));
}
export async function openrouterObject<T>(input:{schema:z.ZodType<T>;system:string;messages:ModelMessage[];price:ModelPrice;inputTokens:number;maximumUsd:number;deep:boolean;effort?:"medium"|"high";maxOutputTokens?:number}){
  if(brainMode()!=="api"||process.env.CAM_LIVE_ENABLED!=="1")throw new Error("The connected assistant is disabled.");
  const key=await openrouterKey();if(!key)throw new Error("Connect OpenRouter in Admin → Connections.");
  const maxTokens=input.maxOutputTokens??4000;
  const maximum=input.inputTokens*input.price.input+maxTokens*input.price.output+input.price.request;
  if(maximum>input.maximumUsd||input.inputTokens+maxTokens>input.price.context)throw new Error("This request exceeds the assistant's budget or document limit. Use fewer references.");
  const hasPdf=input.messages.some(m=>Array.isArray(m.content)&&m.content.some(p=>p.type==="file"));
  const hasImage=input.messages.some(m=>Array.isArray(m.content)&&m.content.some(p=>p.type==="image"));
  if((hasPdf&&!input.price.modalities.includes("file"))||(hasImage&&!input.price.modalities.includes("image")))throw new Error("This model cannot read the selected references.");
  // A full directed storyboard can take longer than a short chat response.
  const response=await fetch(`${ORIGIN}/chat/completions`,{method:"POST",redirect:"error",signal:AbortSignal.timeout(input.deep&&maxTokens>8000?240000:120000),headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json","X-OpenRouter-Title":"CAM Studio"},body:JSON.stringify({
    model:input.price.id,stream:false,messages:[{role:"system",content:input.system},...routerMessages(input.messages)],max_tokens:maxTokens,
    response_format:{type:"json_schema",json_schema:{name:"cam_response",strict:true,schema:z.toJSONSchema(input.schema)}},
    provider:{require_parameters:true,data_collection:"deny",allow_fallbacks:false,max_price:{prompt:Number((input.price.input*1e6).toPrecision(12)),completion:Number((input.price.output*1e6).toPrecision(12))}},
    reasoning:input.deep?{effort:input.effort??"medium",exclude:true}:{enabled:false},
    ...(hasPdf?{plugins:[{id:"file-parser",pdf:{engine:"native"}}]}:{}),
  })});
  if(!response.ok){await response.body?.cancel();throw new Error(`OpenRouter request failed (HTTP ${response.status}). No automatic retry was made.`);}
  const reader=response.body?.getReader();if(!reader)throw new Error("Empty assistant response.");
  const parts:Uint8Array[]=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();throw new Error("Assistant response too large.");}parts.push(value);}}finally{reader.releaseLock();}
  const value=z.object({id:z.string(),model:z.string(),choices:z.array(z.object({finish_reason:z.string(),message:z.object({content:z.string().nullable()})})).length(1),usage:z.object({prompt_tokens:z.number().int().nonnegative(),completion_tokens:z.number().int().nonnegative(),cost:z.number().finite().nonnegative()})}).parse(JSON.parse(Buffer.concat(parts).toString("utf8")));
  const receipt={actualUsd:value.usage.cost,usage:{inputTokens:value.usage.prompt_tokens,outputTokens:value.usage.completion_tokens,requestId:value.id},model:value.model};
  const finishReason=value.choices[0].finish_reason;
  if(finishReason!=="stop")throw new AIResponseError({kind:"ai-response-failure-v1",code:"incomplete",finishReason,receipt});
  try { return {object:input.schema.parse(JSON.parse(value.choices[0].message.content??"")),...receipt}; }
  catch { throw new AIResponseError({kind:"ai-response-failure-v1",code:"invalid-output",finishReason,receipt}); }
}

/** One tiny real tool call on the model (about $0.002). Pricing alone does not
 * prove the account can use a model: on 2026-10-21 "Test Fable 2" lost its paid
 * recording because every Fable endpoint was excluded by the account's
 * zero-data-retention setting. Surfaces OpenRouter's own reason. */
export async function probeWriterModel(id:string){
  const key=await openrouterKey();if(!key)throw new Error("Connect the production agent in Admin.");
  const response=await fetch(`${ORIGIN}/chat/completions`,{method:"POST",redirect:"error",signal:AbortSignal.timeout(60000),headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json","X-OpenRouter-Title":"CAM Studio"},body:JSON.stringify({model:id,max_tokens:40,messages:[{role:"user",content:"Call ping with ok=true."}],tools:[{type:"function",function:{name:"ping",parameters:{type:"object",properties:{ok:{type:"boolean"}},required:["ok"]}}}],tool_choice:"auto",provider:{data_collection:"deny",allow_fallbacks:false}})});
  const body=await response.json().catch(()=>({})) as {error?:{message?:string;metadata?:{raw?:string}};choices?:{message:{tool_calls?:unknown[]}}[]};
  if(!response.ok||body.error){const reason=String(body.error?.message??`HTTP ${response.status}`).replace(/sk-[a-zA-Z0-9_-]+/g,"[redacted]").replace(/\s+/g," ").slice(0,400);throw new Error(`The writing model ${id} is not available to this account: ${reason}`);}
  if(!body.choices?.[0]?.message.tool_calls?.length)throw new Error(`The writing model ${id} answered without calling a tool; it cannot author films through the tool loop.`);
}
