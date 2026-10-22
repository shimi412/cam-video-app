import {AGENT_TURN_MAX_USD} from './motion/budgets';
import { pool } from "@/db";
import { z } from "zod";
import { AIResponseError, type AIResponseFailure } from "./ai-response";

export class AIHttpRejection extends Error {
 constructor(public status:number, public detail:string){super(`Agent request rejected (HTTP ${status}): ${detail}`);}
}
function canRetryRejected(row:{state:string;result?:{kind?:string;wireVersion?:string;attempts?:number}},version?:string){
 if(row.state==='uncertain' && row.result?.kind==='ai-http-transient-v1' && (row.result.attempts??1)<4)return true;
 return Boolean(version && row.state==='uncertain' && row.result?.kind==='ai-http-rejection-v1' && row.result.wireVersion!==version && (row.result.attempts??1)<3);
}
/** A received 408/409/425/429/5xx means the provider did not run the request and
 * OpenRouter billed nothing: the step may be sent again (at most 3 retries).
 * Before 2026-10-21 such a response was recorded as unknown and blocked for good. */
export async function recordTransientAI(id:string,status:number,detail:string){
 await pool.query(`UPDATE assistant_requests SET state='uncertain',result=jsonb_build_object('kind','ai-http-transient-v1','status',$2::int,'detail',$3::text,'attempts',coalesce((result->>'attempts')::int,1),'history',coalesce(result->'history','[]'::jsonb)) WHERE id=$1 AND state<>'complete' AND actual_usd IS NULL`,[id,status,detail.slice(0,1000)]);
}
/** A definitive routing rejection is distinct from a lost/unknown generation.
 * Only a changed, versioned transport may reclaim it under the spending lock. */
export async function recordRejectedAI(id:string,status:number,detail:string,wireVersion:string){
 if(![400,404,422].includes(status))throw Error('Only a definitive routing or request rejection can be recorded here.');
 await pool.query(`UPDATE assistant_requests SET state='uncertain',result=jsonb_build_object('kind','ai-http-rejection-v1','status',$2::int,'detail',$3::text,'wireVersion',$4::text,'attempts',coalesce((result->>'attempts')::int,1),'history',coalesce(result->'history','[]'::jsonb)) WHERE id=$1 AND state<>'complete' AND actual_usd IS NULL`,[id,status,detail.slice(0,1000),wireVersion]);
}

export const AI_REQUEST_MAXIMUM_USD = 0.25;

/** Read an existing receipt before consulting external prices. This never reserves
 * or submits work; reserveAI still rechecks under the spending lock for new work. */
export async function replayAI(input:{id:string;hash:string;retryRejectedVersion?:string}){
 const prior=(await pool.query("SELECT * FROM assistant_requests WHERE id=$1",[input.id])).rows[0];
 if(!prior)return null;
 if(prior.input_hash!==input.hash)throw new Error("This AI request identifier belongs to different inputs.");
 if(canRetryRejected(prior,input.retryRejectedVersion))return null;
 if(prior.result?.kind==="ai-http-rejection-v1")throw new AIHttpRejection(prior.result.status,prior.result.detail);
 if(prior.result?.kind==="ai-response-failure-v1")throw new AIResponseError(prior.result);
 if(prior.state!=="complete")throw new Error("This AI request was already sent and its outcome is unconfirmed. It will not be sent twice.");
 return {result:prior.result};
}

