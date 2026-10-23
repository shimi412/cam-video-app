import {supervisedStep,supervisedAudioCheck} from '../agent/recovery-step';
import {reviewDelivery} from '../agent/delivery-review';
import {observeVideo} from '../agent/observations';
import {selectFilmBatch,filmNoteHash,correctionNoteIds,correctionNotesMatch,batchFinishingSettings,assertCompatibleFilmEdits,scopeRepeatedFilmNotes} from "./film-feedback-batch";
import {directFeedback,applyDirectedStoryboard,type FeedbackDirector} from "./feedback-director";
import {BackgroundState,requestedBackground,backgroundMayRun,backgroundAfterAttempt} from "./background-policy";
import type { StoryboardFeedback } from "./storyboard-feedback";
import {planPipelineRecovery,recoveryDiagnostic} from "../agent/recovery-supervisor";
import {freshPipelineRecovery,recoveryCapabilities,recoveryView,consumeRecovery} from "../agent/recovery-policy";
import { recoverLocalVoiceAlignment } from "./local-voice-alignment";
import { lockStoryboardComment, lockGlobalStoryboardComment } from "./storyboard-feedback";
import { completeUnstartedSemanticEndpoints } from "./semantic-endpoints";
import { prepareConcept } from "./preparation";
import {pendingFilmComments} from "./film-feedback";
import {FinishingReviewSchema,FinishingSettings,finishingTarget,assertFinishingApproval,type FinishingReview} from "./finishing-review";
import {feedbackStage,FINISHING_NOTICE} from "./review-stages";
import {FilmCorrectionSchema,correctionScenes} from "./film-correction";
import {quoteDraftFallback} from "./draft-fallback";
import {FilmFeedbackSchema,addFilmComment, replaceFilmComment,assertFilmFeedbackResolved} from "./film-feedback";
import { prepareCast } from "./cast-preparation";
import {recoverableRequest,imageBase,imageAttempt,supersededImage,withImageRecovery} from "./image-recovery";
import { HF_SEEDANCE,KLING_PRO,selectedModels,type VideoModels } from "./model-selection";
import { reserveCredits, settleCredits } from "../customer-wallet";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, rename, rm, readFile, cp } from "node:fs/promises";
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
import { bramQueue, higgsfieldVideoQueue, falQueue } from "./provider-transports";
import { transcriptionQueue } from "./transcription";
import { advanceProductionFlow, flowReviewTarget, renderProductionFlow, type FlowDecision, type FlowOutcome } from "./production-flow";
import { ApprovalSchema, QuoteSchema, createBudget, quoteHash, budgetUsage, type BudgetApproval, type BudgetQuote } from "./budget";
import { postgresBudgetStore } from "./budget-store";
import { Hash, readCheckpoint, saveCheckpoint, sha256,canonicalJson} from "./checkpoints";
import { CAM_VOICE } from "./cam-voice";
import { requestReceipts } from "./request-journal";
import { mediaFile } from "./preview-inputs";
import { DirectionSchema } from "./types";
import { StoryboardSheetSchema, StoryboardDecisionSchema, validateStoryboardAction, storyboardReviewContent, applyStoryboardEdits } from "./storyboard-review";
import { reworkRefusedImageInstruction } from "./image-rework";
import { withBrainRequest } from "../providers/brain";
import { StoryboardFeedbackSchema, emptyStoryboardFeedback, recordSceneComment, applySceneComment, applyGlobalStoryboardComment, combinedStoryboardEdits, mergeStoryboardEdits, assertStoryboardCommentsResolved, applyImageRevisions, revisionRequestsNewCast, revisionRequestsActionChange, revisionRequestsRecut } from "./storyboard-feedback";

export function workspaceProductionCaps(){
 const amount=(name:string)=>Math.round(z.coerce.number().finite().positive().max(100000).parse(process.env[name]??100)*1e6);
 return {usd:amount("CAM_WORKSPACE_USD_CEILING"),"higgsfield-credit":amount("CAM_WORKSPACE_HIGGSFIELD_CREDIT_CEILING")};
}
const approval=z.object({quote:Hash,actor:z.string().min(1),at:z.number()});
const decision=z.object({id:z.uuid(),target:Hash,decision:z.enum(["approved","rejected"]),mode:z.literal("live")});
const stateSchema=z.object({version:z.literal(1),background:BackgroundState.optional(),storyboardFirst:z.boolean().default(false),inputHash:Hash,quote:CamQuoteSchema.nullable(),pendingQuote:CamQuoteSchema.nullable().default(null),retries:z.record(z.string(),z.number().int().min(1).max(10)).optional(),pendingRetries:z.record(z.string(),z.number().int().min(1).max(10)).optional(),pendingRevision:z.object({scene:z.number().int().positive(),scenes:z.array(z.number().int().positive()).optional(),scope:z.enum(["scene","global","batch"]).optional(),notes:z.record(z.string(),z.string()).optional(),compiledHash:Hash.optional(),requestedGlobalScenes:z.array(z.number()).optional(),globalText:z.string().optional(),globalScenes:z.array(z.number()).optional(),noteHash:Hash,attempt:z.number().int().positive(),target:Hash}).nullable().default(null),approval:approval.nullable(),history:z.array(z.object({quote:CamQuoteSchema,approval})).default([]),decisions:z.array(decision),
  filmCorrection:FilmCorrectionSchema.optional(),phases:z.record(z.string(),z.object({quote:QuoteSchema,approval:ApprovalSchema})),error:z.string().nullable(),finished:z.boolean()});
