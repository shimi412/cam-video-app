import { FAST_MODEL } from "./ai-routing";
import { getSetting } from "./settings";
import { assistantAvailable } from "./assistant";
import { pool } from "@/db";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ModelMessage } from "ai";
import { inputTokenBound, openrouterObject, openrouterPrice } from "./providers/openrouter";
export const SupportInput=z.object({id:z.uuid(),threadId:z.uuid(),question:z.string().trim().min(1).max(2000)}).strict();
export async function supportStatus(){const r=await pool.query("SELECT blocked_until,(SELECT coalesce(sum(coalesce(actual_usd,maximum_usd)),0) FROM support_requests WHERE created_at>now()-interval '24 hours' OR state<>'complete') AS spent FROM support_budget WHERE id=1");const row=r.rows[0];return {spent:Number(row.spent),warning:Number(row.spent)>=5,blockedUntil:row.blocked_until&&new Date(row.blocked_until).getTime()>Date.now()?new Date(row.blocked_until).toISOString():null};}
export async function supportHistory(actor:string,thread:string){return (await pool.query("SELECT question,reply FROM support_requests WHERE actor_id=$1 AND thread_id=$2 ORDER BY created_at DESC LIMIT 12",[actor,thread])).rows.reverse() as {question:string;reply:string|null}[];}
const defaultServices={available:assistantAvailable,price:openrouterPrice,generate:openrouterObject};
export async function answerSupport(actor:string,input:z.infer<typeof SupportInput>,services=defaultServices){
 const hash=createHash("sha256").update(JSON.stringify({actor,...input})).digest("hex");
 const previous=(await pool.query("SELECT * FROM support_requests WHERE id=$1",[input.id])).rows[0];
 if(previous){if(previous.input_hash!==hash)throw Error("This request identifier is already used.");if(previous.state==='complete')return {reply:previous.reply};throw Error("The previous reply is unconfirmed. Contact contact@bina-prod.com; it will not be charged twice.");}
 if(!await services.available())throw Error("Support chat is not connected. Please email contact@bina-prod.com.");
 const status=await supportStatus();if(status.blockedUntil)throw Error(`Support is paused until ${status.blockedUntil}. Please email contact@bina-prod.com.`);
 const files=await Promise.all(["AGENTS.md","MEMORY.md"].map(name=>readFile(path.join(process.cwd(),"support",name),"utf8")));const system=files.join("\n\n");
 const history=await supportHistory(actor,input.threadId);const messages:ModelMessage[]=history.filter(h=>h.reply).flatMap(h=>[{role:"user" as const,content:h.question},{role:"assistant" as const,content:h.reply!}]);messages.push({role:"user",content:input.question});
 const configured=await getSetting<string>("ai_fast_model");
 const model=configured?.startsWith("deepseek/")?configured:FAST_MODEL;
 const price=await services.price(model),inputTokens=await inputTokenBound(messages,system),maximum=Math.ceil((inputTokens*price.input+1000*price.output+price.request)*1e8)/1e8;
 if(maximum>0.25)throw Error("This support request is too long. Start a shorter question or email contact@bina-prod.com.");
 const client=await pool.connect();try{await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtextextended('cam-support-budget',0))");
 const current=await client.query("SELECT blocked_until,(SELECT coalesce(sum(coalesce(actual_usd,maximum_usd)),0) FROM support_requests WHERE created_at>now()-interval '24 hours' OR state<>'complete') AS spent FROM support_budget WHERE id=1");const row=current.rows[0];
 if(row.blocked_until&&new Date(row.blocked_until).getTime()>Date.now())throw Error("Support is paused. Please email contact@bina-prod.com.");
 if(Number(row.spent)+maximum>10){await client.query("UPDATE support_budget SET blocked_until=now()+interval '24 hours' WHERE id=1");await client.query("COMMIT");throw Error("Support has reached its spending limit and is paused for 24 hours. Please email contact@bina-prod.com.");}
 await client.query("INSERT INTO support_requests(id,actor_id,thread_id,input_hash,question,state,maximum_usd) VALUES($1,$2,$3,$4,$5,'submitted',$6)",[input.id,actor,input.threadId,hash,input.question,maximum]);await client.query("COMMIT");
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
 try{const result=await services.generate({schema:z.object({reply:z.string().min(1).max(6000)}),system,messages,price,inputTokens,maximumUsd:maximum,deep:false,maxOutputTokens:1000});await pool.query("UPDATE support_requests SET state='complete',reply=$2,actual_usd=$3 WHERE id=$1",[input.id,result.object.reply,result.actualUsd]);const after=await supportStatus();if(after.spent>=10)await pool.query("UPDATE support_budget SET blocked_until=greatest(coalesce(blocked_until,now()),now()+interval '24 hours') WHERE id=1");return result.object;
 }catch(e){await pool.query("UPDATE support_requests SET state='uncertain' WHERE id=$1 AND state<>'complete'",[input.id]);throw e;}
}