/** One workspace-wide lock covers chat and planning reservations together. */
export async function reserveAI(input: { id: string; hash: string; conversationId?: string; purpose: string; maximumUsd?: number; retryRejectedVersion?:string }) {
  const maximum = z.number().finite().nonnegative().max(AGENT_TURN_MAX_USD).parse(input.maximumUsd ?? AI_REQUEST_MAXIMUM_USD);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('cam-assistant-spending',0))");
    const prior = (await client.query("SELECT * FROM assistant_requests WHERE id=$1", [input.id])).rows[0];
    if(prior && canRetryRejected(prior,input.retryRejectedVersion)){
      if(prior.input_hash!==input.hash)throw Error('This AI request identifier belongs to different inputs.');
      // Keep the complete rejected envelope as history. A crash after this claim
      // is again unknown and may not be reclaimed by another caller.
      await client.query("UPDATE assistant_requests SET state='submitted',result=$2 WHERE id=$1",[input.id,JSON.stringify({kind:'ai-http-inflight-v1',attempts:(prior.result.attempts??1)+1,history:[...(prior.result.history??[]),prior.result]})]);
      // A transient retry may need a larger bound (a cold prompt cache raises the estimate, live 2026-10-21): re-reserve within the monthly budget. A repaired-route retry keeps its original reservation.
      if(maximum>Number(prior.maximum_usd)){
       if(prior.result?.kind!=='ai-http-transient-v1')throw Error('The repaired route exceeds its original spending reservation.');
       const limit = z.number().finite().min(0).max(10000).parse((await client.query("SELECT value FROM settings WHERE key='assistant_monthly_usd'")).rows[0]?.value ?? 25);
       const spent = Number((await client.query("SELECT coalesce(sum(coalesce(actual_usd,maximum_usd)),0) AS usd FROM assistant_requests WHERE created_at >= date_trunc('month',now() AT TIME ZONE 'UTC') AND id<>$1",[input.id])).rows[0].usd);
       if (spent + maximum > limit) throw new Error("The workspace's monthly AI budget is reached.");
       await client.query('UPDATE assistant_requests SET maximum_usd=$2 WHERE id=$1',[input.id,maximum]);
      }
      await client.query('COMMIT');return {replayed:false as const};
    }
    if (prior) {
      if(prior.result?.kind==='ai-http-rejection-v1')throw new AIHttpRejection(prior.result.status,prior.result.detail);
      if (prior.input_hash !== input.hash) throw new Error("This AI request identifier belongs to different inputs.");
      if (prior.result?.kind === "ai-response-failure-v1") throw new AIResponseError(prior.result);
      if (prior.state !== "complete") throw new Error("This AI request was already sent and its outcome is unconfirmed. It will not be sent twice.");
      await client.query("COMMIT");
      return { replayed: true as const, result: prior.result };
    }
    const limit = z.number().finite().min(0).max(10000).parse((await client.query("SELECT value FROM settings WHERE key='assistant_monthly_usd'")).rows[0]?.value ?? 25);
    const spent = Number((await client.query("SELECT coalesce(sum(coalesce(actual_usd,maximum_usd)),0) AS usd FROM assistant_requests WHERE created_at >= date_trunc('month',now() AT TIME ZONE 'UTC')")).rows[0].usd);
    if (spent + maximum > limit) throw new Error("The workspace's monthly AI budget is reached.");
    await client.query("INSERT INTO assistant_requests(id,conversation_id,input_hash,state,maximum_usd,purpose) VALUES($1,$2,$3,'submitted',$4,$5)", [input.id, input.conversationId ?? null, input.hash, maximum, input.purpose]);
    await client.query("COMMIT");
    return { replayed: false as const };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function settleAI(input: { id: string; result: unknown; model: string; actualUsd: number; usage: unknown; conversationId?: string; jobId?: string }) {
  const cost = z.number().finite().nonnegative().parse(input.actualUsd);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rejectionHistory=(await client.query("SELECT result FROM assistant_requests WHERE id=$1 FOR UPDATE",[input.id])).rows[0]?.result?.history;
    const changed = await client.query("UPDATE assistant_requests SET state='complete',actual_usd=$1,result=$2 WHERE id=$3 AND state<>'complete' RETURNING id", [cost, JSON.stringify(input.result), input.id]);
    if (changed.rowCount) await client.query("INSERT INTO api_calls(conversation_id,job_id,provider,kind,model,real_cost_usd,billed_usd,meta) VALUES($1,$2,'openrouter','chat',$3,$4,0,$5)",
      [input.conversationId ?? null,input.jobId ?? null,input.model,cost.toFixed(8),JSON.stringify({messageId:input.id,usage:input.usage,rejectionHistory,billing:"included-workspace-assistant",priceBasis:"openrouter-usage-receipt"})]);
    await client.query("COMMIT");
  } catch(error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
export async function uncertainAI(id: string) { await pool.query("UPDATE assistant_requests SET state='uncertain' WHERE id=$1 AND state<>'complete'", [id]); }

/** Keep the legacy non-replayable state, but record a known failure and its
 * exact receipt. This is neither a successful result nor an unknown charge. */
export async function recordFailedAI(input:{id:string;failure:AIResponseFailure;conversationId?:string;jobId?:string}) {
  const {receipt}=input.failure;
  const cost=z.number().finite().nonnegative().parse(receipt.actualUsd);
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const changed=await client.query("UPDATE assistant_requests SET state='uncertain',actual_usd=$1,result=$2 WHERE id=$3 AND state<>'complete' AND actual_usd IS NULL RETURNING id",[cost,JSON.stringify(input.failure),input.id]);
    if(changed.rowCount)await client.query("INSERT INTO api_calls(conversation_id,job_id,provider,kind,model,real_cost_usd,billed_usd,meta) VALUES($1,$2,'openrouter','chat',$3,$4,0,$5)",[input.conversationId??null,input.jobId??null,receipt.model,cost.toFixed(8),JSON.stringify({messageId:input.id,usage:receipt.usage,outcome:input.failure.code,finishReason:input.failure.finishReason,billing:"included-workspace-assistant",priceBasis:"openrouter-usage-receipt"})]);
    await client.query("COMMIT");
  } catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