const directory=(id:string)=>path.join(process.cwd(),"storage/concepts",z.uuid().parse(id),"live");
const hashInput=(script:string,params:ProductionParams,references:unknown)=>sha256(JSON.stringify({script,format:params.aspectRatio,directions:params.sceneDirections??{},...(params.sceneNarrations?{narrations:params.sceneNarrations}:{}),references}));
const sceneCommentText=z.string().trim().min(1).max(2000);
export const LiveAction=z.discriminatedUnion("action",[
 z.object({action:z.literal("finishing-settings"),target:Hash,settings:FinishingSettings,comments:z.array(z.uuid()).max(200).default([])}).strict(),
 z.object({action:z.literal("film-comment"),target:Hash,id:z.uuid(),text:z.string().trim().min(1).max(2000),seconds:z.number().finite().min(0).nullable(),replaces:z.object({id:z.uuid(),hash:Hash}).strict().optional()}).strict(),
 z.object({action:z.literal("film-apply"),target:Hash,id:z.uuid()}).strict(),
 z.object({action:z.literal("film-apply-all"),target:Hash,ids:z.array(z.uuid()).min(1).max(37)}).strict(),
 z.object({action:z.literal("film-comment-remove"),target:Hash,id:z.uuid()}).strict(),
 z.object({action:z.literal("film-defer"),target:Hash,id:z.uuid()}).strict(),
 z.object({action:z.literal("quote"),minimumResolution:z.enum(["1080p","720p"]).optional(),workflow:z.enum(["direct","draft-first"]).optional()}).strict(),
 z.object({action:z.literal("recovery-quote"),target:Hash}).strict(),
 z.object({action:z.literal("approve"),quote:Hash,customerQuote:Hash.optional()}).strict(),
 z.object({action:z.literal("review"),target:Hash,decision:z.enum(["approved","rejected"]),storyboardConfirmed:z.boolean().optional(),note:z.string().trim().max(2000).optional()}).strict(),
 z.object({action:z.literal("storyboard-lock"),target:Hash,scene:z.number().int().positive().max(36),text:sceneCommentText}).strict(),
 z.object({action:z.literal("storyboard-global-lock"),target:Hash,text:sceneCommentText,scenes:z.array(z.number().int().positive()).min(1).max(36).optional()}).strict(),
 z.object({action:z.literal("storyboard-batch-apply"),target:Hash}).strict(),
 z.object({action:z.literal("storyboard-comment"),target:Hash,scene:z.number().int().positive().max(36),text:sceneCommentText}).strict(),
 z.object({action:z.literal("storyboard-revision-quote"),target:Hash,scene:z.number().int().positive().max(36)}).strict(),
 z.object({action:z.literal("storyboard-apply"),target:Hash,scene:z.number().int().positive().max(36),text:sceneCommentText.optional()}).strict(),
 z.object({action:z.literal("storyboard-withdraw"),target:Hash,scene:z.number().int().positive().max(36)}).strict(),
 z.object({action:z.literal("storyboard-global-apply"),target:Hash,text:sceneCommentText,scenes:z.array(z.number().int().positive()).min(1).max(36).optional()}).strict(),
 z.object({action:z.literal("storyboard-global-withdraw"),target:Hash}).strict(),
 z.object({action:z.literal("storyboard-global-revision-quote"),target:Hash}).strict(),
 z.object({action:z.literal("resume")}).strict(),
 z.object({action:z.literal("edit"),scene:z.number().int().positive().max(36),direction:DirectionSchema}).strict(),
]);
async function readState(id:string){return readCheckpoint(path.join(directory(id),"production.json"),stateSchema);}
async function currentStoryboard(id:string,aspect?:string){
 const sheet=await readCheckpoint(path.join(directory(id),"storyboard-review.json"),StoryboardSheetSchema);
 if(sheet&&aspect)sheet.target=flowReviewTarget("live",id,"storyboard",storyboardReviewContent(sheet.panels,aspect));
 return sheet;
}
function withdrawRevisionOffer(feedback:z.infer<typeof StoryboardFeedbackSchema>,relock=false){
 for(const key of Object.keys(feedback.pendingImageRevisions))if(feedback.comments[key]?.status==="revision-quoted")feedback.comments[key]={...feedback.comments[key],status:relock?"locked":"needs-image-revision",message:"The previous change price was withdrawn. Request a new price for this comment."};
 if(feedback.globalComment?.status==="revision-quoted")feedback.globalComment={...feedback.globalComment,status:relock?"locked":"needs-image-revision",message:"The previous video-wide change price was withdrawn. Review a new price before updating these images."};
 feedback.pendingImageRevisions={};
 return feedback;
}
export function revisionOfferMatches(state:z.infer<typeof stateSchema>,feedback:z.infer<typeof StoryboardFeedbackSchema>,rawRevisions?:unknown){
 const pending=state.pendingRevision;if(!pending)return false;
 if(pending.scope==="batch"){
  if(Object.entries(pending.notes??{}).some(([key,text])=>feedback.comments[key]?.text!==text))return false;
  if(pending.globalText&&(feedback.globalComment?.text!==pending.globalText||JSON.stringify(feedback.globalComment.scenes)!==JSON.stringify(pending.requestedGlobalScenes??pending.globalScenes)))return false;
  // Key order is not a change: the compiled hash is canonical since 2026-10-22; older offers are matched through the saved file's own order (zod reorders keys on read, which refused Shimi's live revision).
  if(pending.compiledHash){const hashes=new Set([sha256(canonicalJson(feedback.pendingImageRevisions)),sha256(JSON.stringify(feedback.pendingImageRevisions)),...(rawRevisions!==undefined?[sha256(JSON.stringify(rawRevisions)),sha256(canonicalJson(rawRevisions))]:[])]);if(!hashes.has(pending.compiledHash))return false;}
  return (pending.scenes??[]).every(scene=>{
   const revision=feedback.pendingImageRevisions[scene];
   return revision&&revision.attempt===state.pendingRetries?.[`scene-${scene}-start`]&&(pending.compiledHash||(!pending.notes?.[scene]||revision.note===pending.notes[scene])&&(!pending.globalScenes?.includes(scene)||revision.globalNote===pending.globalText));
  });
 }
 const global=pending.scope==="global",comment=global?feedback.globalComment:feedback.comments[pending.scene],scenes=pending.scenes??[pending.scene];
 if(!comment||sha256(comment.text)!==pending.noteHash||!scenes.length)return false;
 if(global&&JSON.stringify(feedback.globalComment?.scenes)!==JSON.stringify(scenes))return false;
 return scenes.every(scene=>{
  const revision=feedback.pendingImageRevisions[scene]??(comment.status==="regenerating"?feedback.imageRevisions[scene]:undefined);
  return revision&&sha256(global?revision.globalNote??"":revision.note)===pending.noteHash&&state.pendingRetries?.[`scene-${scene}-start`]===revision.attempt&&(scene!==pending.scene||revision.attempt===pending.attempt);
 });
}
export async function liveView(id:string,aspect?:string){
 const state=await readState(id),outcome=await readCheckpoint(path.join(directory(id),"state.json"),z.custom<FlowOutcome>());
 const finishing=await readCheckpoint(path.join(directory(id),"finishing.json"),FinishingReviewSchema);
 const filmFeedback=await readCheckpoint(path.join(directory(id),"film-feedback.json"),FilmFeedbackSchema);
 const sheet=await currentStoryboard(id,aspect);
 const sheetDecision=sheet?await readCheckpoint(path.join(directory(id),"storyboard-reviews",`${sheet.target}.json`),StoryboardDecisionSchema):null;
 const feedback=await readCheckpoint(path.join(directory(id),"storyboard-feedback.json"),StoryboardFeedbackSchema)??emptyStoryboardFeedback();
 const thumbnail=(m:import("./preview-inputs").SceneMedia|undefined)=>m?{url:`/api/media/imports/${id}/${mediaFile(m)}`,kind:m.kind,width:m.width,height:m.height,...("quality" in m?{quality:m.quality}:{})}:null;
 const storyboard=sheet?{target:sheet.target,retrospective:sheet.retrospective,status:sheetDecision?.decision??"pending",note:sheetDecision?.note??null,rejectedScene:sheetDecision?.scene??null,globalComment:feedback.globalComment,
  panels:sheet.panels.map(p=>({...p,comment:feedback.comments[p.scene]??null,start:thumbnail(p.start),end:thumbnail(p.end),existing:thumbnail(p.existing),...(p.characterSheets?.length?{characterSheets:p.characterSheets.map(c=>({id:c.id,role:c.role,picture:thumbnail(c.media)!}))}:{})}))}:null;
 const repairProgress=await readCheckpoint(path.join(directory(id),"repair-progress.json"),z.object({capUsdMicros:z.number(),reservedUsdMicros:z.number(),costsSettled:z.literal(false),trials:z.array(z.object({name:z.string(),scene:z.number(),quoteUsdMicros:z.number(),requests:z.number(),completed:z.number(),reviews:z.array(z.enum(["approved","rejected"]))}))}));
 const finishingReview=await readCheckpoint(path.join(directory(id),"finishing-review.json"),z.object({status:z.string(),message:z.string(),scenes:z.array(DirectionSchema.extend({index:z.number(),narration:z.string()})).optional(),variants:z.array(z.object({name:z.string(),url:z.string().startsWith("/api/media/")})),listeningUrl:z.string().startsWith("/api/media/"),waveformUrl:z.string().startsWith("/api/media/"),reportUrl:z.string().startsWith("/api/media/"),newPaidRequests:z.number(),sourceTailNeedsListening:z.boolean()}));
 const repairQuote=await readCheckpoint(path.join(directory(id),"repair-quote.json"),z.object({approved:z.literal(false),expiresAt:z.number(),caps:z.object({usd:z.number()}),lines:z.array(z.object({id:z.string(),description:z.string(),maximum:z.number()}))}));
 let review=outcome?.status!=="rejected" && ["voice","direction","start","end"].includes(outcome?.review?.stage??"") ? undefined : outcome?.review?.stage==="storyboard"&&sheet?{...outcome.review,target:sheet.target}:outcome?.review;
 if(review?.stage==="storyboard"&&sheetDecision?.decision==="approved"&&state?.quote?.scope==="production")review=undefined;
 if(review?.stage==="draft-film"&&state?.decisions.some(d=>d.target===review!.target&&d.decision==="approved"))review=undefined;
 if(finishing&&!state?.finished)review=finishing.pending?undefined:{stage:"finishing-film",scene:null,target:finishing.target,film:{file:finishing.file,sha256:finishing.sha256,duration:finishing.duration}};
 const needsPreviewContinuation=Boolean(state?.quote?.selection?.workflow==="draft-first"&&review?.stage==="draft");
 let media=review?.media?`/api/media/imports/${id}/${mediaFile(review.media)}`:null;
 if(review?.film){
  const relative=path.relative(directory(id),review.film.file);
  if(review.stage==="finishing-film" ? !/^finishing\/[a-f0-9]{64}\/preview\.mp4$/.test(relative) : relative!=="draft-montage/draft.mp4")throw new Error("Invalid film preview.");
  media=`/api/media/concepts/${id}/live/${relative}?v=${review.film.sha256}`;
 }
 let audio:string|null=null;
 if(review?.audio){const relative=path.relative(path.join(process.cwd(),"storage"),review.audio.file);if(relative.startsWith("..")||path.isAbsolute(relative))throw new Error("Invalid review audio.");audio=`/api/media/${relative.split(path.sep).join("/")}`;}
 const receipts=await requestReceipts(path.join(directory(id),"requests"));
 const uncertain=receipts.find(r=>recoverableRequest(r,state?.retries??{}));
 const recoveryScenes=uncertain?.binding?.model===HF_SEEDANCE&&state?.quote?.selection?.workflow==="whimsical"?receipts.filter(r=>r.binding?.model===HF_SEEDANCE&&recoverableRequest(r,state?.retries??{})).map(r=>Number(imageBase(r.binding!.operation).split("-")[1])).sort((a,b)=>a-b):uncertain?[Number(imageBase(uncertain.binding!.operation).split("-")[1])]:[];
 const recovery=uncertain?{scenes:recoveryScenes,target:uncertain.fingerprint,scene:Number(imageBase(uncertain.binding!.operation).split("-")[1]),additionalUsd:state?.pendingQuote&&state.quote?(state.pendingQuote.caps.usd-state.quote.caps.usd)/1e6:null}:null;
 const needsProductionBudget=Boolean(state?.storyboardFirst&&state.quote?.scope==="storyboard"&&sheetDecision?.decision==="approved");
 const revision=state?.pendingQuote?state.pendingRevision:null;
 const visibleComments=pendingFilmComments(filmFeedback?.comments??[],review?.target,finishing);
 const view={failureAnalysis:state?.error?recoveryView(state.background?.supervision):null,storyboardPending:outcome?.storyboardPending??[],backgroundManaged:Boolean(state?.background?.enabled),finishing:finishing?{settings:finishing.settings,pending:Boolean(finishing.pending)}:null,filmCorrection:state?.filmCorrection?{comment:state.filmCorrection.comment,comments:correctionNoteIds(state.filmCorrection),scenes:state.filmCorrection.scenes,status:state.filmCorrection.status}:null,filmComments:visibleComments.map(({id,target,text,seconds,at,stage,interpretation})=>({id,target,text,seconds,at,interpretation,stage:stage??feedbackStage(text)})),needsPreviewContinuation,storyboardFirst:state?.storyboardFirst??false,needsProductionBudget,revisionScene:revision?.scope==="global"?null:revision?.scene??null,revisionScenes:revision?revision.scenes??[revision.scene]:null,revisionScope:revision?revision.scope??"scene":null,recovery,storyboard,repairProgress,finishingReview,repairQuote:repairQuote?{...repairQuote,expired:repairQuote.expiresAt<=Date.now()}:null,quote:state?.pendingQuote??state?.quote??null,approved:Boolean(state?.approval),renewing:Boolean(state?.pendingQuote),finished:state?.finished??false,error:state?.error??null,
  phase:finishing&&!state?.finished?"finishing-film":outcome?.phase??"quote",status:finishing&&!state?.finished?(finishing.pending?"pending":"awaiting-review"):outcome?.status??"awaiting-budget",review:review?{stage:review.stage,scene:review.scene,target:review.target,media,audio,duration:review.film?.duration??review.audio?.duration,width:review.media?.width,height:review.media?.height}:null,
  requests:receipts.map(r=>({operation:r.binding?.operation,state:supersededImage(r.binding?.operation??"",state?.retries??{})?"replaced":r.state,requestId:r.requestId??null})),
  costsPending:outcome?.events.filter(e=>e.stage.startsWith("cost-receipt-pending-")).length??0};
 return {...view,automaticRecovery:Boolean(view.error&&backgroundMayRun(state?.background?{...state.background,nextAt:0}:undefined,view))};
}

