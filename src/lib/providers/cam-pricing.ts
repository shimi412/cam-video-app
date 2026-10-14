import { z } from "zod";
import { connectCamProviders } from "./cam";
import { IMAGE_ENDPOINT, VIDEO_ENDPOINT, type GenerationOperation, type generationPlan } from "../concept/generation-plan";
import { ALIGNMENT_ENDPOINT } from "../concept/transcription";
import { mcpData, type JsonRequest, type McpCall } from "../concept/provider-transports";
import { sha256 } from "../concept/checkpoints";

export const CamQuoteSchema = z.object({
  id:z.string().regex(/^[a-f0-9]{64}$/),plan:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.number(),expiresAt:z.number(),
  lines:z.array(z.object({id:z.string(),model:z.string(),kind:z.enum(["voice","alignment","image","video"]),unit:z.enum(["usd","higgsfield-credit"]),quantity:z.number().positive(),unitPrice:z.number().nonnegative(),maximum:z.number().int().nonnegative(),description:z.string()})),
  caps:z.object({usd:z.number().int().nonnegative(),"higgsfield-credit":z.number().int().nonnegative()}),
  falBillingAvailable:z.boolean(),
});
export type CamQuote=z.infer<typeof CamQuoteSchema>;
/** Refresh remaining prices while preserving every already attempted line.
 * The revised total includes the old reservations, never bills them twice. */
export function renewCamQuote(previous:CamQuote, current:CamQuote, attemptedIds:Set<string>):CamQuote {
  if(previous.plan!==current.plan)throw new Error("The refreshed quote belongs to a different production.");
  const lines=current.lines.map(line=>attemptedIds.has(line.id)?previous.lines.find(old=>old.id===line.id&&old.model===line.model&&old.kind===line.kind)??line:line);
  if([...attemptedIds].some(id=>!lines.some(line=>line.id===id)))throw new Error("An existing request is missing from the refreshed quote.");
  const caps={usd:0,"higgsfield-credit":0};for(const line of lines)caps[line.unit]+=line.maximum;
  const content={...current,lines,caps,id:undefined};
  return CamQuoteSchema.parse({...content,id:sha256(JSON.stringify(content))});
}
const micros=(value:number)=>Math.ceil(Number((value*1e6).toPrecision(12)));
/** A quote is read-only. Never select an upgrade, trial or automatic refill. */
export async function priceCamPlan(plan:ReturnType<typeof generationPlan>, providers:{fal:JsonRequest;higgsfield:McpCall}, now=Date.now()):Promise<CamQuote>{
  const endpoints=[IMAGE_ENDPOINT,VIDEO_ENDPOINT,ALIGNMENT_ENDPOINT];
  const response=z.object({prices:z.array(z.object({endpoint_id:z.string(),unit_price:z.number().nonnegative(),unit:z.string(),currency:z.literal("USD")}))}).parse(await providers.fal(`https://api.fal.ai/v1/models/pricing?${endpoints.map(e=>`endpoint_id=${encodeURIComponent(e)}`).join("&")}`,{method:"GET"}));
  const price=(model:string,unit:string)=>{const result=response.prices.find(p=>p.endpoint_id===model);if(!result||result.unit!==unit)throw new Error("The provider pricing unit changed. Refresh the production quote.");return result.unit_price;};
  const voice=plan.operations.find(op=>op.kind==="voice");
  const voiceQuote=voice?z.object({cost:z.object({credits:z.number().nonnegative(),credits_exact:z.number().nonnegative().optional()})}).parse(mcpData(await providers.higgsfield("generate_audio",{params:{...voice.input,get_cost:true,use_unlim:false}}))):null;
  const lines=plan.operations.map(op=>{
    const unit=op.kind==="voice"?"higgsfield-credit" as const:"usd" as const;
    // Voice controls clip length. Reserve the supported 15-second maximum until
    // the actual recording is aligned; unused capacity never becomes a charge.
    const quantity=op.kind==="video"?15:op.kind==="alignment"?1250:1;
    const unitPrice=op.kind==="voice"?(voiceQuote!.cost.credits_exact??voiceQuote!.cost.credits):price(op.model,op.kind==="image"?"images":op.kind==="video"?"seconds":"compute seconds");
    return {id:op.id,model:op.model,kind:op.kind,unit,quantity,unitPrice,maximum:micros(quantity*unitPrice),description:op.kind==="voice"?"Bram narration, paid credits":op.kind==="alignment"?"Word synchronization, maximum compute allowance":op.kind==="image"?"One approved-scene keyframe (2K)":"Animation, up to 15 seconds after voice alignment"};
  });
  const caps={usd:0,"higgsfield-credit":0};for(const line of lines)caps[line.unit]+=line.maximum;
  let falBillingAvailable=false;
  try{await providers.fal("https://api.fal.ai/v1/models/billing-events?request_id=cam-readonly-access-check&limit=1",{method:"GET"});falBillingAvailable=true;}catch{/* Quotes remain explicit estimates; unavailable receipts are never invented. */}
  const content={plan:plan.fingerprint,createdAt:now,expiresAt:now+3600_000,lines,caps,falBillingAvailable};
  return CamQuoteSchema.parse({...content,id:sha256(JSON.stringify(content))});
}
export async function fetchCamQuote(plan:ReturnType<typeof generationPlan>){const providers=await connectCamProviders("quote");try{return await priceCamPlan(plan,providers);}finally{await providers.close();}}
export async function falCostReceipt(operation:GenerationOperation,requestId:string,request:JsonRequest){
  if(operation.transport!=="fal-queue")return null;
  const result=z.object({billing_events:z.array(z.object({request_id:z.string(),endpoint_id:z.string(),cost_total:z.number().nonnegative()})),has_more:z.boolean().optional()}).parse(await request(`https://api.fal.ai/v1/models/billing-events?request_id=${encodeURIComponent(requestId)}&endpoint_id=${encodeURIComponent(operation.model)}&limit=100`,{method:"GET"}));
  if(result.has_more)throw new Error("The billing receipt needs pagination before settlement.");
  if(!result.billing_events.length)return null;
  if(result.billing_events.some(e=>e.request_id!==requestId||e.endpoint_id!==operation.model))throw new Error("Provider cost receipt does not match the generation.");
  return {unit:"usd" as const,actual:micros(result.billing_events.reduce((sum,e)=>sum+e.cost_total,0)),evidence:`fal billing events ${requestId}: ${sha256(JSON.stringify(result.billing_events))}`};
}
