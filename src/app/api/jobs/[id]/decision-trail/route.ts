import path from "node:path";
import {z} from "zod";
import {eq} from "drizzle-orm";
import {db,schema} from "@/db";
import {withAccess} from "@/lib/access";
import {liveView} from "@/lib/concept/live-production";
import {readCheckpoint} from "@/lib/concept/checkpoints";
import {EDITORIAL_METHOD_VERSION} from "@/lib/concept/editorial-method";
import type {FlowOutcome} from "@/lib/concept/production-flow";
/** Operational evidence, never private chain-of-thought or provider credentials. */
export const GET=withAccess(async(_request,context:{params:Promise<{id:string}>})=>{
 const {id}=await context.params;
 if(!z.uuid().safeParse(id).success)return Response.json({error:"Invalid production ID."},{status:400});
 const [job]=await db.select().from(schema.jobs).where(eq(schema.jobs.id,id));
 if(!job)return Response.json({error:"Production not found."},{status:404});
 const view=await liveView(id);
 const flow=await readCheckpoint(path.join(process.cwd(),"storage/concepts",id,"live/state.json"),z.custom<FlowOutcome>());
 const timeline=await readCheckpoint(path.join(process.cwd(),"storage/concepts",id,"live/montage/editorial-timeline.json"),z.record(z.string(),z.unknown()));
 return Response.json({method:EDITORIAL_METHOD_VERSION,kind:"operational-decisions-and-evidence",script:job.script,
  status:view.status,phase:view.phase,quote:view.quote,approved:view.approved,awaitingReview:view.review?.stage??null,
  storyboard:view.storyboard,events:flow?.events??[],requests:view.requests,timeline,
  caveats:["Compatibility and cost rules do not predict visual quality","Only human decisions approve storyboard, draft and final visuals","No provider generation runs when reading this audit","A successful technical render still requires final listening and picture review"]},
  {headers:{"Cache-Control":"no-store","Content-Disposition":'inline; filename="cam-decision-trail.json"'}});
},"admin");