/** Human actions save their exact quote/review before any worker may advance. */
export async function updateLiveProduction(id:string, action:z.infer<typeof LiveAction>, actor:string, getQuote=fetchCamQuote, director:FeedbackDirector=directFeedback){
 assertCamConfigured();const lock=await acquireJobLock(id);if(!lock)throw new Error("This production is already working. Its saved progress will appear shortly.");
 try{
  const [job]=await lock.db.select().from(schema.jobs).where(eq(schema.jobs.id,id));
  if(!job||job.deletedAt)throw new Error("Production not found.");
  let params=job.params as ProductionParams & {live?:boolean;executionMode?:string};
  const recipe=getActiveRecipe(params.templateSlug);if(!recipe?.concept||params.live!==true||params.executionMode!=="fal")throw new Error("Create a production in the connected workspace first.");
  const priceRead=getQuote,feedbackTurn=director;
  getQuote=(...args)=>supervisedStep({jobId:id,category:'clay',stage:'price',inputs:args,directory:directory(id),assertOwned:lock.assertOwned,execute:()=>priceRead(...args)});
  director=(input,owned)=>supervisedStep({jobId:id,category:'clay',stage:'feedback',inputs:input,directory:directory(id),assertOwned:owned,execute:()=>feedbackTurn(input,owned)});
  let state=await readState(id);
  // Repair only untouched launches. An approved quote or any media receipt locks
  // the original graph, even when no result has finished downloading yet.
  if(action.action==="quote"&&!state?.quote&&!state?.approval&&!state?.pendingQuote&&!state?.decisions.length&&!(await requestReceipts(path.join(directory(id),"requests"))).length){
    const repaired=completeUnstartedSemanticEndpoints(params);
    if(repaired.scenes.length){
      const preparation=await prepareConcept(job.script,repaired.params,recipe,id);
      params={...repaired.params,...{preparation,endpointCompletion:{version:1,scenes:repaired.scenes,originalDirections:params.sceneDirections}}};
      await lock.assertOwned();
      const [persisted]=await lock.db.update(schema.jobs).set({params}).where(eq(schema.jobs.id,id)).returning();
      params=persisted.params as typeof params; // PostgreSQL jsonb canonicalizes key order; hash the saved representation.
    }
  }
  const references=await lockedAssets(),inputHash=hashInput(job.script,params,references.map(({id,sha256})=>({id,sha256})));
  if(state&&state.inputHash!==inputHash){
   if(state.approval)throw new Error("Production inputs changed. Create a new version to preserve the approved run.");
   // Recover a draft edit saved to PostgreSQL before its file checkpoint.
   state.inputHash=inputHash;state.quote=null;state.pendingQuote=null;
  }
  state??={version:1,storyboardFirst:true,inputHash,quote:null,pendingQuote:null,pendingRevision:null,approval:null,history:[],decisions:[],phases:{},error:null,finished:false};
  if(action.action==="resume"&&state.error){
   const saveRecovery=()=>saveCheckpoint(path.join(directory(id),"production.json"),state!,lock.assertOwned);
   state.background??=requestedBackground();state.background.supervision??=freshPipelineRecovery();
   await superviseClayFailure(id,state,saveRecovery);
   if(state.background.supervision.current?.decision?.action!=="retry-saved"||state.background.supervision.exhausted)return {advance:false};
   state.background.kick=true;await saveRecovery();return {advance:true};
  }
  const save=()=>saveCheckpoint(path.join(directory(id),"production.json"),state!,lock.assertOwned);
  const finishing=await readCheckpoint(path.join(directory(id),"finishing.json"),FinishingReviewSchema);
  if(finishing&&!state.finished){
   const file=path.join(directory(id),"film-feedback.json");
   let feedback=await readCheckpoint(file,FilmFeedbackSchema)??{version:1 as const,comments:[]};
   const outstanding=pendingFilmComments(feedback.comments,finishing.target,finishing);
   if(action.action==="review"){
    if(action.decision!=="approved")throw new Error("Use finishing feedback to request changes to this version.");
    assertFinishingApproval(finishing,action.target,outstanding.length);
    if(sha256(await readFile(finishing.file))!==finishing.sha256)throw new Error("The final file changed. Prepare and review it again.");
    // The client's explicit approval releases the film (2026-10-21, as Motion): Claude's delivery review is kept as notes, never a lock on a paid download.
    let deliveryNotes:string|undefined;
    try{await reviewDelivery({jobId:id,category:'clay',mediaHash:finishing.sha256,file:finishing.file,script:job.script,facts:{humanApproval:'This final approval action',settings:finishing.settings,appliedComments:finishing.appliedComments,outstanding,feedback:feedback.comments,duration:finishing.duration},evidence:[path.join(path.dirname(finishing.file),'controls/shots.png')]});}
    catch(error){const message=error instanceof Error?error.message:String(error);if(!message.startsWith('Final review:'))throw error;deliveryNotes=message.slice('Final review:'.length).trim();}
    const output=path.join(process.cwd(),"storage/outputs",`${id}.mp4`),temporary=`${output}.${randomUUID()}.tmp`;
    await mkdir(path.dirname(output),{recursive:true});await copyFile(finishing.file,temporary);await lock.assertOwned();await rename(temporary,output);
    await settleCredits(id,true);
    await saveCheckpoint(path.join(directory(id),"finishing.json"),{...finishing,approvedBy:actor,approvedAt:new Date().toISOString(),...(deliveryNotes?{deliveryNotes}:{})},lock.assertOwned);
    await lock.db.update(schema.jobs).set({status:"succeeded",finishedAt:new Date(),outputPath:output,error:null,params:{...params,finalDurationSeconds:finishing.duration,finishingRevision:finishing.sha256}}).where(eq(schema.jobs.id,id));
    state.finished=true;state.error=null;await save();return {advance:false};
   }
   if(action.action==="finishing-settings"||action.action==="film-apply"||action.action==="film-apply-all"){
    if(finishing.pending||action.target!==finishing.target)throw new Error("Wait for the current finishing preview before making another change.");
    const notes=action.action==="finishing-settings"?[]:selectFilmBatch(outstanding,action.action==="film-apply-all"?action.ids:[action.id]);
    const plan=notes.length?await director({jobId:id,target:action.target,phase:"finishing",script:job.script,panels:[],notes:notes.map(c=>({id:c.id,text:c.text,scenes:[],seconds:c.seconds})),history:feedback,settings:finishing.settings},lock.assertOwned):null;
    const settings=action.action==="finishing-settings"?action.settings:batchFinishingSettings(finishing.settings,plan!);
    const ids=action.action==="finishing-settings"?action.comments:notes.map(c=>c.id);
    if(ids.some(id=>!outstanding.some(c=>c.id===id)))throw new Error("The pending feedback changed. Reload before applying these settings.");
    await saveCheckpoint(path.join(directory(id),"finishing.json"),{...finishing,pending:settings,pendingComments:ids},lock.assertOwned);
    state.error=null;state.background=requestedBackground();await save();return {advance:true};
   }
   if(action.action==="film-comment"||action.action==="film-comment-remove"){
    if(finishing.pending||action.target!==finishing.target)throw new Error("Wait for the updated preview before adding feedback.");
    if(action.action==="film-comment"){
     const note={id:action.id,target:action.target,text:action.text,seconds:action.seconds,stage:"finishing" as const,actor,at:new Date().toISOString()};
     feedback=action.replaces?replaceFilmComment(feedback,note,finishing.duration,action.replaces,outstanding.map(c=>c.id)):addFilmComment(feedback,note,finishing.duration);
    }
    else feedback={...feedback,comments:feedback.comments.filter(c=>c.id!==action.id||!outstanding.some(o=>o.id===c.id))};
    await saveCheckpoint(file,feedback,lock.assertOwned);return {advance:false};
   }
   if(action.action==="resume")return {advance:Boolean(finishing.pending)};
   throw new Error("Your visuals are approved. Complete the sound, editing and subtitle review before downloading.");
  }
  if(action.action==="finishing-settings")throw new Error("Finishing opens after visual approval and high-quality preparation.");
  if(action.action==="quote"&&state.filmCorrection?.status==="quoted")throw new Error("Use Apply changes on your feedback to refresh this correction price.");
  if(action.action==="film-apply"||action.action==="film-apply-all"){
   const outcome=await readCheckpoint(path.join(directory(id),"state.json"),z.custom<FlowOutcome>());
   if(state.finished||!state.quote||state.quote.scope!=="production"||outcome?.review?.stage!=="draft-film"||outcome.review.target!==action.target||!outcome.review.film||state.decisions.some(d=>d.target===action.target))throw new Error("Review the current complete preview before applying a correction.");
   const book=await readCheckpoint(path.join(directory(id),"film-feedback.json"),FilmFeedbackSchema);
   if(!book)throw new Error("This feedback is no longer available.");
   const comments=selectFilmBatch(book.comments.filter(c=>c.target===action.target),action.action==="film-apply-all"?action.ids:[action.id]);
   if(state.filmCorrection?.status==="working")throw new Error("Your correction is already being prepared.");
   const batchNotes=comments.map(c=>({id:c.id,hash:filmNoteHash(c)}));
   if(state.filmCorrection?.status==="quoted"&&JSON.stringify(state.filmCorrection.notes)===JSON.stringify(batchNotes)&&state.pendingQuote&&state.pendingQuote.expiresAt>Date.now())return {advance:false};
   const feedback=await readCheckpoint(path.join(directory(id),"storyboard-feedback.json"),StoryboardFeedbackSchema)??emptyStoryboardFeedback();
   const timeline=JSON.parse(await readFile(path.join(directory(id),"draft-montage/editorial-timeline.json"),"utf8"));
   const sheet=await currentStoryboard(id,params.aspectRatio);if(!sheet)throw new Error("The saved storyboard is unavailable.");
   const notes=comments.map(c=>({id:c.id,text:c.text,scenes:c.seconds===null?sheet.panels.map(p=>p.scene):timeline.scenes.some((s:{startFrame:number;endFrame:number})=>c.seconds!*timeline.fps>=s.startFrame&&c.seconds!*timeline.fps<s.endFrame)?correctionScenes(c,timeline):[],seconds:c.seconds}));
   const plan=scopeRepeatedFilmNotes(await director({jobId:id,target:action.target,phase:"visual-film",script:job.script,panels:sheet.panels,notes,history:book,film:{file:outcome.review.film.file,sha256:outcome.review.film.sha256,samples:[...new Set(notes.flatMap(n=>n.scenes))].map(scene=>{const span=timeline.scenes.find((s:{scene:number})=>s.scene===scene);return {scene,seconds:(span.startFrame+span.endFrame)/2/timeline.fps};})}},lock.assertOwned),comments);
   for(const decision of plan.decisions){const c=comments.find(c=>c.id===decision.id)!;c.stage=decision.stage;c.interpretation=decision.message;}
   await saveCheckpoint(path.join(directory(id),"film-feedback.json"),book,lock.assertOwned);
   // Never partially execute a batch containing an unresolved or mixed instruction.
   if(plan.decisions.some(d=>d.stage==="mixed"||d.stage==="visual"&&d.status==="clarify"))throw new Error("Some visual notes need clarification. Read the explanation under each locked note, edit it, then apply the batch again. Finishing notes are kept for the next step.");
   assertCompatibleFilmEdits(plan);
   const visual=plan.decisions.filter(d=>d.stage==="visual");if(!visual.length)return {advance:false};
   const appliedNotes=comments.filter(c=>visual.some(d=>d.id===c.id));
   const comment=appliedNotes[0],correctionNotes=appliedNotes.map(c=>({id:c.id,hash:filmNoteHash(c)}));
   let directedFeedback={...structuredClone(feedback),globalEdits:{}};
   const images:ReturnType<typeof applyDirectedStoryboard>["images"]={};
   // Claude sees the whole batch at once. Accumulate its operations before pricing or executing.
   for(const decision of visual){
    const c=comments.find(c=>c.id===decision.id)!;
    const directed=applyDirectedStoryboard({...directedFeedback,globalComment:{text:c.text,actor,at:new Date().toISOString(),scenes:notes.find(n=>n.id===c.id)!.scenes,status:"locked",message:""}},{decisions:[{...decision,id:"global"}]});
    directedFeedback=directed.feedback;
    for(const [key,image] of Object.entries(directed.images))images[key]={...images[key],...image,instruction:[images[key]?.instruction,image.instruction].filter(Boolean).join("\n")};
   }
   const scenes=[...new Set(visual.flatMap(d=>d.changes.map(c=>c.scene)))],revisions:StoryboardFeedback["imageRevisions"]={};
   for(const [key,image] of Object.entries(images))revisions[key]={...feedback.imageRevisions[key],note:image.instruction,globalNote:undefined,...(image.cast?{cast:image.cast}:{}),attempt:(state.retries?.[`scene-${key}-start`]??0)+1,animationContract:2,instructionContract:3};
   const edits=directedFeedback.globalEdits;
   const board=planConcept(job.script,recipe,params.aspectRatio,params.sceneDirections,params.sceneNarrations);
   applyImageRevisions(board,{...feedback.imageRevisions,...revisions});
   applyStoryboardEdits(board,[],mergeStoryboardEdits(combinedStoryboardEdits(feedback),edits));
   const motionScenes=visual.flatMap(d=>d.changes.filter(c=>c.edit?.motion).map(c=>c.scene));
   if(!Object.keys(revisions).length&&!motionScenes.length){
    const receipts=await requestReceipts(path.join(directory(id),"requests"));
    feedback.edits=mergeStoryboardEdits(feedback.edits,edits);
    applyStoryboardEdits(board,sheet.panels,combinedStoryboardEdits(feedback));
    sheet.target=flowReviewTarget("live",id,"storyboard",storyboardReviewContent(sheet.panels,params.aspectRatio));
    await saveCheckpoint(path.join(directory(id),"storyboard-feedback.json"),feedback,lock.assertOwned);
    await saveCheckpoint(path.join(directory(id),"storyboard-review.json"),sheet,lock.assertOwned);
    await saveCheckpoint(path.join(directory(id),"state.json"),{status:"awaiting-review",phase:"storyboard",review:{stage:"storyboard",scene:null,target:sheet.target,storyboard:sheet.panels},events:[],paidGenerationAuthorized:false},lock.assertOwned);
    state.filmCorrection={source:action.target,comment:comment.id,commentHash:sha256(comment.text),notes:correctionNotes,scenes,status:"working",revisions:{},edits,reuseOnly:true,completedInputs:Object.fromEntries(receipts.filter(r=>r.state==="complete"&&r.binding).map(r=>[r.binding!.operation,r.binding!.payloadSha256]))};
    state.decisions=state.decisions.filter(d=>d.target!==sheet.target);state.pendingQuote=null;state.pendingRetries=undefined;state.error=null;
    await save();return {advance:false};
   }
   const revisedScenes=[...new Set([...Object.keys(revisions).map(Number),...motionScenes])];
   const lockedModels=selectedModels(state.quote.lines);
   const revisedPlan=generationPlan(job.script,params,board,placeholderTiming(board.shots.map(s=>s.narration)),references);
   // A previously local scene has no approved video model. Only explicitly
   // corrected scenes may add a newly priced operation; existing models stay locked.
   const newOperations=revisedPlan.modelNeeds.filter(n=>!lockedModels[n.operation]&&revisedScenes.includes(n.scene)).map(n=>n.operation);
   const priced=await getQuote(revisedPlan,{scope:"production",workflow:state.quote.selection?.workflow??"draft-first",minimumResolution:state.quote.selection?.minimumResolution??"1080p",lockedModels,newOperations});
   const retries={...(state.retries??{})};
   for(const scene of revisedScenes){
    if(params.sceneMedia?.[scene])throw new Error("Imported footage cannot be regenerated with this control.");
    const animationStage:string=priced.selection?.workflow==="whimsical"&&priced.lines.find(l=>l.id===`scene-${scene}-clip`)?.model===KLING_PRO?"clip":"draft";
    const localText=params.productionMethod==="whimsical-v1"&&board.shots.find(s=>s.index===scene)?.visualMode==="presenter-text";
    const stages:string[]=[...(revisions[scene]?["start",...(board.shots.find(s=>s.index===scene)?.endImagePrompt?["end"]:[])]:[]),...(!localText&&!newOperations.includes(`scene-${scene}-clip`)?[animationStage]:[])];
    for(const stage of stages){
     const key=`scene-${scene}-${stage}`;retries[key]=(retries[key]??0)+1;if(retries[key]>10)throw new Error("This scene has reached its revision limit.");
    }
   }
   const receipts=await requestReceipts(path.join(directory(id),"requests"));
   if(receipts.some(r=>/^scene-\d+-clip$/.test(r.binding?.operation??"")&&!(state.quote!.selection?.workflow==="whimsical"&&r.binding?.model===KLING_PRO)))throw new Error("High-quality finishing already started. Complete that version before requesting a correction.");
   const current=withImageRecovery(priced,retries);
   state.pendingQuote=renewCamQuote({...state.quote,plan:current.plan},current,new Set(receipts.map(r=>r.binding!.operation)));
   state.pendingRetries=retries;state.pendingRevision=null;
   state.filmCorrection={source:action.target,comment:comment.id,commentHash:sha256(comment.text),notes:correctionNotes,scenes,status:"quoted",revisions,edits,completedInputs:Object.fromEntries(receipts.filter(r=>r.state==="complete"&&r.binding).map(r=>[r.binding!.operation,r.binding!.payloadSha256]))};
   await save();return {advance:false};
  }
  if(action.action==="film-comment"||action.action==="film-comment-remove"||action.action==="film-defer"){
   const outcome=await readCheckpoint(path.join(directory(id),"state.json"),z.custom<FlowOutcome>());
   if(state.finished||outcome?.status!=="awaiting-review"||outcome.review?.stage!=="draft-film"||outcome.review.target!==action.target||!outcome.review.film||state.decisions.some(d=>d.target===action.target))throw new Error("This preview changed or was already reviewed. Reload before adding feedback.");
   const file=path.join(directory(id),"film-feedback.json");
   let book=await readCheckpoint(file,FilmFeedbackSchema)??{version:1 as const,comments:[]};
   if(action.action==="film-comment"){
    const existing=book.comments.some(c=>c.id===action.id);
    const note={id:action.id,target:action.target,text:action.text,seconds:action.seconds,stage:"unreviewed" as const,actor,at:new Date().toISOString()};
    book=action.replaces?replaceFilmComment(book,note,outcome.review.film.duration,action.replaces,book.comments.filter(c=>c.target===action.target||c.stage==="finishing").map(c=>c.id)):addFilmComment(book,note,outcome.review.film.duration);
    if(!existing&&state.filmCorrection?.status==="quoted"){state.pendingQuote=null;state.pendingRetries=undefined;state.filmCorrection=undefined;await save();}
   }
   else {
    if(state.filmCorrection&&correctionNoteIds(state.filmCorrection).includes(action.id)){
     if(state.filmCorrection.status==="working")throw new Error("This correction is being prepared. Wait for the new preview before changing it.");
     if(state.filmCorrection.status==="quoted"){state.pendingQuote=null;state.pendingRetries=undefined;state.filmCorrection=undefined;await save();}
    }
    if(action.action==="film-defer"){
     const note=book.comments.find(c=>c.id===action.id&&c.target===action.target);if(!note)throw new Error("This feedback is no longer available.");
     note.stage="finishing";note.interpretation=FINISHING_NOTICE;
    }else book={...book,comments:book.comments.filter(c=>c.id!==action.id||c.target!==action.target&&(c.stage??feedbackStage(c.text))!=="finishing")};
   }
   await saveCheckpoint(file,book,lock.assertOwned);return {advance:false};
  }
  if(action.action==="storyboard-lock"||action.action==="storyboard-global-lock"){
   const sheet=await currentStoryboard(id,params.aspectRatio);
   if(state.finished||state.quote?.scope!=="storyboard"||!sheet||sheet.retrospective||sheet.target!==action.target)throw new Error("This storyboard changed. Review it before locking feedback.");
   let feedback=await readCheckpoint(path.join(directory(id),"storyboard-feedback.json"),StoryboardFeedbackSchema)??emptyStoryboardFeedback();
   if(action.action==="storyboard-lock"&&!sheet.panels.some(p=>p.scene===action.scene))throw new Error("Scene not found.");
   feedback=withdrawRevisionOffer(feedback,true);
   feedback=action.action==="storyboard-lock"?lockStoryboardComment(feedback,action.scene,action.text,actor):lockGlobalStoryboardComment(feedback,sheet.panels,action.text,actor,action.scenes);
   await saveCheckpoint(path.join(directory(id),"storyboard-feedback.json"),feedback,lock.assertOwned);
   state.pendingQuote=null;state.pendingRevision=null;state.pendingRetries=undefined;
   state.decisions=state.decisions.filter(d=>d.target!==sheet.target);
   await lock.assertOwned();await rm(path.join(directory(id),"storyboard-reviews",`${sheet.target}.json`),{force:true});
   await save();return {advance:false};
  }
  if(action.action==="storyboard-global-apply"||action.action==="storyboard-global-withdraw"){
   if(state.finished||state.quote?.scope!=="storyboard")throw new Error("Video-wide feedback can be edited before the video budget is approved.");
   const sheet=await currentStoryboard(id,params.aspectRatio),outcome=await readCheckpoint(path.join(directory(id),"state.json"),z.custom<FlowOutcome>());
   if(!sheet||sheet.retrospective||sheet.target!==action.target)throw new Error("The storyboard changed. Reload it before editing this video.");
   let feedback=await readCheckpoint(path.join(directory(id),"storyboard-feedback.json"),StoryboardFeedbackSchema)??emptyStoryboardFeedback();
   const text=action.action==="storyboard-global-apply"?sceneCommentText.parse(action.text):null;
   if(text&&feedback.globalComment?.text===text&&feedback.globalComment.status!=="pending"&&JSON.stringify(action.action==="storyboard-global-apply"?action.scenes??feedback.globalComment.scenes:[])===JSON.stringify(feedback.globalComment.scenes))return {advance:false};
   feedback=withdrawRevisionOffer(feedback,state.pendingRevision?.scope==="batch");state.pendingRetries=undefined;
   feedback=text?applyGlobalStoryboardComment(feedback,sheet.panels,text,actor,action.action==="storyboard-global-apply"?action.scenes:undefined):{...feedback,globalComment:null};
   if(feedback.globalComment?.status==="applied"){
    const board=planConcept(job.script,recipe,params.aspectRatio,params.sceneDirections,params.sceneNarrations);
    applyStoryboardEdits(board,sheet.panels,combinedStoryboardEdits(feedback));
    sheet.target=flowReviewTarget("live",id,"storyboard",storyboardReviewContent(sheet.panels,params.aspectRatio));
   }
   await saveCheckpoint(path.join(directory(id),"storyboard-feedback.json"),feedback,lock.assertOwned);
   await saveCheckpoint(path.join(directory(id),"storyboard-review.json"),sheet,lock.assertOwned);
   const previousDecision=await readCheckpoint(path.join(directory(id),"storyboard-reviews",`${action.target}.json`),StoryboardDecisionSchema);
   if(previousDecision)await saveCheckpoint(path.join(directory(id),"storyboard-reviews","history",`${action.target}-${randomUUID()}.json`),previousDecision,lock.assertOwned);
   await lock.assertOwned();await rm(path.join(directory(id),"storyboard-reviews",`${action.target}.json`),{force:true});
   state.decisions=state.decisions.filter(d=>d.target!==action.target&&d.target!==outcome?.review?.target);state.pendingQuote=null;state.pendingRevision=null;state.error=null;
   await saveCheckpoint(path.join(directory(id),"state.json"),{...outcome,status:"awaiting-review",phase:"storyboard",review:{...outcome?.review,stage:"storyboard",scene:null,target:sheet.target,storyboard:sheet.panels}},lock.assertOwned);
   await save();return {advance:false};
  }
  if(action.action==="storyboard-comment"||action.action==="storyboard-apply"||action.action==="storyboard-withdraw"){
   if(state.finished||state.quote?.scope!=="storyboard")throw new Error("Scene feedback can be edited before the video budget is approved.");
   const sheet=await currentStoryboard(id,params.aspectRatio);
   const outcome=await readCheckpoint(path.join(directory(id),"state.json"),z.custom<FlowOutcome>());
   if(!sheet||sheet.retrospective||sheet.target!==action.target)throw new Error("The storyboard changed. Reload it before editing this scene.");
   const panel=sheet.panels.find(p=>p.scene===action.scene);if(!panel)throw new Error("Scene not found.");
   let feedback=await readCheckpoint(path.join(directory(id),"storyboard-feedback.json"),StoryboardFeedbackSchema)??emptyStoryboardFeedback();
   if(action.action==="storyboard-withdraw"){feedback={...feedback,comments:{...feedback.comments}};delete feedback.comments[action.scene];}
   else {
    const text=action.text===undefined?undefined:sceneCommentText.parse(action.text);
    const previous=feedback.comments[action.scene],changed=text!==undefined&&text!==previous?.text;
    // Save and apply one exact draft under the same lock. A duplicate save or
    // apply must not reset an applied correction or invalidate its offered price.
    if(!changed&&(action.action==="storyboard-comment"||previous&&previous.status!=="pending"&&previous.status!=="needs-character-sheet"))return {advance:false};
    if(changed)feedback=recordSceneComment(feedback,action.scene,text!,actor);
    if(action.action==="storyboard-apply")feedback=applySceneComment(feedback,panel);
   }
   if(Object.keys(feedback.pendingImageRevisions).length){
    feedback=withdrawRevisionOffer(feedback,state.pendingRevision?.scope==="batch");state.pendingRetries=undefined;
   }
   await saveCheckpoint(path.join(directory(id),"storyboard-feedback.json"),feedback,lock.assertOwned);
   // Comments and local edits reopen human review. They never schedule a provider worker.
   state.decisions=state.decisions.filter(d=>d.target!==sheet.target);state.pendingQuote=null;state.pendingRevision=null;state.error=null;
   if(action.action==="storyboard-apply"&&feedback.comments[action.scene]?.status==="applied"){
    const board=planConcept(job.script,recipe,params.aspectRatio,params.sceneDirections,params.sceneNarrations);
    applyStoryboardEdits(board,sheet.panels,combinedStoryboardEdits(feedback));
    sheet.target=flowReviewTarget("live",id,"storyboard",storyboardReviewContent(sheet.panels,params.aspectRatio));
   }
   await saveCheckpoint(path.join(directory(id),"storyboard-review.json"),sheet,lock.assertOwned);
   // Remove the persisted human approval even when only a comment changed.
   const previousDecision=await readCheckpoint(path.join(directory(id),"storyboard-reviews",`${action.target}.json`),StoryboardDecisionSchema);
   if(previousDecision)await saveCheckpoint(path.join(directory(id),"storyboard-reviews","history",`${action.target}-${randomUUID()}.json`),previousDecision,lock.assertOwned);
   await lock.assertOwned();await rm(path.join(directory(id),"storyboard-reviews",`${action.target}.json`),{force:true});
   await saveCheckpoint(path.join(directory(id),"state.json"),{...outcome,status:"awaiting-review",phase:"storyboard",review:{...outcome?.review,stage:"storyboard",scene:null,target:sheet.target,storyboard:sheet.panels}},lock.assertOwned);
   await save();return {advance:false};
  }
  if(action.action==="edit"){
   if(state.approval)throw new Error("This production was approved. Create a new version to change its scenes.");
   const board=planConcept(job.script,recipe,params.aspectRatio,params.sceneDirections,params.sceneNarrations);
   if(!board.shots.some(s=>s.index===action.scene))throw new Error("Scene not found.");
   const changed={...params,sceneDirections:{...params.sceneDirections,[action.scene]:action.direction}};
   state.inputHash=hashInput(job.script,changed,references.map(({id,sha256})=>({id,sha256})));state.quote=null;state.error=null;
   await lock.db.update(schema.jobs).set({params:changed}).where(eq(schema.jobs.id,id));await save();return {advance:false};
  }
  if(action.action==="quote"||action.action==="storyboard-batch-apply"||action.action==="recovery-quote"||action.action==="storyboard-revision-quote"||action.action==="storyboard-global-revision-quote"){
   if(state.finished||state.decisions.some(d=>d.decision==="rejected"))throw new Error("This production has ended. Create a new version to change it.");
   const board=planConcept(job.script,recipe,params.aspectRatio,params.sceneDirections,params.sceneNarrations);
   let retries=state.pendingRetries??state.retries??{};
   let feedback=await readCheckpoint(path.join(directory(id),"storyboard-feedback.json"),StoryboardFeedbackSchema)??emptyStoryboardFeedback();
   let revisions={...feedback.imageRevisions,...feedback.pendingImageRevisions};
   const creativeQuote=action.action==="storyboard-batch-apply"||action.action==="storyboard-revision-quote"||action.action==="storyboard-global-revision-quote";
   if(action.action==="storyboard-batch-apply"){
    const sheet=await currentStoryboard(id,params.aspectRatio);
    if(state.quote?.scope!=="storyboard"||!sheet||sheet.retrospective||sheet.target!==action.target)throw new Error("Review this storyboard before applying feedback.");
    const noteEntries=Object.entries(feedback.comments).filter(([,c])=>c.status==="locked"||c.status==="revision-quoted");
    const global=feedback.globalComment&&["locked","revision-quoted"].includes(feedback.globalComment.status)?feedback.globalComment:null;
    if(!noteEntries.length&&!global)throw new Error("Lock your feedback before applying it.");
    feedback=withdrawRevisionOffer(feedback);
    const directed=applyDirectedStoryboard(feedback,await director({jobId:id,target:action.target,phase:"storyboard",script:job.script,panels:sheet.panels,history:feedback,notes:[...(global?[{id:"global",text:global.text,scenes:global.scenes}]:[]),...noteEntries.map(([key,c])=>({id:`scene:${key}`,text:c.text,scenes:[Number(key)]}))]},lock.assertOwned));
    feedback=directed.feedback;
    const notes=Object.fromEntries(noteEntries.filter(([key])=>feedback.comments[key].status==="needs-image-revision").map(([key,c])=>[key,c.text]));
    const globalScenes=feedback.globalComment?.status==="needs-image-revision"&&global?global.scenes.filter(scene=>directed.images[scene]):[];
    const scenes=Object.keys(directed.images).map(Number).sort((a,b)=>a-b);
    applyStoryboardEdits(board,sheet.panels,combinedStoryboardEdits(feedback));
    sheet.target=flowReviewTarget("live",id,"storyboard",storyboardReviewContent(sheet.panels,params.aspectRatio));
    await saveCheckpoint(path.join(directory(id),"storyboard-review.json"),sheet,lock.assertOwned);
    state.decisions=state.decisions.filter(d=>d.target!==action.target&&d.target!==sheet.target);
    await lock.assertOwned();await rm(path.join(directory(id),"storyboard-reviews",`${action.target}.json`),{force:true});
    if(!scenes.length){
     await saveCheckpoint(path.join(directory(id),"storyboard-feedback.json"),feedback,lock.assertOwned);
     state.pendingQuote=null;state.pendingRevision=null;state.pendingRetries=undefined;
     await save();return {advance:false};
    }
    retries={...(state.retries??{})};
    const pending:StoryboardFeedback["pendingImageRevisions"]={};
    for(const scene of scenes){
     const shot=board.shots.find(s=>s.index===scene);if(!shot||params.sceneMedia?.[scene])throw new Error("This scene cannot be regenerated.");
     for(const stage of ["start",...(shot.endImagePrompt?["end"]:[])]){
      const op=`scene-${scene}-${stage}`;retries[op]=(state.retries?.[op]??0)+1;if(retries[op]>10)throw new Error("This scene has reached its revision limit.");
     }
     const previous=feedback.imageRevisions[scene];
     pending[scene]={...previous,note:directed.images[scene].instruction,globalNote:undefined,...(directed.images[scene].cast?{cast:directed.images[scene].cast}:{}),attempt:retries[`scene-${scene}-start`],animationContract:2,instructionContract:3};
    }
    feedback.pendingImageRevisions=pending;revisions={...feedback.imageRevisions,...pending};
    state.pendingRevision={scope:"batch",compiledHash:sha256(canonicalJson(pending)),requestedGlobalScenes:global?.scenes,scene:scenes[0],scenes,notes,globalText:globalScenes.length?global!.text:undefined,globalScenes,noteHash:sha256(JSON.stringify({notes,globalText:global?.text,globalScenes})),attempt:retries[`scene-${scenes[0]}-start`],target:sheet.target};
    for(const key of Object.keys(notes))feedback.comments[key]={...feedback.comments[key],status:"revision-quoted",message:"Included in the feedback batch. Approve the total price to start."};
    if(globalScenes.length)feedback.globalComment={...feedback.globalComment!,status:"revision-quoted",message:"Included in the feedback batch. Approve the total price to start."};
   }
   if(action.action==="storyboard-revision-quote"||action.action==="storyboard-global-revision-quote"){
    const sheet=await currentStoryboard(id,params.aspectRatio),global=action.action==="storyboard-global-revision-quote";
    if(state.finished||state.quote?.scope!=="storyboard"||!sheet||sheet.retrospective||sheet.target!==action.target)throw new Error("Review this storyboard before requesting an image change.");
    const scenes=global?feedback.globalComment?.scenes??[]:[action.scene];
    if(!scenes.length||scenes.some(scene=>!sheet.panels.some(panel=>panel.scene===scene)))throw new Error("Scene not found.");
    const comment=global?feedback.globalComment:feedback.comments[action.scene];if(!comment||comment.status==="applied")throw new Error("Save a new comment before requesting an image change.");
    if(global&&revisionRequestsNewCast(comment.text))throw new Error("Add new characters to a specific scene first so their references can be prepared together.");
    if(revisionRequestsRecut(comment.text))throw new Error("This request changes the scene breakdown. Image regeneration cannot apply it.");
    if(revisionRequestsActionChange(comment.text))throw new Error("This action change needs revised start/end directions and timing before image generation.");
    retries={...(state.retries??{})};
    const pending:z.infer<typeof StoryboardFeedbackSchema>["pendingImageRevisions"]={};
    for(const scene of scenes){
     const shot=board.shots.find(shot=>shot.index===scene);if(!shot)throw new Error("Scene not found.");
     if(params.sceneMedia?.[scene])throw new Error("Imported footage cannot be regenerated as a storyboard image.");
     for(const stage of ["start",...(shot.endImagePrompt?["end"]:[])]){
      const operation=`scene-${scene}-${stage}`;retries[operation]=(state.retries?.[operation]??0)+1;
      if(retries[operation]>10)throw new Error("This scene has reached its revision limit.");
     }
     const previous=feedback.imageRevisions[scene];
     pending[scene]={...previous,...(!global&&revisionRequestsNewCast(comment.text)?{cast:prepareCast(comment.text,scene)}:{}),note:global?previous?.note??"":comment.text,...(global?{globalNote:comment.text}:{}),attempt:retries[`scene-${scene}-start`],animationContract:2,instructionContract:3};
    }
    feedback=withdrawRevisionOffer(feedback);
    state.pendingRevision={scene:scenes[0],scenes,scope:global?"global":"scene",noteHash:sha256(comment.text),attempt:retries[`scene-${scenes[0]}-start`],target:sheet.target};
    revisions={...feedback.imageRevisions,...pending};feedback.pendingImageRevisions=pending;
    if(global)feedback.globalComment={...feedback.globalComment!,status:"revision-quoted",scenes,message:"Review the additional image cost to update this storyboard. Individual scene comments are kept."};
    else feedback.comments[action.scene]={...comment,status:"revision-quoted",message:"Review the additional image cost before applying this change. Other scenes will be kept."};
   }
   applyImageRevisions(board,revisions);
   const imagePlan=generationPlan(job.script,params,board,placeholderTiming(board.shots.map(s=>s.narration)),references);
   applyStoryboardEdits(board,[],combinedStoryboardEdits(feedback));
   if(action.action==="recovery-quote"){
    await superviseClayFailure(id,state,()=>saveCheckpoint(path.join(directory(id),"production.json"),state,lock.assertOwned));
    if(state.background?.supervision?.current?.decision?.action!=="replace-failed")throw new Error("The saved recovery analysis does not request a replacement.");
    if(!state.approval||!state.quote)throw new Error("Approve the original budget first.");
    const receipts=await requestReceipts(path.join(directory(id),"requests"));
    const uncertain=receipts.find(r=>r.fingerprint===action.target&&recoverableRequest(r,state.retries??{}));
    const operation=uncertain?.binding?.operation??"",base=imageBase(operation);
    if(!uncertain)throw new Error("This recovery request changed.");
    if(/^scene-\d+-draft$/.test(base)&&uncertain.binding?.model===HF_SEEDANCE){
     const failures=state.quote.selection?.workflow==="whimsical"?receipts.filter(r=>r.binding?.model===HF_SEEDANCE&&/^scene-\d+-draft(?:-retry-\d+)?$/.test(r.binding.operation)&&recoverableRequest(r,state.retries??{})):[uncertain];
     const lockedModels:VideoModels={...selectedModels(state.quote.lines)};
     for(const failed of failures)lockedModels[imageBase(failed.binding!.operation).replace(/-draft$/,"-clip")]=KLING_PRO;
     const current=await getQuote(generationPlan(job.script,params,board,placeholderTiming(board.shots.map(s=>s.narration)),references),{scope:"production",workflow:state.quote.selection?.workflow??"draft-first",minimumResolution:state.quote.selection?.minimumResolution??"1080p",lockedModels});
     let replacement={quote:state.quote,retries:state.retries??{}};
     for(const failed of failures)replacement=quoteDraftFallback(replacement.quote,current,failed,receipts,replacement.retries);
     state.pendingQuote=renewCamQuote(replacement.quote,withImageRecovery(current,replacement.retries),new Set(receipts.map(r=>r.binding!.operation)));state.pendingRetries=replacement.retries;
     await save();return {advance:false};
    }
    retries={...(state.retries??{}),[base]:imageAttempt(operation)+1};
   }
   if(!state.approval)state.storyboardFirst=true;
   const sheet=await currentStoryboard(id,params.aspectRatio);
   const sheetDecision=sheet?await readCheckpoint(path.join(directory(id),"storyboard-reviews",`${sheet.target}.json`),StoryboardDecisionSchema):null;
   const scope=creativeQuote||state.storyboardFirst&&sheetDecision?.decision!=="approved"?"storyboard":"production";
   const priceBasis=!creativeQuote&&state.pendingQuote?.draftRecoveries?.length&&state.pendingRetries?state.pendingQuote:state.quote;
   const modelLocked=Boolean(state.approval&&priceBasis&&priceBasis.scope!=="storyboard");
   const editedPlan=generationPlan(job.script,params,board,placeholderTiming(board.shots.map(s=>s.narration)),references);
   const current=withImageRecovery(await getQuote(editedPlan,{scope,workflow:modelLocked?(priceBasis?.selection?.workflow??"direct"):(params.productionMethod==="whimsical-v1"?"whimsical":"draft-first"),minimumResolution:modelLocked?(priceBasis?.selection?.minimumResolution??"1080p"):"1080p",...(modelLocked?{lockedModels:selectedModels(priceBasis!.lines)}:{})}),retries);

   if(state.approval&&priceBasis){
    const receipts=await requestReceipts(path.join(directory(id),"requests"));
    // An explicit scene-revision quote may bind a new plan while retaining every attempted cost.
    // Ordinary refreshes still reject a changed production fingerprint.
    // Local composition changes alter plan metadata, not previously purchased media.
    // Permit this transition only from the exact original image plan to an approved
    // storyboard, before any video budget exists, and preserve every paid input.
    const localStoryboardExpansion=priceBasis.scope==="storyboard"&&scope==="production"&&sheetDecision?.decision==="approved"&&
     priceBasis.plan===imagePlan.fingerprint&&current.plan===editedPlan.fingerprint&&
     imagePlan.operations.filter(o=>o.kind!=="video").every(o=>editedPlan.operations.some(n=>n.id===o.id&&n.fingerprint===o.fingerprint))&&
     editedPlan.operations.filter(o=>o.kind!=="video").every(o=>imagePlan.operations.some(n=>n.id===o.id&&n.fingerprint===o.fingerprint))&&
     receipts.every(r=>priceBasis.lines.some(line=>line.id===r.binding?.operation&&line.kind!=="video"));
    const previous=creativeQuote||revisionOfferMatches(state,feedback)||localStoryboardExpansion?{...priceBasis,plan:current.plan}:priceBasis;
    state.pendingQuote=renewCamQuote(previous,current,new Set(receipts.map(r=>r.binding!.operation)));
   }else state.quote=current;
   if(action.action==="recovery-quote"||creativeQuote)state.pendingRetries=retries;
   if(creativeQuote)await saveCheckpoint(path.join(directory(id),"storyboard-feedback.json"),feedback,lock.assertOwned);
   await save();return {advance:false};
  }
  if(action.action==="approve"){
   const offered=state.pendingQuote??state.quote;
   if(!offered||offered.id!==action.quote)throw new Error("This quote changed. Review the current quote.");
   if(!state.approval&&offered.scope!=="storyboard")throw new Error("Refresh the storyboard budget before continuing. Animation is quoted after you review the images.");
   if(offered.scope==="production"&&state.storyboardFirst&&!(["draft-first","whimsical"].includes(offered.selection?.workflow??"")))throw new Error("Refresh the budget to include the automatic draft and finishing stages.");
   const limits=workspaceProductionCaps();
   if(offered.caps.usd>limits.usd||offered.caps["higgsfield-credit"]>limits["higgsfield-credit"])throw new Error("This complete quote exceeds the workspace spending ceiling. Ask the administrator to review the ceiling ; no narration or animation has started.");
   if(offered.expiresAt<=Date.now())throw new Error("This quote expired. Refresh it before approval.");
   if(state.filmCorrection?.status==="quoted"){
    const correction=state.filmCorrection,book=await readCheckpoint(path.join(directory(id),"film-feedback.json"),FilmFeedbackSchema);
    const outcome=await readCheckpoint(path.join(directory(id),"state.json"),z.custom<FlowOutcome>());
    if(!state.pendingQuote||!book||!correctionNotesMatch(correction,book.comments)||outcome?.review?.target!==correction.source)throw new Error("This correction changed. Prepare its price again.");
   }
   if(state.pendingRevision){
    const pending=state.pendingRevision,feedback=await readCheckpoint(path.join(directory(id),"storyboard-feedback.json"),StoryboardFeedbackSchema)??emptyStoryboardFeedback();
    const sheet=await currentStoryboard(id,params.aspectRatio);
    const rawFeedback=await readFile(path.join(directory(id),"storyboard-feedback.json"),"utf8").then(t=>JSON.parse(t) as {pendingImageRevisions?:unknown}).catch(()=>null);
    const offerMatches=revisionOfferMatches(state,feedback,rawFeedback?.pendingImageRevisions);
    if(!state.pendingQuote||!offerMatches||sheet?.target!==pending.target){console.error(`[live-action] ${id} revision approval refused: pendingQuote=${Boolean(state.pendingQuote)} offerMatches=${offerMatches} rawRead=${rawFeedback!==null} sheetTarget=${sheet?.target?.slice(0,12)} pendingTarget=${pending.target.slice(0,12)}`);throw new Error("This scene comment changed. Request a fresh image price before approving.");}
   }
   if(action.customerQuote&&(offered.caps.usd>0||offered.caps["higgsfield-credit"]>0))await reserveCredits(id,action.customerQuote,offered.id);
   if(state.pendingQuote){
    if(offered.expiresAt<=Date.now())throw new Error("This quote expired. Refresh it before approval.");
    const feedback=await readCheckpoint(path.join(directory(id),"storyboard-feedback.json"),StoryboardFeedbackSchema)??emptyStoryboardFeedback();
    if(state.filmCorrection?.status==="quoted"){
     const correction=state.filmCorrection;
     const archive=path.join(directory(id),"film-history",correction.source);
     await mkdir(archive,{recursive:true});await cp(path.join(directory(id),"draft-montage"),path.join(archive,"montage"),{recursive:true});
     for(const file of ["draft-film.json","state.json","storyboard-review.json"])await copyFile(path.join(directory(id),file),path.join(archive,file));
     feedback.imageRevisions={...feedback.imageRevisions,...correction.revisions};
     feedback.edits=mergeStoryboardEdits(feedback.edits,correction.edits??{});
     const book=await readCheckpoint(path.join(directory(id),"film-feedback.json"),FilmFeedbackSchema);
     for(const scene of correction.scenes)feedback.comments[scene]={text:book!.comments.filter(c=>correctionNoteIds(correction).includes(c.id)).map(c=>c.text).join("\n").slice(0,2000),actor,at:new Date().toISOString(),status:"regenerating",message:"Preparing your corrected scene. The other plans are preserved."};
     await saveCheckpoint(path.join(directory(id),"storyboard-feedback.json"),feedback,lock.assertOwned);
     state.filmCorrection={...correction,status:"working"};
    }
    if(Object.keys(feedback.pendingImageRevisions).length){
     const sheet=await currentStoryboard(id,params.aspectRatio);
     if(sheet)state.decisions=state.decisions.filter(d=>d.target!==sheet.target);
     if((state.pendingRevision?.scope==="global"||state.pendingRevision?.scope==="batch"&&state.pendingRevision.globalText)&&feedback.globalComment)feedback.globalComment={...feedback.globalComment,status:"regenerating",message:"Your video-wide image change is being prepared. Individual scene requests remain separate."};
     if(state.pendingRevision?.scope!=="global")for(const key of Object.keys(feedback.pendingImageRevisions))if(feedback.comments[key]?.status==="revision-quoted")feedback.comments[key]={...feedback.comments[key],status:"regenerating",message:"Your image change is being prepared. Other scenes are preserved."};
     feedback.imageRevisions={...feedback.imageRevisions,...feedback.pendingImageRevisions};feedback.pendingImageRevisions={};
     await saveCheckpoint(path.join(directory(id),"storyboard-feedback.json"),feedback,lock.assertOwned);
    }
    if(state.filmCorrection?.status==="working")await saveCheckpoint(path.join(directory(id),"state.json"),{status:"pending",phase:"film-correction",events:[],paidGenerationAuthorized:true},lock.assertOwned);
    state.history.push({quote:state.quote!,approval:state.approval!});
    state.quote=state.pendingQuote;state.pendingQuote=null;state.pendingRevision=null;if(state.pendingRetries){state.retries=state.pendingRetries;state.pendingRetries=undefined;}state.approval={quote:action.quote,actor,at:Date.now()};state.error=null;await save();
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
   const sheet=outcome?.review?.stage==="storyboard"?await currentStoryboard(id,params.aspectRatio):null;
   if(!outcome?.review||(sheet?.target??outcome.review.target)!==action.target)throw new Error("This review changed. Reload the current scene.");
   if(outcome.review.stage==="draft-film"&&action.decision==="approved")assertFilmFeedbackResolved((await readCheckpoint(path.join(directory(id),"film-feedback.json"),FilmFeedbackSchema))?.comments??[],action.target);
   const old=state.decisions.find(d=>d.target===action.target);
   if(old&&old.decision!==action.decision)throw new Error("This decision is already saved. Create a new version for changed creative choices.");
   if(outcome.review.stage==="storyboard"){
    if(!sheet||sheet.retrospective)throw new Error("Review the storyboard of the active production.");
    validateStoryboardAction(action.target,sheet.target,action.decision,action.storyboardConfirmed,action.note);
    if(action.decision==="approved")assertStoryboardCommentsResolved(await readCheckpoint(path.join(directory(id),"storyboard-feedback.json"),StoryboardFeedbackSchema)??emptyStoryboardFeedback());
    await saveCheckpoint(path.join(directory(id),"storyboard-review.json"),sheet,lock.assertOwned);
    await saveCheckpoint(path.join(directory(id),"state.json"),{...outcome,review:{...outcome?.review,stage:"storyboard",scene:null,target:sheet.target,storyboard:sheet.panels}},lock.assertOwned);
    await saveCheckpoint(path.join(directory(id),"storyboard-reviews",`${sheet.target}.json`),StoryboardDecisionSchema.parse({target:sheet.target,decision:action.decision,actor,at:new Date().toISOString(),note:action.note??"Complete storyboard and narrative meaning approved."}),lock.assertOwned);
   }
   if(!old)state.decisions.push({id:randomUUID(),mode:"live",target:action.target,decision:action.decision});
   state.error=null;await save();
   if(action.decision==="rejected")await settleCredits(id,false);
   if(state.storyboardFirst&&outcome.review.stage==="storyboard"&&action.decision==="approved"&&state.filmCorrection?.status!=="working")return {advance:false};
  }else if(!state.approval)throw new Error("Approve the production quote first.");
  if(state.storyboardFirst&&state.quote?.scope==="storyboard"){
   const sheet=await readCheckpoint(path.join(directory(id),"storyboard-review.json"),StoryboardSheetSchema);
   const approved=sheet&&state.decisions.some(d=>d.target===sheet.target&&d.decision==="approved");
   if(approved)return {advance:false};
  }
  if(state.finished||state.pendingQuote||state.decisions.some(d=>d.decision==="rejected")&&action.action!=="review")return {advance:false};
  state.background=requestedBackground();await save();
  return {advance:true};
 }finally{
  await observeVideo(id,async()=>({attemptedAction:action,result:await agentProductionSnapshot(id)}));
  await lock.release();
 }
}

async function agentProductionSnapshot(id:string){
 const view=await liveView(id);
 return {phase:view.phase,status:view.status,error:view.error,review:view.review,requests:view.requests,finished:view.finished};
}

export async function runLiveProduction(id:string, dependencies={providers:connectCamProviders,assets:connectCamAssets,budgetScope:"cam-provider-account"},options:{background?:boolean}={}){
 const lock=await acquireJobLock(id);if(!lock)return;
 let belongsToDatabase=false;
 try{await withCamExecution(id,async()=>{
  const [job]=await lock.db.select().from(schema.jobs).where(eq(schema.jobs.id,id));
  if(!job||job.deletedAt)return;belongsToDatabase=true;
  const state=await readState(id);if(!state?.approval||!state.quote||state.pendingQuote||state.finished)return;
  if(options.background){
   if(!backgroundMayRun(state.background,await liveView(id)))return;
   state.background={...state.background!,nextAt:Date.now()+4000};
   await saveCheckpoint(path.join(directory(id),"production.json"),state,lock.assertOwned);
  }
  const saveRecovery=()=>saveCheckpoint(path.join(directory(id),"production.json"),state,lock.assertOwned);
  if(state.error){
   await superviseClayFailure(id,state,saveRecovery);
   const r=state.background?.supervision;
   if(r?.current?.decision?.action!=="retry-saved"||r.exhausted)return;
   consumeRecovery(r);state.error=null;await saveRecovery();
  }
  const params=job.params as ProductionParams & {live?:boolean;executionMode?:string};
  if(params.live!==true||params.executionMode!=="fal")throw new Error("This production is not a connected run.");
  const recipe=getActiveRecipe(params.templateSlug);if(!recipe?.concept)throw new Error("Production style unavailable.");
  const references=await lockedAssets();if(hashInput(job.script,params,references.map(({id,sha256})=>({id,sha256})))!==state.inputHash)throw new Error("Approved production inputs changed.");
  const save=()=>saveCheckpoint(path.join(directory(id),"production.json"),state,lock.assertOwned);
  if(state.storyboardFirst&&state.quote.scope==="storyboard"){
   const sheet=await readCheckpoint(path.join(directory(id),"storyboard-review.json"),StoryboardSheetSchema);
   if(sheet&&state.decisions.some(d=>d.target===sheet.target&&d.decision==="approved"))return;
  }
  const finishing=await readCheckpoint(path.join(directory(id),"finishing.json"),FinishingReviewSchema);
  if(finishing){
   if(finishing.pending){
    try{
     const settings=finishing.pending,revision=sha256(JSON.stringify({packet:finishing.packet.fingerprint,settings}));
     const breaths=settings.pace==="natural"?undefined:Object.fromEntries(finishing.packet.board.shots.map(s=>[s.index,settings.pace==="brisk"?.25:.7]));
     const rendered=await renderProductionFlow(finishing.packet,path.join(directory(id),"finishing",revision),path.join(directory(id),"finishing-checkpoints"),lock.assertOwned,{hideTitles:false,reason:"Client finishing settings",reviewedBy:"client",...settings,breaths});
     const hash=sha256(await readFile(rendered.output));
     await saveCheckpoint(path.join(directory(id),"finishing.json"),{...finishing,settings,pending:null,pendingComments:[],appliedComments:[...new Set([...finishing.appliedComments,...finishing.pendingComments])],file:rendered.output,sha256:hash,duration:rendered.duration,target:finishingTarget(finishing.packet.fingerprint,hash,settings)},lock.assertOwned);
     state.error=null;await save();await lock.db.update(schema.jobs).set({error:null}).where(eq(schema.jobs.id,id));
    }catch(error){
     // Keep the last playable version and all unhandled feedback on local render failure.
     state.error=recoveryDiagnostic(error);if(options.background&&state.background)state.background=backgroundAfterAttempt(state.background,state.error);await save();if(state.error)await superviseClayFailure(id,state,save);
    }
   }
   return;
  }
  const providers=await dependencies.providers("generation",{imagesOnly:state.quote.scope==="storyboard"});
  // The workspace ceiling is independent from each approved video's ceiling.
  // It is deliberately conservative; no client credit is fabricated or topped up.
  const budget=createBudget(postgresBudgetStore("live",dependencies.budgetScope),workspaceProductionCaps());
  try{
   const feedback=await readCheckpoint(path.join(directory(id),"storyboard-feedback.json"),StoryboardFeedbackSchema)??emptyStoryboardFeedback();
   const outcome=await advanceProductionFlow({jobId:id,script:job.script,params,recipe,references,directory:directory(id),assertOwned:lock.assertOwned,
    services:{mode:"live",recoverAlignment:input=>supervisedAudioCheck({jobId:id,inputs:{phrases:input.phrases,audio:input.audio.sha256,original:input.original},directory:directory(id),assertOwned:input.assertOwned,execute:()=>recoverLocalVoiceAlignment(input)}),completedInputs:state.filmCorrection?.completedInputs,reuseOnly:state.filmCorrection?.reuseOnly,storyboardEdits:combinedStoryboardEdits(feedback),imageRevisions:feedback.imageRevisions,storyboardBeforeVoice:state.storyboardFirst,imageRetries:state.retries,
     reworkRefusedImage:async({scene,narration,revision,reason,attempt})=>{
      // The director reworks a refused composition; the client's note and the batch approval are unchanged, the next attempt is persisted so a restart resumes it (Shimi, 2026-10-22).
      // The worker has no HTTP request scope: the director call runs under its own saved request identity (job, scene, attempt), replayable without a second paid call.
      const reworked=await withBrainRequest({jobId:id,requestId:`rework-${sha256(JSON.stringify({id,scene,attempt,reason}))}`},()=>reworkRefusedImageInstruction({narration,clientNote:feedback.comments[scene]?.text??revision.note,refusedInstruction:revision.note,reason,attempt}));
      if(!reworked)return null;
      // The prepared cast keeps its brief (its paid sheet identity depends on it); the rewritten composition goes to the image prompt only.
      const next={...revision,note:reworked.instruction,attempt:attempt+1,...(revision.cast?{reworkedBrief:reworked.instruction}:{})};
      feedback.imageRevisions={...feedback.imageRevisions,[scene]:next};
      await saveCheckpoint(path.join(directory(id),"storyboard-feedback.json"),feedback,lock.assertOwned);
      state.retries={...(state.retries??{}),[`scene-${scene}-start`]:attempt+1,[`scene-${scene}-end`]:attempt+1};
      await saveCheckpoint(path.join(directory(id),"production.json"),state,lock.assertOwned);
      return {revision:next,attempt:attempt+1};
     },reviewPolicy:"storyboard-first",videoWorkflow:state.quote.selection?.workflow,videoModels:state.quote.selection?selectedModels(state.quote.lines):undefined,assets:dependencies.assets(),allowPendingCost:true,
     review:async request=>{
      const saved=state.decisions.find(d=>d.target===request.target) as FlowDecision??null;
      if(request.stage!=="storyboard"||!saved)return saved;
      const human=await readCheckpoint(path.join(directory(id),"storyboard-reviews",`${request.target}.json`),StoryboardDecisionSchema);
      return human?.target===request.target&&human.decision===saved.decision?saved:null;
     },
     queue:(op,payload)=>op.kind==="voice"?bramQueue(payload,"live",providers.higgsfield):op.kind==="alignment"?transcriptionQueue(payload,"live",providers.fal):op.transport==="higgsfield-mcp"?higgsfieldVideoQueue(op,payload,"live",providers.higgsfield,state.quote!.lines.find(l=>l.id===op.id)!.maximum/1e6,{
       read:async(url)=>{const saved=await readCheckpoint(path.join(directory(id),"higgsfield-imports",`${sha256(url)}.json`),z.object({url:z.string(),id:z.string()}));return saved?.url===url?saved.id:null;},
       save:async(url,mediaId)=>saveCheckpoint(path.join(directory(id),"higgsfield-imports",`${sha256(url)}.json`),{url,id:mediaId},lock.assertOwned),
     }):falQueue(op,payload,"live",providers.fal),
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
      // An approved quote binds the client to caps, not to price freshness: operations inside the approved lines
      // run for as long as the production takes (drafts for 10+ scenes and Seedance completions after the film
      // review routinely exceed the old 1-hour window; 2026-10-21). The provider re-prices each exact request.
      const approved=state.approval?.quote===state.quote!.id;
      if(!approved&&state.quote!.expiresAt<=Date.now())throw new Error("The production quote expired. Refresh and approve the remaining budget; existing requests and files are preserved.");
      const operationExpiry=approved?Math.max(state.quote!.expiresAt,Date.now()+7*24*3600*1000):state.quote!.expiresAt;
      const op=plan.operations[0],baseId=op.id.replace(/-retry-\d+$/,"");
      // A reworked attempt (next retry number after a provider refusal, 2026-10-23) runs under the line of the attempt it replaces.
      const line=state.quote!.lines.find(l=>l.id===op.id&&l.model===op.model&&l.kind===op.kind)??state.quote!.lines.filter(l=>l.model===op.model&&l.kind===op.kind&&l.id.replace(/-retry-\d+$/,"")===baseId).sort((a,b)=>b.id.localeCompare(a.id))[0];
      if(!line){if(state.quote!.scope==="storyboard")return null;throw new Error("This operation was not included in the approved quote.");}
      if(op.kind==="video"&&line.seconds!==undefined&&Number(op.input.duration)>line.seconds)throw new Error("This animation exceeds the approved scene duration. Refresh the budget before continuing.");
      // Per-video endpoints charge once for their supported clip length. Older
      // per-second fal quotes keep their original billing semantics.
      const quantity=op.kind==="video"&&op.transport==="fal-queue"&&line.billing!=="request"?Number(op.input.duration):line.quantity;
      if(!Number.isFinite(quantity)||quantity>line.quantity)throw new Error("This scene exceeds the approved duration. Split it before producing.");
      const maximum=Math.ceil(Number((quantity*line.unitPrice*1e6).toPrecision(12)));
      const quote:BudgetQuote={plan:plan.fingerprint,source:"provider",expiresAt:operationExpiry,lines:[{operation:op.fingerprint,unit:line.unit,maximum}]};
      const caps={usd:line.unit==="usd"?maximum:0,"higgsfield-credit":line.unit==="higgsfield-credit"?maximum:0};
      // Reservations of attempts the provider definitively refused are not spent: they do not count against the caps, so a reworked attempt fits the approved budget.
      const refused=new Set((await requestReceipts(path.join(directory(id),"requests"))).filter(r=>r.state==="failed").map(r=>r.fingerprint));
      const used={usd:0,"higgsfield-credit":0};for(const p of Object.values(state.phases))for(const l of p.quote.lines){if(refused.has(l.operation))continue;used[l.unit]+=l.maximum;}
      if(used.usd+caps.usd>state.quote!.caps.usd||used["higgsfield-credit"]+caps["higgsfield-credit"]>state.quote!.caps["higgsfield-credit"])throw new Error("The approved production budget is exhausted.");
      const approval:BudgetApproval={id:randomUUID(),mode:"live",plan:plan.fingerprint,quote:quoteHash(quote),expiresAt:quote.expiresAt,caps};
      state.phases[plan.fingerprint]={quote,approval};await save();return {budget,quote,approval};
     },
     cost:async(op,requestId)=>{if(!state.quote!.falBillingAvailable||op.kind==="voice")return null;return falCostReceipt(op,requestId,providers.fal);},
    }});
   if(outcome.review?.stage==="storyboard"){
    const failures=outcome.storyboardFailures??{},pending=outcome.storyboardPending??[];
    for(const [key,comment] of Object.entries(feedback.comments))if(comment.status==="regenerating"||comment.status==="failed"){
     if(failures[key])feedback.comments[key]={...comment,status:"failed",message:"This scene could not be updated. Its previous images and feedback are kept. Edit and lock the request to include it in a new priced batch."};
     else if(!pending.includes(Number(key)))feedback.comments[key]={...comment,status:"applied",message:"Revised image ready. Review the updated scene before approving the storyboard."};
    }
    if(feedback.globalComment?.status==="regenerating"){
     const global=feedback.globalComment,failed=global.scenes.filter(n=>failures[n]);
     if(failed.length)feedback.globalComment={...global,status:"failed",message:`Scenes ${failed.join(", ")} could not be updated. Successful changes and all feedback are kept.`};
     else if(!global.scenes.some(n=>pending.includes(n)))feedback.globalComment={...global,status:"applied",message:"Your revised storyboard is ready. Review the changed images."};
    }
    await saveCheckpoint(path.join(directory(id),"storyboard-feedback.json"),feedback,lock.assertOwned);
   }
   if(state.filmCorrection?.status==="working"&&outcome.review?.stage==="draft-film"&&outcome.review.target!==state.filmCorrection.source){
    const book=await readCheckpoint(path.join(directory(id),"film-feedback.json"),FilmFeedbackSchema);
    if(book)await saveCheckpoint(path.join(directory(id),"film-feedback.json"),{...book,comments:book.comments.map(c=>c.target===state.filmCorrection!.source&&!correctionNoteIds(state.filmCorrection!).includes(c.id)?{...c,target:outcome.review!.target}:c)},lock.assertOwned);
    state.filmCorrection={...state.filmCorrection,status:"applied",result:outcome.review.target};
   }
   state.error=outcome.status==="blocked-scenes"?`Scenes ${outcome.sceneFailures?.join(", ")} need a separately approved replacement. Other completed scenes are saved.`:outcome.status==="blocked-duration"?"One scene is longer than the supported 15-second animation. Create a version with shorter narration segments before generating its images.":null;if(options.background&&state.background)state.background=backgroundAfterAttempt(state.background,state.error);await save();if(state.error)await superviseClayFailure(id,state,save);
   if(outcome.status==="rejected")await settleCredits(id,false);
   if(outcome.status==="rejected")await lock.db.update(schema.jobs).set({status:"failed",error:state.error??"Stopped following the scene review."}).where(eq(schema.jobs.id,id));
   if(outcome.status==="ready-to-render"&&outcome.render){
    const settings=FinishingSettings.parse({}),revision=sha256(JSON.stringify({packet:outcome.render.fingerprint,settings}));
    const rendered=await renderProductionFlow(outcome.render,path.join(directory(id),"finishing",revision),path.join(directory(id),"finishing-checkpoints"),lock.assertOwned);
    const hash=sha256(await readFile(rendered.output));
    const finishing:FinishingReview={version:1,packet:outcome.render,settings,pending:null,file:rendered.output,sha256:hash,duration:rendered.duration,target:finishingTarget(outcome.render.fingerprint,hash,settings),appliedComments:[],pendingComments:[]};
    await saveCheckpoint(path.join(directory(id),"finishing.json"),finishing,lock.assertOwned);
    const book=await budget.snapshot(),usage=budgetUsage({...book,reservations:Object.fromEntries(Object.entries(book.reservations).filter(([,r])=>r.jobId===id))});
    await lock.db.update(schema.jobs).set({error:null,params:{...params,providerBudgetUsage:usage}}).where(eq(schema.jobs.id,id));
    state.error=null;await save();
   }
  }catch(error){state.error=recoveryDiagnostic(error);if(options.background&&state.background)state.background=backgroundAfterAttempt(state.background,state.error);await save();if(state.error)await superviseClayFailure(id,state,save);await lock.db.update(schema.jobs).set({error:state.error}).where(eq(schema.jobs.id,id));}
  finally{await providers.close();}
 });}catch(error){
  const state=belongsToDatabase?await readState(id):null;
  if(state){state.error=recoveryDiagnostic(error);if(options.background&&state.background)state.background=backgroundAfterAttempt(state.background,state.error);await saveCheckpoint(path.join(directory(id),"production.json"),state,lock.assertOwned);await superviseClayFailure(id,state,()=>saveCheckpoint(path.join(directory(id),"production.json"),state,lock.assertOwned));await lock.db.update(schema.jobs).set({error:state.error}).where(eq(schema.jobs.id,id));}
 }finally{
  try{if(belongsToDatabase&&options.background){const saved=await readState(id);if(saved?.background?.kick&&!(await liveView(id)).automaticRecovery){saved.background.kick=false;await saveCheckpoint(path.join(directory(id),"production.json"),saved,lock.assertOwned);}}}
  finally{if(belongsToDatabase)await observeVideo(id,async()=>({workerResult:await agentProductionSnapshot(id)}));await lock.release();}
 }
}

