import { after } from "next/server";
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
 const params=job.params as ProductionParams&{live?:boolean};const recipe=getActiveRecipe(params.templateSlug);
 if(!params.live||!recipe?.concept)return Response.json({error:"This is a local preview. Open it in the Studio."},{status:409});
 const board=planConcept(job.script,recipe,params.aspectRatio,params.sceneDirections);
 return Response.json({id,script:job.script,conversationId:job.conversationId,format:params.aspectRatio,scenes:board.shots,jobStatus:job.status,outputUrl:await storedVideoUrl(job.outputPath),busy:await jobWorkerActive(id),...await liveView(id)});
});
export const POST=withAccess(async(request,context:Context)=>{
 const {id}=await context.params;if(!z.uuid().safeParse(id).success)return Response.json({error:"Invalid production ID."},{status:400});
 const input=LiveAction.safeParse(await smallJson(request).catch(()=>null));if(!input.success)return Response.json({error:"Invalid production action."},{status:400});
 const actor=await actorFor(request);if(!actor||actor.local)return Response.json({error:"Sign in to the connected workspace before producing."},{status:401});
 try{const result=await updateLiveProduction(id,input.data,actor.id);if(result.advance)after(()=>runLiveProduction(id));return Response.json({ok:true},{status:result.advance?202:200});}
 catch(error){return Response.json({error:error instanceof Error?error.message:"This production could not be updated."},{status:409});}
});
