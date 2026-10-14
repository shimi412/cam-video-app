import { pool } from "@/db";
import { z } from "zod";

export const AI_REQUEST_MAXIMUM_USD = 0.25;
/** One workspace-wide lock covers chat and planning reservations together. */
export async function reserveAI(input: { id: string; hash: string; conversationId?: string; purpose: string }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('cam-assistant-spending',0))");
    const prior = (await client.query("SELECT * FROM assistant_requests WHERE id=$1", [input.id])).rows[0];
    if (prior) {
      if (prior.input_hash !== input.hash) throw new Error("This AI request identifier belongs to different inputs.");
      if (prior.state !== "complete") throw new Error("This AI request was already sent and its outcome is unconfirmed. It will not be sent twice.");
      await client.query("COMMIT");
      return { replayed: true as const, result: prior.result };
    }
    const limit = z.number().finite().min(0).max(10000).parse((await client.query("SELECT value FROM settings WHERE key='assistant_monthly_usd'")).rows[0]?.value ?? 25);
    const spent = Number((await client.query("SELECT coalesce(sum(coalesce(actual_usd,maximum_usd)),0) AS usd FROM assistant_requests WHERE created_at >= date_trunc('month',now() AT TIME ZONE 'UTC')")).rows[0].usd);
    if (spent + AI_REQUEST_MAXIMUM_USD > limit) throw new Error("The workspace's monthly AI budget is reached.");
    await client.query("INSERT INTO assistant_requests(id,conversation_id,input_hash,state,maximum_usd,purpose) VALUES($1,$2,$3,'submitted',$4,$5)", [input.id, input.conversationId ?? null, input.hash, AI_REQUEST_MAXIMUM_USD, input.purpose]);
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
    const changed = await client.query("UPDATE assistant_requests SET state='complete',actual_usd=$1,result=$2 WHERE id=$3 AND state<>'complete' RETURNING id", [cost, JSON.stringify(input.result), input.id]);
    if (changed.rowCount) await client.query("INSERT INTO api_calls(conversation_id,job_id,provider,kind,model,real_cost_usd,billed_usd,meta) VALUES($1,$2,'openrouter','chat',$3,$4,0,$5)",
      [input.conversationId ?? null,input.jobId ?? null,input.model,cost.toFixed(8),JSON.stringify({messageId:input.id,usage:input.usage,billing:"included-workspace-assistant",priceBasis:"openrouter-usage-receipt"})]);
    await client.query("COMMIT");
  } catch(error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
export async function uncertainAI(id: string) { await pool.query("UPDATE assistant_requests SET state='uncertain' WHERE id=$1 AND state<>'complete'", [id]); }
