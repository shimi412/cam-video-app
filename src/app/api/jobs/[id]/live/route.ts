import { productionView } from "@/lib/concept/production-view";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db,schema } from "@/db";
import { actorFor,withAccess } from "@/lib/access";
import { smallJson } from "@/lib/http";
import { LiveAction,updateLiveProduction } from "@/lib/concept/live-production";
import type { ProductionParams } from "@/lib/brain";
import { getActiveRecipe } from "@/lib/recipes";
type Context={params:Promise<{id:string}>};
export const GET=withAccess(async(_request,context:Context)=>{
 const {id}=await context.params;if(!z.uuid().safeParse(id).success)return Response.json({error:"Invalid production ID."},{status:400});
 const [job]=await db.select().from(schema.jobs).where(eq(schema.jobs.id,id));if(!job||job.deletedAt)return Response.json({error:"Production not found."},{status:404});
 const params=job.params as ProductionParams&{live?:boolean};
 if(!params.live||!getActiveRecipe(params.templateSlug)?.concept)return Response.json({error:"This is a local preview. Open it in the Studio."},{status:409});
 return Response.json(await productionView(job,(await actorFor(_request))?.role==="admin"),{headers:{"Cache-Control":"no-store"}});
});
export const POST=withAccess(async(request,context:Context)=>{
 const {id}=await context.params;if(!z.uuid().safeParse(id).success)return Response.json({error:"Invalid production ID."},{status:400});
 const input=LiveAction.safeParse(await smallJson(request).catch(()=>null));if(!input.success)return Response.json({error:"Invalid production action."},{status:400});
 if(["storyboard-apply","storyboard-global-apply","storyboard-revision-quote","storyboard-global-revision-quote"].includes(input.data.action))return Response.json({error:"Lock your feedback, then use Apply all feedback so the director can consider every instruction together."},{status:409});
 const actor=await actorFor(request);if(!actor||actor.local)return Response.json({error:"Sign in to the connected workspace before producing."},{status:401});
 if(input.data.action==="approve"&&!input.data.customerQuote)return Response.json({error:"Customer pricing is awaiting activation by Bina."},{status:409});
 try{const result=await updateLiveProduction(id,input.data,actor.id);return Response.json({ok:true},{status:result.advance?202:200});}
 catch(error){const message=error instanceof Error?error.message:"This production could not be updated.";console.error(`[live-action] ${id} ${String((input as {data?:{action?:string}})?.data?.action??"?")} refused: ${message}`);return Response.json({error:message},{status:409});}
});
