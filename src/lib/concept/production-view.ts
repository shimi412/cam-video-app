import { productionStatus } from "@/lib/production-status";
import { customerQuote, walletTotals, availableForProduction } from "@/lib/customer-wallet";
import { access } from "node:fs/promises";
import path from "node:path";
import { schema } from "@/db";
import { jobWorkerActive } from "@/lib/job-lock";
import { workspaceProductionCaps,liveView } from "./live-production";
import { planConcept } from "./storyboard";
import { getActiveRecipe } from "@/lib/recipes";
import type { ProductionParams } from "@/lib/brain";
import { storedVideoUrl } from "@/lib/stored-media";

export async function productionView(job:typeof schema.jobs.$inferSelect,isAdmin=false){
 const id=job.id;
 const params=job.params as ProductionParams&{live?:boolean;finishingRevision?:string};const recipe=getActiveRecipe(params.templateSlug);
 if(!params.live||!recipe?.concept)throw new Error("This is a local preview. Open it in the Studio.");
 const board=planConcept(job.script,recipe,params.aspectRatio,params.sceneDirections,params.sceneNarrations);
 const output=await storedVideoUrl(job.outputPath);
 const outputUrl=output&&params.finishingRevision?`${output}?v=${encodeURIComponent(params.finishingRevision)}`:output;
 const view=await liveView(id,params.aspectRatio);
 const storyboardProposalUrl=await access(path.join(process.cwd(),"storage/concepts",id,"live/storyboard-proposal.json")).then(()=>`/production/${id}/storyboard`).catch(()=>null);
 const customer= view.quote ? await customerQuote(id,view.quote) : null;
 const wallet=await walletTotals();
 const availableForQuoteCents=await availableForProduction(id);
 const reservedForVideoCents=Math.max(0,availableForQuoteCents-Math.round(wallet.available*100));
 const revisionQuote=view.revisionScenes?.length&&customer?{scene:view.revisionScene,scenes:view.revisionScenes,scope:view.revisionScope,alreadyReservedCents:reservedForVideoCents,additionalAmountCents:Math.max(0,customer.amountCents-reservedForVideoCents)}:null;
 const limits=workspaceProductionCaps();
 const budgetBlocked=Boolean(view.quote&&(view.quote.caps.usd>limits.usd||view.quote.caps["higgsfield-credit"]>limits["higgsfield-credit"]));
 return {filmCorrectionPrice:view.filmCorrection?.status==="quoted"&&customer?{additionalAmountCents:Math.max(0,customer.amountCents-reservedForVideoCents)}:null,revisionQuote,progress:productionStatus(view),budgetBlocked,wallet,availableForQuoteCents,customerQuote:customer,isAdmin,id,savedToLibrary:job.savedToLibrary,title:job.title,script:job.script,conversationId:job.conversationId,format:params.aspectRatio,scenes:view.finishingReview?.scenes??board.shots,jobStatus:job.status,outputUrl,storyboardProposalUrl,busy:await jobWorkerActive(id),...view,...({quote:view.quote?{id:view.quote.id,expiresAt:view.quote.expiresAt,scope:view.quote.scope,selection:view.quote.selection?{workflow:view.quote.selection.workflow}:undefined}:null,repairQuote:null,repairProgress:null,requests:[],costsPending:0,recovery:view.recovery?{scenes:view.recovery.scenes,target:view.recovery.target,scene:view.recovery.scene,additionalUsd:null}:null})};
}
