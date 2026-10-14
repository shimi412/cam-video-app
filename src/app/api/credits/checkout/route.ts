import { actorFor, withAccess } from "@/lib/access";
import { smallJson } from "@/lib/http";
import { z } from "zod";
import { createTopup } from "@/lib/stripe-billing";
export const POST=withAccess(async request=>{const input=z.object({id:z.uuid(),amountCents:z.number().int().min(1000).max(100000)}).strict().safeParse(await smallJson(request).catch(()=>null));if(!input.success)return Response.json({error:"Choose an amount between $10 and $1,000."},{status:400});try{return Response.json({url:await createTopup((await actorFor(request))!.id,input.data.id,input.data.amountCents)});}catch{return Response.json({error:"Checkout could not be opened. Your credits have not changed. Please contact Bina if this persists."},{status:409});}});
