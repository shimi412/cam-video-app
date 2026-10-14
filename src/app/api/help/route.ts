import { actorFor, withAccess } from "@/lib/access";
import { answerSupport, supportHistory, supportStatus, SupportInput } from "@/lib/help-support";
import { smallJson } from "@/lib/http";
import { assistantAvailable } from "@/lib/assistant";
import { z } from "zod";
export const GET=withAccess(async request=>{const actor=(await actorFor(request))!;const thread=new URL(request.url).searchParams.get("thread");return Response.json({available:await assistantAvailable(),...await supportStatus(),messages:thread&&z.uuid().safeParse(thread).success?await supportHistory(actor.id,thread):[]},{headers:{"Cache-Control":"no-store"}});});
export const POST=withAccess(async request=>{const input=SupportInput.safeParse(await smallJson(request).catch(()=>null));if(!input.success)return Response.json({error:"Write a question of up to 2,000 characters."},{status:400});try{return Response.json({...await answerSupport((await actorFor(request))!.id,input.data),...await supportStatus()});}catch(e){return Response.json({error:e instanceof Error?e.message:"Support unavailable.",...await supportStatus()},{status:409});}});
