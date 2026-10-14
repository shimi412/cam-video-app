import { randomUUID } from "node:crypto";
import { copyFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import type { ProductionParams } from "../brain";
import { acquireJobLock } from "../job-lock";
import { getActiveRecipe } from "../recipes";
import { connectCamProviders } from "../providers/cam";
import { connectCamAssets } from "../providers/cam-assets";
import { assertCamConfigured, withCamExecution } from "../providers/live-policy";
import { CamQuoteSchema, fetchCamQuote, falCostReceipt, renewCamQuote } from "../providers/cam-pricing";
import { lockedAssets } from "./assets";
import { planConcept } from "./storyboard";
import { placeholderTiming } from "./timing";
import { generationPlan } from "./generation-plan";
import { bramQueue, falQueue } from "./provider-transports";
import { transcriptionQueue } from "./transcription";
import { advanceProductionFlow, flowReviewTarget, renderProductionFlow, type FlowDecision, type FlowOutcome } from "./production-flow";
import { ApprovalSchema, QuoteSchema, createBudget, quoteHash, budgetUsage, type BudgetApproval, type BudgetQuote } from "./budget";
import { postgresBudgetStore } from "./budget-store";
import { Hash, readCheckpoint, saveCheckpoint, sha256 } from "./checkpoints";
import { CAM_VOICE } from "./cam-voice";
import { requestReceipts } from "./request-journal";
import { mediaFile } from "./preview-inputs";
import { DirectionSchema } from "./types";

const approval=z.object({quote:Hash,actor:z.string().min(1),at:z.number()});
const decision=z.object({id:z.uuid(),target:Hash,decision:z.enum(["approved","rejected"]),mode:z.literal("live")});
const stateSchema=z.object({version:z.literal(1),inputHash:Hash,quote:CamQuoteSchema.nullable(),pendingQuote:CamQuoteSchema.nullable().default(null),approval:approval.nullable(),history:z.array(z.object({quote:CamQuoteSchema,approval})).default([]),decisions:z.array(decision),
  phases:z.record(z.string(),z.object({quote:QuoteSchema,approval:ApprovalSchema})),error:z.string().nullable(),finished:z.boolean()});
const directory=(id:string)=>path.join(process.cwd(),"storage/concepts",z.uuid().parse(id),"live");
const hashInput=(script:string,params:ProductionParams,references:unknown)=>sha256(JSON.stringify({script,format:params.aspectRatio,directions:params.sceneDirections??{},references}));
export const LiveAction=z.discriminatedUnion("action",[
 z.object({action:z.literal("quote")}).strict(),
 z.object({action:z.literal("approve"),quote:Hash}).strict(),
 z.object({action:z.literal("review"),target:Hash,decision:z.enum(["approved","rejected"])}).strict(),
 z.object({action:z.literal("resume")}).strict(),
 z.object({action:z.literal("edit"),scene:z.number().int().positive().max(36),direction:DirectionSchema}).strict(),
]);
async function readState(id:string){return readCheckpoint(path.join(directory(id),"production.json"),stateSchema);}
export async function liveView(id:string){
 const state=await readState(id),outcome=await readCheckpoint(path.join(directory(id),"state.json"),z.custom<FlowOutcome>());
 const review=outcome?.review;
 const media=review?.media?`/api/media/imports/${id}/${mediaFile(review.media)}`:null;
 let audio:string|null=null;
 if(review?.audio){const relative=path.relative(path.join(process.cwd(),"storage"),review.audio.file);if(relative.startsWith("..")||path.isAbsolute(relative))throw new Error("Invalid review audio.");audio=`/api/media/${relative.split(path.sep).join("/")}`;}
 const receipts=await requestReceipts(path.join(directory(id),"requests"));
 return {quote:state?.pendingQuote??state?.quote??null,approved:Boolean(state?.approval),renewing:Boolean(state?.pendingQuote),finished:state?.finished??false,error:state?.error??null,
  phase:outcome?.phase??"quote",status:outcome?.status??"awaiting-budget",review:review?{stage:review.stage,scene:review.scene,target:review.target,media,audio,duration:review.audio?.duration}:null,
  requests:receipts.map(r=>({operation:r.binding?.operation,state:r.state,requestId:r.requestId??null})),
  costsPending:outcome?.events.filter(e=>e.stage.startsWith("cost-receipt-pending-")).length??0};
}

/** Human actions save their exact quote/review before any worker may advance. */
export async function updateLiveProduction(id:string, action:z.infer<typeof LiveAction>, actor:string, getQuote=fetchCamQuote){
 assertCamConfigured();const lock=await acquireJobLock(id);if(!lock)throw new Error("This production is already working. Its saved progress will appear shortly.");
 try{
  const [job]=await lock.db.select().from(schema.jobs).where(eq(schema.jobs.id,id));
  if(!job)throw new Error("Production not found.");
  const params=job.params as ProductionParams & {live?:boolean;executionMode?:string};
  const recipe=getActiveRecipe(params.templateSlug);if(!recipe?.concept||params.live!==true||params.executionMode!=="fal")throw new Error("Create a production in the connected workspace first.");
  const references=await lockedAssets(),inputHash=hashInput(job.script,params,references.map(({id,sha256})=>({id,sha256})));
  let state=await readState(id);
  if(state&&state.inputHash!==inputHash){
   if(state.approval)throw new Error("Production inputs changed. Create a new version to preserve the approved run.");
   // Recover a draft edit saved to PostgreSQL before its file checkpoint.
   state.inputHash=inputHash;state.quote=null;state.pendingQuote=null;
  }
  state??={version:1,inputHash,quote:null,pendingQuote:null,approval:null,history:[],decisions:[],phases:{},error:null,finished:false};
  const save=()=>saveCheckpoint(path.join(directory(id),"production.json"),state!,lock.assertOwned);
  if(action.action==="edit"){
   if(state.approval)throw new Error("This production was approved. Create a new version to change its scenes.");
   const board=planConcept(job.script,recipe,params.aspectRatio,params.sceneDirections);
   if(!board.shots.some(s=>s.index===action.scene))throw new Error("Scene not found.");
   const changed={...params,sceneDirections:{...params.sceneDirections,[action.scene]:action.direction}};
   state.inputHash=hashInput(job.script,changed,references.map(({id,sha256})=>({id,sha256})));state.quote=null;state.error=null;
   await lock.db.update(schema.jobs).set({params:changed}).where(eq(schema.jobs.id,id));await save();return {advance:false};
  }
  if(action.action==="quote"){
   if(state.finished||state.decisions.some(d=>d.decision==="rejected"))throw new Error("This production has ended. Create a new version to change it.");
   const board=planConcept(job.script,recipe,params.aspectRatio,params.sceneDirections);
   const current=await getQuote(generationPlan(job.script,params,board,placeholderTiming(board.shots.map(s=>s.narration)),references));
   if(state.approval&&state.quote){
    const receipts=await requestReceipts(path.join(directory(id),"requests"));
    state.pendingQuote=renewCamQuote(state.quote,current,new Set(receipts.map(r=>r.binding!.operation)));
   }else state.quote=current;
   await save();return {advance:false};
  }
  if(action.action==="approve"){
   const offered=state.pendingQuote??state.quote;
   if(!offered||offered.id!==action.quote)throw new Error("This quote changed. Review the current quote.");
   if(state.pendingQuote){
    if(offered.expiresAt<=Date.now())throw new Error("This quote expired. Refresh it before approval.");
    state.history.push({quote:state.quote!,approval:state.approval!});
    state.quote=state.pendingQuote;state.pendingQuote=null;state.approval={quote:action.quote,actor,at:Date.now()};state.error=null;await save();
   }
   if(!state.approval){
    if(state.quote!.expiresAt<=Date.now())throw new Error("This quote expired. Refresh it before approval.");
    state.approval={quote:action.quote,actor,at:Date.now()};
    state.decisions.push({id:randomUUID(),mode:"live",decision:"approved",target:flowReviewTarget("live",id,"script",{script:job.script,voice:CAM_VOICE,format:params.aspectRatio})});
    state.error=null;await save();
    await lock.db.update(schema.jobs).set({status:"running",confirmedAt:new Date(),error:null}).where(eq(schema.jobs.id,id));
   }
  }else if(action.action==="review"){
   if(!state.approval)throw new Error("Approve the production quote first.");
   const outcome=await readCheckpoint(path.join(directory(id),"state.json"),z.custom<FlowOutcome>());
   if(!outcome?.review||outcome.review.target!==action.target)throw new Error("This review changed. Reload the current scene.");
   const old=state.decisions.find(d=>d.target===action.target);
   if(old&&old.decision!==action.decision)throw new Error("This decision is already saved. Create a new version for changed creative choices.");
   if(!old)state.decisions.push({id:randomUUID(),mode:"live",target:action.target,decision:action.decision});
   state.error=null;await save();
  }else if(!state.approval)throw new Error("Approve the production quote first.");
  if(state.finished||state.pendingQuote||state.decisions.some(d=>d.decision==="rejected")&&action.action!=="review")return {advance:false};
  return {advance:true};
 }finally{await lock.release();}
}

export async function runLiveProduction(id:string, dependencies={providers:connectCamProviders,assets:connectCamAssets,budgetScope:"cam-provider-account"}){
 const lock=await acquireJobLock(id);if(!lock)return;
 try{await withCamExecution(id,async()=>{
  const [job]=await lock.db.select().from(schema.jobs).where(eq(schema.jobs.id,id));
  const state=await readState(id);if(!job||!state?.approval||!state.quote||state.pendingQuote||state.finished)return;
  const params=job.params as ProductionParams & {live?:boolean;executionMode?:string};
  if(params.live!==true||params.executionMode!=="fal")throw new Error("This production is not a connected run.");
  const recipe=getActiveRecipe(params.templateSlug);if(!recipe?.concept)throw new Error("Production style unavailable.");
  const references=await lockedAssets();if(hashInput(job.script,params,references.map(({id,sha256})=>({id,sha256})))!==state.inputHash)throw new Error("Approved production inputs changed.");
  const save=()=>saveCheckpoint(path.join(directory(id),"production.json"),state,lock.assertOwned);
  const providers=await dependencies.providers();
  // The workspace ceiling is independent from each approved video's ceiling.
  // It is deliberately conservative; no client credit is fabricated or topped up.
  const budget=createBudget(postgresBudgetStore("live",dependencies.budgetScope),{usd:100_000_000,"higgsfield-credit":100_000_000});
  try{
   const outcome=await advanceProductionFlow({jobId:id,script:job.script,params,recipe,references,directory:directory(id),assertOwned:lock.assertOwned,
    services:{mode:"live",assets:dependencies.assets(),allowPendingCost:true,
     review:async request=>state.decisions.find(d=>d.target===request.target) as FlowDecision??null,
     queue:(op,payload)=>op.kind==="voice"?bramQueue(payload,"live",providers.higgsfield):op.kind==="alignment"?transcriptionQueue(payload,"live",providers.fal):falQueue(op,payload,"live",providers.fal),
     authorize:async plan=>{
      const saved=state.phases[plan.fingerprint];
      if(saved){
       const receipts=await requestReceipts(path.join(directory(id),"requests"));
       if(saved.quote.expiresAt>Date.now()||receipts.some(r=>r.fingerprint===plan.operations[0].fingerprint))return {budget,...saved};
       // Only a reservation with no provider attempt can be replaced after a
       // new human approval. Unknown attempts always retain their old identity.
       if(state.quote!.expiresAt>Date.now()&&state.approval!.quote===state.quote!.id){
        const book=await budget.snapshot(),entry=book.reservations[saved.approval.id];
        if(entry&&entry.entries.some(e=>e.state!=="reserved"&&e.state!=="released"))throw new Error("A previous attempt needs reconciliation before renewal.");
        if(entry)await budget.releaseUnsubmitted(saved.approval.id);
        delete state.phases[plan.fingerprint];await save();
       }else return {budget,...saved};
      }
      if(state.quote!.expiresAt<=Date.now())throw new Error("The production quote expired. Refresh and approve the remaining budget; existing requests and files are preserved.");
      const op=plan.operations[0],line=state.quote!.lines.find(l=>l.id===op.id&&l.model===op.model&&l.kind===op.kind);
      if(!line)throw new Error("This operation was not included in the approved quote.");
      const quantity=op.kind==="video"?Number(op.input.duration):line.quantity;
      if(!Number.isFinite(quantity)||quantity>line.quantity)throw new Error("This scene exceeds the approved duration. Split it before producing.");
      const maximum=Math.ceil(Number((quantity*line.unitPrice*1e6).toPrecision(12)));
      const quote:BudgetQuote={plan:plan.fingerprint,source:"provider",expiresAt:state.quote!.expiresAt,lines:[{operation:op.fingerprint,unit:line.unit,maximum}]};
      const caps={usd:line.unit==="usd"?maximum:0,"higgsfield-credit":line.unit==="higgsfield-credit"?maximum:0};
      const used={usd:0,"higgsfield-credit":0};for(const p of Object.values(state.phases))for(const l of p.quote.lines)used[l.unit]+=l.maximum;
      if(used.usd+caps.usd>state.quote!.caps.usd||used["higgsfield-credit"]+caps["higgsfield-credit"]>state.quote!.caps["higgsfield-credit"])throw new Error("The approved production budget is exhausted.");
      const approval:BudgetApproval={id:randomUUID(),mode:"live",plan:plan.fingerprint,quote:quoteHash(quote),expiresAt:quote.expiresAt,caps};
      state.phases[plan.fingerprint]={quote,approval};await save();return {budget,quote,approval};
     },
     cost:async(op,requestId)=>{if(!state.quote!.falBillingAvailable||op.kind==="voice")return null;return falCostReceipt(op,requestId,providers.fal);},
    }});
   state.error=outcome.status==="blocked-duration"?"One scene is longer than the supported 15-second animation. Create a version with shorter narration segments before generating its images.":null;await save();
   if(outcome.status==="rejected"||outcome.status==="blocked-duration")await lock.db.update(schema.jobs).set({status:"failed",error:state.error??"Stopped following the scene review."}).where(eq(schema.jobs.id,id));
   if(outcome.status==="ready-to-render"&&outcome.render){
    const rendered=await renderProductionFlow(outcome.render,path.join(directory(id),"montage"),path.join(directory(id),"checkpoints"),lock.assertOwned);
    const output=path.join(process.cwd(),"storage/outputs",`${id}.mp4`),temporary=`${output}.${randomUUID()}.tmp`;
    await mkdir(path.dirname(output),{recursive:true});await copyFile(rendered.output,temporary);await lock.assertOwned();await rename(temporary,output);
    const book=await budget.snapshot(),usage=budgetUsage({...book,reservations:Object.fromEntries(Object.entries(book.reservations).filter(([,r])=>r.jobId===id))});
    await lock.db.update(schema.jobs).set({status:"succeeded",finishedAt:new Date(),outputPath:output,error:null,params:{...params,finalDurationSeconds:rendered.duration,live:true,voice:"Bram",costReceiptsPending:true,providerBudgetUsage:usage,artifacts:[{label:"Production and voice verification",url:`/api/media/concepts/${id}/live/montage/production-flow.json`}]}}).where(eq(schema.jobs.id,id));
    state.finished=true;await save();
   }
  }catch(error){state.error=error instanceof Error?error.message:"Production interrupted. Saved requests are preserved.";await save();await lock.db.update(schema.jobs).set({error:state.error}).where(eq(schema.jobs.id,id));}
  finally{await providers.close();}
 });}catch(error){
  const state=await readState(id);
  if(state){state.error=error instanceof Error?error.message:"Production connection interrupted. Saved requests are preserved.";await saveCheckpoint(path.join(directory(id),"production.json"),state,lock.assertOwned);await lock.db.update(schema.jobs).set({error:state.error}).where(eq(schema.jobs.id,id));}
 }finally{await lock.release();}
}
