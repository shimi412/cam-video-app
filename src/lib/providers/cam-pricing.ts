import { videoRequestSeconds, SelectionSchema, selectVideoModels, VIDEO_MODELS, HF_SEEDANCE, HF_MINIMAX, KLING_PRO, KLING_STANDARD, isHiggsfieldVideo, draftOperationId, type VideoOffer, type SelectionOptions } from "../concept/model-selection";
import { z } from "zod";
import { connectCamProviders } from "./cam";
import { IMAGE_ENDPOINT, type GenerationOperation, type generationPlan } from "../concept/generation-plan";
import { ALIGNMENT_ENDPOINT } from "../concept/transcription";
import { mcpData, type JsonRequest, type McpCall } from "../concept/provider-transports";
import { sha256 } from "../concept/checkpoints";

export const CamQuoteSchema = z.object({
  id:z.string().regex(/^[a-f0-9]{64}$/),plan:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.number(),expiresAt:z.number(),
  scope:z.enum(["storyboard","production"]).optional(),
  lines:z.array(z.object({id:z.string(),model:z.string(),kind:z.enum(["voice","alignment","image","video"]),unit:z.enum(["usd","higgsfield-credit"]),quantity:z.number().positive(),unitPrice:z.number().nonnegative(),maximum:z.number().int().nonnegative(),seconds:z.number().int().min(3).max(15).optional(),billing:z.enum(["request","seconds"]).optional(),description:z.string()})),
  caps:z.object({usd:z.number().int().nonnegative(),"higgsfield-credit":z.number().int().nonnegative()}),
  falBillingAvailable:z.boolean(),
  selection:SelectionSchema.optional(),
  draftRecoveries:z.array(z.object({scene:z.number().int().positive(),attempt:z.number().int().min(1).max(10),failedRequestId:z.string().min(1),failedFingerprint:z.string().regex(/^[a-f0-9]{64}$/)})).optional(),
});
export type CamQuote=z.infer<typeof CamQuoteSchema>;
export type PricingOptions=SelectionOptions & {scope?:"storyboard"|"production"};
/** Refresh remaining prices while preserving every already attempted line.
 * The revised total includes the old reservations, never bills them twice. */
