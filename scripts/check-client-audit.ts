/** Runs entirely in a disposable Postgres schema. All inference is stubbed.
 * No real payment, generation, customer ledger or support budget is touched. */
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
async function main(){
const source=process.env.DATABASE_URL??"postgres://cam:cam@localhost:5433/cam_video_app";
const isolation=`audit_${randomUUID().replaceAll('-','')}`;
const setup=new Pool({connectionString:source});await setup.query(`CREATE SCHEMA ${isolation}`);
const url=new URL(source);url.searchParams.set('options',`-c search_path=${isolation}`);process.env.DATABASE_URL=url.href;
const {pool}=await import('../src/db');
try{
 for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())await pool.query(await readFile(`migrations/${file}`,'utf8'));
 const {answerSupport,supportStatus,supportHistory}=await import('../src/lib/help-support');
 const {settleTopup}=await import('../src/lib/stripe-billing');
 let calls=0;
 const services={available:async()=>true,price:async()=>({id:'deepseek/deepseek-chat',input:0,output:0.00001,request:0,context:100000,modalities:['text']}),generate:async<T>(input:{schema:{parse:(x:unknown)=>T}})=>{calls++;return {object:input.schema.parse({reply:'Open My videos.'}),actualUsd:0.01,usage:{inputTokens:10,outputTokens:10,requestId:'stub'},model:'stub'};}};
 const actor='test-user',threadId=randomUUID(),input={id:randomUUID(),threadId,question:'Where is my film?'};
 await answerSupport(actor,input,services);await answerSupport(actor,input,services);assert.equal(calls,1,'replay must not generate twice');
 await assert.rejects(()=>answerSupport('another-user',input,services));assert.equal((await supportHistory('another-user',threadId)).length,0,'history ownership');
 assert.equal(Number((await pool.query('SELECT coalesce(sum(delta_usd),0) AS balance FROM credit_ledger')).rows[0].balance),0,'support must not consume video credits');
 await pool.query('UPDATE support_requests SET actual_usd=5 WHERE id=$1',[input.id]);assert.equal((await supportStatus()).warning,true);
 await pool.query('UPDATE support_requests SET actual_usd=9.99 WHERE id=$1',[input.id]);
 const results=await Promise.allSettled([1,2].map(()=>answerSupport(actor,{...input,id:randomUUID()},services)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1,'concurrent reservations share the last budget');assert.ok((await supportStatus()).blockedUntil);
 await assert.rejects(()=>answerSupport('third-user',{...input,id:randomUUID()},services));
 await pool.query("UPDATE support_requests SET created_at=now()-interval '25 hours'");await pool.query("UPDATE support_budget SET blocked_until=now()-interval '1 second'");
 await answerSupport(actor,{...input,id:randomUUID()},services);assert.equal((await supportStatus()).blockedUntil,null);
 const uncertain={...input,id:randomUUID()};await assert.rejects(()=>answerSupport(actor,uncertain,{...services,generate:async()=>{calls++;throw Error('lost response');}}));const before=calls;await assert.rejects(()=>answerSupport(actor,uncertain,services));assert.equal(calls,before,'unknown outcomes are never regenerated');
 const order=randomUUID();await pool.query("INSERT INTO credit_orders(id,actor_id,amount_cents,live) VALUES($1,$2,2500,true)",[order,actor]);
 const session={id:'cs_test_fixture',client_reference_id:order,metadata:{orderId:order},mode:'payment',payment_status:'paid',currency:'usd',amount_total:2500,livemode:true} as unknown as Parameters<typeof settleTopup>[0];
 await Promise.all([settleTopup(session),settleTopup(session)]);assert.equal(Number((await pool.query('SELECT sum(delta_usd) AS balance FROM credit_ledger')).rows[0].balance),25,'duplicate webhooks credit only once');
 await assert.rejects(()=>settleTopup({...session,amount_total:2600}));
 const testOrder=randomUUID();await pool.query("INSERT INTO credit_orders(id,actor_id,amount_cents,live) VALUES($1,$2,2500,false)",[testOrder,actor]);await settleTopup({...session,id:'cs_other',client_reference_id:testOrder,metadata:{orderId:testOrder},livemode:false});assert.equal(Number((await pool.query('SELECT sum(delta_usd) AS balance FROM credit_ledger')).rows[0].balance),25,'test payments grant no real credits');
 const unpaidOrder=randomUUID();await pool.query("INSERT INTO credit_orders(id,actor_id,amount_cents,live) VALUES($1,$2,2500,true)",[unpaidOrder,actor]);await settleTopup({...session,id:'cs_unpaid',client_reference_id:unpaidOrder,metadata:{orderId:unpaidOrder},payment_status:'unpaid'});assert.equal((await pool.query('SELECT status FROM credit_orders WHERE id=$1',[unpaidOrder])).rows[0].status,'pending');
 await pool.query("INSERT INTO credit_ledger(delta_usd,kind,note) VALUES(999,'topup','Local test balance')");
 const {reserveCredits,settleCredits,walletTotals}=await import('../src/lib/customer-wallet');
 const job=randomUUID(),otherJob=randomUUID(),quoteId='a'.repeat(64),otherQuote='b'.repeat(64);
 await pool.query("INSERT INTO jobs(id,script) VALUES($1,'Test production'),($2,'Other production')",[job,otherJob]);
 await pool.query("INSERT INTO customer_quotes(id,job_id,supplier_quote,amount_cents,expires_at) VALUES($1,$2,'supplier',2000,now()+interval '1 hour'),($3,$4,'supplier2',2000,now()+interval '1 hour')",[quoteId,job,otherQuote,otherJob]);
 await reserveCredits(job,quoteId,'supplier');await reserveCredits(job,quoteId,'supplier');assert.equal((await walletTotals()).reserved,20);assert.equal((await walletTotals()).available,5);
 await assert.rejects(()=>reserveCredits(otherJob,otherQuote,'supplier2'));
 await Promise.all([settleCredits(job,true),settleCredits(job,true)]);assert.equal((await walletTotals()).balance,5);assert.equal((await walletTotals()).reserved,0);
 await assert.rejects(()=>reserveCredits(otherJob,quoteId,'supplier'));
 process.env.STRIPE_SECRET_KEY='sk_test_fixture';process.env.STRIPE_WEBHOOK_SECRET='whsec_fixture';
 const {POST}=await import('../src/app/api/stripe/webhook/route');assert.equal((await POST(new Request('http://localhost/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':'fake'},body:'{}'}))).status,400);
 console.log('PASS: support isolation, shared thresholds, concurrency, replay, uncertainty, cooldown; payment idempotency, amount checks, test-mode separation, unpaid events and invalid signatures. No external calls.');
}finally{await pool.end();await setup.query(`DROP SCHEMA ${isolation} CASCADE`);await setup.end();}

}
void main().catch(e=>{console.error(e);process.exitCode=1;});
