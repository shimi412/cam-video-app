import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { pool } from "../src/db";
import { answerConversation, type AssistantServices } from "../src/lib/assistant";
import { reserveAI } from "../src/lib/ai-usage";
import { getBalanceUsd } from "../src/lib/credits";
process.env.PROVIDER_MODE="fal";process.env.BRAIN_MODE="api";process.env.CAM_RELEASE="";process.env.CAM_LIVE_ENABLED="1";process.env.OPENROUTER_API_KEY="test-only-never-sent";
let network=0,generated=0;
globalThis.fetch=async()=>{network++;throw new Error("Network forbidden in assistant integration check");};
const conversationId=randomUUID(), secondConversationId=randomUUID(), ids:string[]=[];
const input=(text="Hello")=>{const id=randomUUID();ids.push(id);return {id,text,assistant:true as const,thinking:"auto" as const,references:[]};};
const fake:AssistantServices={prepare:async()=>({model:"deepseek/deepseek-v4.1-flash",price:{id:"deepseek/deepseek-v4.1-flash",input:0,output:0,request:0,context:100000,modalities:["text"]},inputTokens:100,maximumUsd:.25,routing:{tier:"fast",reason:"Test fixture"}}),generate:async()=>{generated++;return {reply:{text:"Fixture answer",narration:null,sources:[{attachmentId:randomUUID(),page:1,note:"Unsupplied citation"}]},actualUsd:.000013,model:"deepseek/deepseek-v4.1-flash",usage:{inputTokens:100,outputTokens:10,requestId:"offline-fixture"}};}};
async function main(){
 const previous=(await pool.query("SELECT value FROM settings WHERE key='assistant_monthly_usd'")).rows[0];
 const balance=await getBalanceUsd();
 try{
  await pool.query("INSERT INTO conversations(id,title) VALUES($1,'Disposable assistant check'),($2,'Disposable second conversation')",[conversationId,secondConversationId]);
  const first=input();const result=await answerConversation(conversationId,first,fake);assert.equal(result.text,"Fixture answer");assert.equal(result.sources.length,0);
  assert.equal((await answerConversation(conversationId,first,fake)).replayed,true);assert.equal(generated,1);
  await assert.rejects(()=>answerConversation(conversationId,{...first,text:"Changed"},fake),/different request/);
  await assert.rejects(()=>answerConversation(secondConversationId,first,fake),/different request/);
  const uncertain=input("Fail after submission");
  await assert.rejects(()=>answerConversation(conversationId,uncertain,{...fake,generate:async()=>{generated++;throw new Error("Simulated timeout");}}),/not be automatically retried/);
  await assert.rejects(()=>answerConversation(conversationId,uncertain,fake),/already sent/);assert.equal(generated,2);
  assert.equal((await pool.query("SELECT state FROM assistant_requests WHERE id=$1",[uncertain.id])).rows[0].state,"uncertain");
  await pool.query("UPDATE messages SET content=content||$1::jsonb WHERE conversation_id=$2 AND content->>'state'='complete'",[JSON.stringify({script:"The exact proposed narration that must remain available for revisions."}),conversationId]);
  let seesNarration=false;
  await answerConversation(conversationId,input("Make it shorter"),{...fake,prepare:async(messages,context)=>{seesNarration=JSON.stringify(messages).includes("The exact proposed narration");assert(context.continuingDraft);return fake.prepare(messages,context);}});
  assert(seesNarration);assert.equal(generated,3);
  const receipt=(await pool.query("SELECT real_cost_usd FROM api_calls WHERE conversation_id=$1",[conversationId])).rows[0];assert.equal(Number(receipt.real_cost_usd),.000013);
  await pool.query("INSERT INTO settings(key,value) VALUES('assistant_monthly_usd','0') ON CONFLICT(key) DO UPDATE SET value='0'");
  await assert.rejects(()=>answerConversation(secondConversationId,input("Budget exhausted"),fake),/budget/);
  const build=input();await assert.rejects(()=>reserveAI({id:build.id,hash:"test",purpose:"production-planning"}),/budget/);assert.equal(generated,3);
  await pool.query("DELETE FROM api_calls WHERE conversation_id=$1",[conversationId]);
  await pool.query("DELETE FROM messages WHERE conversation_id=$1",[conversationId]);
  await pool.query("DELETE FROM conversations WHERE id=$1",[conversationId]);
  assert.equal((await pool.query("SELECT conversation_id FROM assistant_requests WHERE id=$1",[first.id])).rows[0].conversation_id,null,"Deleting a conversation must preserve its spending reservation");
  assert.equal(network,0);assert.equal(await getBalanceUsd(),balance);
  await mkdir("storage/qa",{recursive:true});
  const proof={status:"passed",replyReplay:true,changedRequestRejected:true,unknownOutcomeNotRetried:true,unsuppliedSourcesRemoved:true,actualCostPrecision:true,sharedChatAndBuildBudget:true,usageSurvivesConversationDeletion:true,networkCalls:network,creditsSpent:0};
  await writeFile("storage/qa/cam-assistant-proof.json",JSON.stringify(proof,null,2));console.log(proof);
 }finally{
  if(previous)await pool.query("UPDATE settings SET value=$1 WHERE key='assistant_monthly_usd'",[JSON.stringify(previous.value)]);else await pool.query("DELETE FROM settings WHERE key='assistant_monthly_usd'");
  await pool.query("DELETE FROM api_calls WHERE conversation_id=ANY($1::uuid[])",[[conversationId,secondConversationId]]);
  await pool.query("DELETE FROM messages WHERE conversation_id=ANY($1::uuid[])",[[conversationId,secondConversationId]]);
  await pool.query("DELETE FROM assistant_requests WHERE id=ANY($1::uuid[])",[ids]);
  await pool.query("DELETE FROM conversations WHERE id=ANY($1::uuid[])",[[conversationId,secondConversationId]]);
  await pool.end();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