export function renewCamQuote(previous:CamQuote, current:CamQuote, attemptedIds:Set<string>):CamQuote {
  const expanded=previous.scope==="storyboard"&&(current.scope??"production")==="production";
  if(!expanded&&((previous.scope??"production")!==(current.scope??"production")||(previous.selection?.workflow??"direct")!==(current.selection?.workflow??"direct") || (previous.selection?.minimumResolution??"1080p")!==(current.selection?.minimumResolution??"1080p")))throw new Error("The approved workflow or source quality changed. Create a new production version.");
  if(previous.plan!==current.plan)throw new Error("The refreshed quote belongs to a different production.");
  // An approved fallback changed only the new draft and unsubmitted final.
  // Refreshing prices must retain the older failed route's immutable history.
  const historical=new Set(previous.lines.filter(line=>attemptedIds.has(line.id)&&(previous.draftRecoveries??[]).some(recovery=>{
    const match=line.id.match(/^scene-(\d+)-draft(?:-retry-(\d+))?$/);
    return match&&Number(match[1])===recovery.scene&&Number(match[2]??0)<recovery.attempt;
  })).map(line=>line.id));
  current={...current,draftRecoveries:previous.draftRecoveries,lines:current.lines.map(line=>historical.has(line.id)?previous.lines.find(old=>old.id===line.id)!:line)};
  for(const old of previous.lines)if(historical.has(old.id)&&!current.lines.some(line=>line.id===old.id))current.lines.push(old);
  if(previous.lines.some(old=>current.lines.some(line=>line.id===old.id&&(line.model!==old.model||line.kind!==old.kind))))throw new Error("An approved model changed. Create a new production version.");
  const lines=current.lines.map(line=>attemptedIds.has(line.id)?previous.lines.find(old=>old.id===line.id&&old.model===line.model&&old.kind===line.kind)??line:line);
  // A later cast replacement can retire a sheet; retain its real attempted cost.
  for(const old of previous.lines)if(/^cast-[a-f0-9]{16}-[1-4]$/.test(old.id)&&attemptedIds.has(old.id)&&!lines.some(line=>line.id===old.id))lines.push(old);
  if([...attemptedIds].some(id=>!lines.some(line=>line.id===id)))throw new Error("An existing request is missing from the refreshed quote.");
  const caps={usd:0,"higgsfield-credit":0};for(const line of lines)caps[line.unit]+=line.maximum;
  const content={...current,lines,caps,id:undefined};
  return CamQuoteSchema.parse({...content,id:sha256(JSON.stringify(content))});
}
const micros=(value:number)=>Math.ceil(Number((value*1e6).toPrecision(12)));
/** A quote is read-only. Never select an upgrade, trial or automatic refill. */
export async function priceCamPlan(plan:ReturnType<typeof generationPlan>, providers:{fal:JsonRequest;higgsfield:McpCall}, now=Date.now(), options:PricingOptions={}):Promise<CamQuote>{
  if(plan.operations.some(op=>op.gates.includes("correct-physical-direction")))throw new Error("Review the physical action and its start/end images before requesting a quote.");
  if(plan.operations.some(op=>op.gates.includes("approved-character-sheet")))throw new Error(plan.blockers.filter(b=>b.includes("character sheet")).join(" "));
  const scope=options.scope??"production";
  const endpoints=scope==="storyboard"?[IMAGE_ENDPOINT]:[IMAGE_ENDPOINT,...VIDEO_MODELS.filter(m=>!isHiggsfieldVideo(m)),ALIGNMENT_ENDPOINT];
  const response=z.object({prices:z.array(z.object({endpoint_id:z.string(),unit_price:z.number().nonnegative(),unit:z.string(),currency:z.literal("USD")}))}).parse(await providers.fal(`https://api.fal.ai/v1/models/pricing?${endpoints.map(e=>`endpoint_id=${encodeURIComponent(e)}`).join("&")}`,{method:"GET"}));
  const price=(model:string,unit:string)=>{const result=response.prices.find(p=>p.endpoint_id===model);if(!result||result.unit!==unit)throw new Error("The provider pricing unit changed. Refresh the production quote.");return result.unit_price;};
  if(scope==="storyboard"){
    const lines=plan.operations.filter(op=>op.kind==="image").map(op=>{
      const unitPrice=price(op.model,"images");
      return {id:op.id,model:op.model,kind:"image" as const,unit:"usd" as const,quantity:1,unitPrice,maximum:micros(unitPrice),description:"One storyboard keyframe (2K)"};
    });
    const content={plan:plan.fingerprint,scope,createdAt:now,expiresAt:now+3600_000,lines,caps:{usd:lines.reduce((total,line)=>total+line.maximum,0),"higgsfield-credit":0},falBillingAvailable:false};
    return CamQuoteSchema.parse({...content,id:sha256(JSON.stringify(content))});
  }
  const durations=[...new Set(plan.modelNeeds.map(n=>n.seconds))];
  const offers:VideoOffer[]=[];
  const pricedDurations=new Set<string>();
  for(const requestedSeconds of durations) for(const model of [HF_SEEDANCE,HF_MINIMAX]) {
    const seconds=videoRequestSeconds(model,requestedSeconds);
    const key=`${model}:${seconds}`;if(pricedDurations.has(key))continue;pricedDurations.add(key);
    const resolution=model===HF_SEEDANCE?"1080p":"2K";
    const params={model,mode:model===HF_SEEDANCE?"omni_reference":undefined,duration:seconds,resolution,count:1,aspect_ratio:"auto",...(model===HF_SEEDANCE?{draft:false,generate_audio:false,bitrate_mode:"standard"}:{}),get_cost:true,use_unlim:false};
    const cost=async(params:Record<string,unknown>)=>{const q=z.object({adjustments:z.record(z.string(),z.unknown()).optional(),cost:z.object({credits:z.number().finite().nonnegative(),credits_exact:z.number().finite().nonnegative().optional()})}).parse(mcpData(await providers.higgsfield("generate_video",{params})));if(Object.keys(q.adjustments??{}).length)throw new Error("Quote settings changed.");return q.cost.credits_exact??q.cost.credits;};
    try {
      const final=await cost(params);
      const draft=(options.workflow==="draft-first"||options.workflow==="whimsical")&&model===HF_SEEDANCE?await cost({...params,resolution:"480p",draft:true}):undefined;
      offers.push({model,resolution:model===HF_MINIMAX?"2K (upscaled from 768p)":resolution,seconds,unit:"higgsfield-credit",final,draft});
    }catch{/* This candidate is unavailable; never substitute a price or activate a trial. */}
  }
  const selection=selectVideoModels(plan.modelNeeds,response.prices,{...options,offers});
  const voice=plan.operations.find(op=>op.kind==="voice");
  const voiceQuote=voice?z.object({cost:z.object({credits:z.number().nonnegative(),credits_exact:z.number().nonnegative().optional()})}).parse(mcpData(await providers.higgsfield("generate_audio",{params:{...voice.input,get_cost:true,use_unlim:false}}))):null;
  const lines=plan.operations.flatMap<CamQuote["lines"][number]>(op=>{
    const model=selection.scenes.find(scene=>scene.operation===op.id)?.selected??op.model;
    const selected=selection.scenes.find(scene=>scene.operation===op.id);
    const candidate=selected?.candidates.find(c=>c.model===selected.selected);
    const seconds=op.kind==="video"?videoRequestSeconds(model,Number(op.input.duration)):undefined;
    if(op.kind==="video"&&model===KLING_PRO&&options.workflow==="draft-first") {
      if(candidate?.final===undefined||candidate.draft===undefined||seconds===undefined)throw new Error("Missing selected draft and final video prices.");
      const line={id:op.id,model,kind:op.kind,unit:"usd" as const,billing:"seconds" as const,quantity:seconds,unitPrice:price(KLING_PRO,"seconds"),maximum:micros(candidate.final),seconds,description:`Pro animation, ${seconds} seconds, approved storyboard frames`};
      return [{...line,id:draftOperationId(op.id),model:KLING_STANDARD,unitPrice:price(KLING_STANDARD,"seconds"),maximum:micros(candidate.draft),description:`Standard draft, ${seconds} seconds, approved storyboard frames`},line];
    }
    if(op.kind==="video"&&isHiggsfieldVideo(model)) {
      if(candidate?.final===undefined)throw new Error("Missing selected video price.");
      const line={id:op.id,model,kind:op.kind,unit:"higgsfield-credit" as const,billing:"request" as const,quantity:1,unitPrice:candidate.final,maximum:micros(candidate.final),seconds,description:`${candidate.resolution} animation, ${seconds} seconds; exact request repriced before submission`};
      return options.workflow!=="direct"&&options.workflow!==undefined?[{...line,id:draftOperationId(op.id),unitPrice:candidate.draft!,maximum:micros(candidate.draft!),description:`480p draft, ${seconds} seconds; review before finishing`},{...line,description:`1080p completion, ${seconds} seconds, within seven days`}]:[line];
    }
    const unit=op.kind==="voice"?"higgsfield-credit" as const:"usd" as const;
    // Quote the planned action length. Montage holds follow narration locally.
    const quantity=op.kind==="video"?seconds!:op.kind==="alignment"?1250:1;
    const unitPrice=op.kind==="voice"?(voiceQuote!.cost.credits_exact??voiceQuote!.cost.credits):price(model,op.kind==="image"?"images":op.kind==="video"?"seconds":"compute seconds");
    return [{id:op.id,model,kind:op.kind,unit,quantity,unitPrice,maximum:micros(quantity*unitPrice),...(seconds?{seconds,billing:"seconds" as const}:{}),description:op.kind==="voice"?"Bram narration, paid credits":op.kind==="alignment"?"Word synchronization, maximum compute allowance":op.kind==="image"?"One approved-scene keyframe (2K)":`Animation, ${quantity} seconds for the planned action`}];
  });
  const caps={usd:0,"higgsfield-credit":0};for(const line of lines)caps[line.unit]+=line.maximum;
  let falBillingAvailable=false;
  try{await providers.fal("https://api.fal.ai/v1/models/billing-events?request_id=cam-readonly-access-check&limit=1",{method:"GET"});falBillingAvailable=true;}catch{/* Quotes remain explicit estimates; unavailable receipts are never invented. */}
  const content={plan:plan.fingerprint,scope,createdAt:now,expiresAt:now+3600_000,lines,caps,falBillingAvailable,selection};
  return CamQuoteSchema.parse({...content,id:sha256(JSON.stringify(content))});
}
export async function fetchCamQuote(plan:ReturnType<typeof generationPlan>,options:PricingOptions={}){const providers=await connectCamProviders("quote",{imagesOnly:options.scope==="storyboard"});try{const {pool}=await import("@/db");const setting=(await pool.query("SELECT value FROM settings WHERE key='customer_pricing'")).rows[0]?.value;const factor=z.number().finite().positive().safeParse(setting?.higgsfieldCreditUsd);return await priceCamPlan(plan,providers,Date.now(),{...options,...(factor.success?{higgsfieldCreditUsd:factor.data}:{})});}finally{await providers.close();}}
export async function falCostReceipt(operation:GenerationOperation,requestId:string,request:JsonRequest){
  if(operation.transport!=="fal-queue")return null;
  const result=z.object({billing_events:z.array(z.object({request_id:z.string(),endpoint_id:z.string(),cost_total:z.number().nonnegative()})),has_more:z.boolean().optional()}).parse(await request(`https://api.fal.ai/v1/models/billing-events?request_id=${encodeURIComponent(requestId)}&endpoint_id=${encodeURIComponent(operation.model)}&limit=100`,{method:"GET"}));
  if(result.has_more)throw new Error("The billing receipt needs pagination before settlement.");
  if(!result.billing_events.length)return null;
  if(result.billing_events.some(e=>e.request_id!==requestId||e.endpoint_id!==operation.model))throw new Error("Provider cost receipt does not match the generation.");
  return {unit:"usd" as const,actual:micros(result.billing_events.reduce((sum,e)=>sum+e.cost_total,0)),evidence:`fal billing events ${requestId}: ${sha256(JSON.stringify(result.billing_events))}`};
}
