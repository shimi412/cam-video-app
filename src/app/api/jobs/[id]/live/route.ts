import { customerQuote } from "@/lib/customer-wallet";
import { after } from "next/server";
import { access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db,schema } from "@/db";
import { actorFor,withAccess } from "@/lib/access";
import { smallJson } from "@/lib/http";
import { jobWorkerActive } from "@/lib/job-lock";
import { LiveAction,liveView,updateLiveProduction,runLiveProduction } from "@/lib/concept/live-production";
import { planConcept } from "@/lib/concept/storyboard";
import { getActiveRecipe } from "@/lib/recipes";
import type { ProductionParams } from "@/lib/brain";
import { storedVideoUrl } from "@/lib/stored-media";
type Context={params:Promise<{id:string}>};
export const GET=withAccess(async(_request,context:Context)=>{
 const {id}=await context.params;if(!z.uuid().safeParse(id).success)return Response.json({error:"Invalid production ID."},{status:400});
 const [job]=await db.select().from(schema.jobs).where(eq(schema.jobs.id,id));if(!job)return Response.json({error:"Production not found."},{status:404});
 const params=job.params as ProductionParams&{live?:boolean;finishingRevision?:string};const recipe=getActiveRecipe(params.templateSlug);
 if(!params.live||!recipe?.concept)return Response.json({error:"This is a local preview. Open it in the Studio."},{status:409});
 const board=planConcept(job.script,recipe,params.aspectRatio,params.sceneDirections);
 const output=await storedVideoUrl(job.outputPath);
 const outputUrl=output&&params.finishingRevision?`${output}?v=${encodeURIComponent(params.finishingRevision)}`:output;
 const view=await liveView(id);
 const storyboardProposalUrl=await access(path.join(process.cwd(),"storage/concepts",id,"live/storyboard-proposal.json")).then(()=>`/production/${id}/storyboard`).catch(()=>null);
 const isAdmin=(await actorFor(_request))?.role==="admin";
 const customer= view.quote ? await customerQuote(id,view.quote) : null;
 return Response.json({customerQuote:customer,isAdmin,id,title:job.title,script:job.script,conversationId:job.conversationId,format:params.aspectRatio,scenes:view.finishingReview?.scenes??board.shots,jobStatus:job.status,outputUrl,storyboardProposalUrl,busy:await jobWorkerActive(id),...view,...(!isAdmin?{quote:view.quote?{id:view.quote.id,expiresAt:view.quote.expiresAt}:null,repairQuote:null,repairProgress:null,requests:[],costsPending:0}:{})});
});
export const POST=withAccess(async(request,context:Context)=>{
 const {id}=await context.params;if(!z.uuid().safeParse(id).success)return Response.json({error:"Invalid production ID."},{status:400});
 const input=LiveAction.safeParse(await smallJson(request).catch(()=>null));if(!input.success)return Response.json({error:"Invalid production action."},{status:400});
 const actor=await actorFor(request);if(!actor||actor.local)return Response.json({error:"Sign in to the connected workspace before producing."},{status:401});
 if(input.data.action==="approve"&&actor.role!=="admin"&&!input.data.customerQuote)return Response.json({error:"Customer pricing is awaiting activation by Bina."},{status:409});
 try{const result=await updateLiveProduction(id,input.data,actor.id);if(result.advance)after(()=>runLiveProduction(id));return Response.json({ok:true},{status:result.advance?202:200});}
 catch(error){return Response.json({error:error instanceof Error?error.message:"This production could not be updated."},{status:409});}
});
