import { z } from "zod";
import { withAccess } from "@/lib/access";
import { smallJson } from "@/lib/http";
import { openrouterKey, saveOpenrouterKey } from "@/lib/credentials";
import { checkOpenrouter, openrouterPrice } from "@/lib/providers/openrouter";
import { getSetting, setSetting } from "@/lib/settings";
import { FAST_MODEL, DEEP_MODEL } from "@/lib/ai-routing";

export const GET=withAccess(async()=>Response.json({
  openrouter:{configured:Boolean(await openrouterKey()),environmentManaged:Boolean(process.env.OPENROUTER_API_KEY)},
  fastModel:await getSetting("ai_fast_model")??FAST_MODEL,deepModel:await getSetting("ai_deep_model")??DEEP_MODEL,
  assistantMonthlyUsd:await getSetting("assistant_monthly_usd")??25,
  media:{falConfigured:Boolean(process.env.FAL_KEY),bramConfigured:Boolean(process.env.CAM_HIGGSFIELD_ACCESS_TOKEN||process.env.CAM_HIGGSFIELD_AUTH_FILE)},
}),"admin");

const Input=z.discriminatedUnion("action",[
  z.object({action:z.literal("connect"),key:z.string().trim().min(20).max(500).regex(/^[a-zA-Z0-9_-]+$/)}).strict(),
  z.object({action:z.literal("check")}).strict(),
  z.object({action:z.literal("settings"),fastModel:z.string().regex(/^deepseek\/deepseek-[a-zA-Z0-9.-]+$/),deepModel:z.string().regex(/^anthropic\/claude-[a-zA-Z0-9.-]+$/),assistantMonthlyUsd:z.number().min(0).max(10000)}).strict(),
]);
export const POST=withAccess(async(request)=>{
  const parsed=Input.safeParse(await smallJson(request).catch(()=>null));
  if(!parsed.success)return Response.json({error:"Check the connection settings."},{status:400});
  try{
    const input=parsed.data;
    if(input.action==="connect"){
      if(process.env.OPENROUTER_API_KEY)return Response.json({error:"This key is managed by the server environment."},{status:409});
      const result=await checkOpenrouter(input.key);if(!result.ok)return Response.json({error:result.detail},{status:400});
      await saveOpenrouterKey(input.key);return Response.json(result);
    }
    if(input.action==="check")return Response.json(await checkOpenrouter());
    await Promise.all([openrouterPrice(input.fastModel),openrouterPrice(input.deepModel)]);
    await setSetting("ai_fast_model",input.fastModel);await setSetting("ai_deep_model",input.deepModel);await setSetting("assistant_monthly_usd",input.assistantMonthlyUsd);
    return Response.json({ok:true,detail:"Assistant settings saved."});
  }catch{return Response.json({error:"Connection settings could not be saved. No generation was sent."},{status:409});}
},"admin");