/** Only an explicit action or an already running authorized worker calls this; GET remains read-only. */
async function superviseClayFailure(id:string,state:z.infer<typeof stateSchema>,save:()=>Promise<unknown>){
 if(!state.error)return;
 state.background??=requestedBackground();state.background.supervision??=freshPipelineRecovery();
 let view:Awaited<ReturnType<typeof liveView>>|undefined,inspectionError:string|undefined;
 try{view=await liveView(id);}catch(error){inspectionError=error instanceof Error?error.message:'Saved view could not be read.';}
 let receipts:Awaited<ReturnType<typeof requestReceipts>>|undefined;
 try{receipts=await requestReceipts(path.join(directory(id),'requests'));}catch(error){inspectionError=error instanceof Error?error.message:'Saved request journal could not be read.';}
 const requests=view?.requests.map(r=>({...r,operation:r.operation??'unknown'}))??receipts?.map(r=>({operation:r.binding?.operation??'unknown',state:r.state,requestId:r.requestId??null}))??[];
 const budgetValid=view?.phase==='finishing-film'||Boolean(state.approval&&state.quote&&state.approval.quote===state.quote.id&&state.quote.expiresAt>Date.now());
 const r=state.background.supervision;
 const decision=await planPipelineRecovery(r,{jobId:id,category:'clay',workKey:state.inputHash+':'+(state.approval?.quote??'unapproved'),stage:view?.phase??'saved-state-read',error:state.error,requests,facts:{inspectionError,requestDiagnostics:receipts?.map(q=>({operation:q.binding?.operation,failureReason:q.failureReason,readRecovery:q.readRecovery})),quoteExpiresAt:state.quote?.expiresAt,approved:Boolean(state.approval),budgetValid,phase:view?.phase,review:view?.review?.stage,storyboardPending:view?.storyboardPending,finishing:view?.finishing,feedback:view?.filmComments},allowed:receipts?recoveryCapabilities(requests,budgetValid,Boolean(view?.recovery)):['needs-attention']},save);
 state.background.nextAt=r.nextAt;
 if(decision?.action==='retry-saved')state.background.kick=true;
 await save();
}
