import { productionStatus } from "@/lib/production-status";
import { customerQuote, walletTotals, availableForProduction, creditHold } from "@/lib/customer-wallet";
import { access } from "node:fs/promises";
import path from "node:path";
import { schema } from "@/db";
import { jobWorkerActive } from "@/lib/job-lock";
import { workspaceProductionCaps,liveView } from "./live-production";
import { planConcept } from "./storyboard";
import { getActiveRecipe } from "@/lib/recipes";
import type { ProductionParams } from "@/lib/brain";
import { storedVideoUrl } from "@/lib/stored-media";
import { clayBudgets } from "./clay-budgets";
import { SINGLE_JOURNEY, estimatedMinutes } from "./single-journey";

export async function productionView(job:typeof schema.jobs.$inferSelect,isAdmin=false){
 const id=job.id;
 const params=job.params as ProductionParams&{live?:boolean;finishingRevision?:string};const recipe=getActiveRecipe(params.templateSlug);
 if(!params.live||!recipe?.concept)throw new Error("This is a local preview. Open it in the Studio.");
 const board=planConcept(job.script,recipe,params.aspectRatio,params.sceneDirections,params.sceneNarrations);
 const output=await storedVideoUrl(job.outputPath);
 const outputUrl=output&&params.finishingRevision?`${output}?v=${encodeURIComponent(params.finishingRevision)}`:output;
 const view=await liveView(id,params.aspectRatio);
 const storyboardProposalUrl=await access(path.join(process.cwd(),"storage/concepts",id,"live/storyboard-proposal.json")).then(()=>`/production/${id}/storyboard`).catch(()=>null);
 const single=view.journey===SINGLE_JOURNEY;
 const hold=single?await creditHold(id):null;
 // A revision is priced on its additional cost on top of the previous approved quote; an approved single-journey
 // version shows the amount actually held (an automatic replacement never changes the client's price).
 const customer= !view.quote ? null
  : view.renewing&&view.approvedQuote ? await customerQuote(id,view.quote,{previous:view.approvedQuote,allowanceUsd:single?clayBudgets().revisionAllowanceUsd:0})
  : single&&view.approved&&hold ? {id:hold.quoteId,amountCents:hold.amountCents,expiresAt:view.quote.expiresAt}
  : await customerQuote(id,view.quote,single?{allowanceUsd:clayBudgets().firstVersionAllowanceUsd}:{});
 const wallet=await walletTotals();
 const availableForQuoteCents=await availableForProduction(id);
 const reservedForVideoCents=Math.max(0,availableForQuoteCents-Math.round(wallet.available*100));
 const revisionQuote=view.revisionScenes?.length&&customer?{scene:view.revisionScene,scenes:view.revisionScenes,scope:view.revisionScope,alreadyReservedCents:reservedForVideoCents,additionalAmountCents:Math.max(0,customer.amountCents-reservedForVideoCents)}:null;
 const limits=workspaceProductionCaps();
 const budgetBlocked=Boolean(view.quote&&(view.quote.caps.usd>limits.usd||view.quote.caps["higgsfield-credit"]>limits["higgsfield-credit"]));
 const estimate=single&&!view.approved&&customer?{amountCents:customer.amountCents,minutes:estimatedMinutes(board.shots.length),sceneCount:board.shots.length}:null;
 return {estimate,filmCorrectionPrice:view.filmCorrection?.status==="quoted"&&customer?{additionalAmountCents:Math.max(0,customer.amountCents-reservedForVideoCents)}:null,revisionQuote,progress:productionStatus(view),budgetBlocked,wallet,availableForQuoteCents,customerQuote:customer,isAdmin,id,savedToLibrary:job.savedToLibrary,title:job.title,script:job.script,conversationId:job.conversationId,format:params.aspectRatio,scenes:view.finishingReview?.scenes??board.shots,jobStatus:job.status,outputUrl,storyboardProposalUrl,busy:await jobWorkerActive(id),...view,...({quote:view.quote?{id:view.quote.id,expiresAt:view.quote.expiresAt,scope:view.quote.scope,selection:view.quote.selection?{workflow:view.quote.selection.workflow}:undefined}:null,approvedQuote:null,repairQuote:null,repairProgress:null,requests:[],costsPending:0,recovery:view.recovery?{scenes:view.recovery.scenes,target:view.recovery.target,scene:view.recovery.scene,additionalUsd:null}:null})};
}
