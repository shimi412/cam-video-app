import { pool } from "@/db";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { customerPriceCents, firstVersionPriceCents, revisionPriceCents } from "./customer-price";
import type { CamQuote } from "./providers/cam-pricing";
export const CustomerPricingSchema=z.object({mode:z.enum(["fixed","adaptive-v1","tiers-v2"]).default("fixed"),multiplier:z.number().finite().min(1).max(100),higgsfieldCreditUsd:z.number().finite().positive().max(1000)});
export type CustomerPricing=z.infer<typeof CustomerPricingSchema>;
export async function customerPricingReady(){return CustomerPricingSchema.safeParse((await pool.query("SELECT value FROM settings WHERE key='customer_pricing'")).rows[0]?.value).success;}
/** The configured policy, or null before Bina activates pricing. */
export async function customerPricing():Promise<CustomerPricing|null>{const parsed=CustomerPricingSchema.safeParse((await pool.query("SELECT value FROM settings WHERE key='customer_pricing'")).rows[0]?.value);return parsed.success?parsed.data:null;}
/** Under the 2026-10-23 grid (`tiers-v2`) a quote is priced by what it is: a first complete version by cost tiers on
 * its whole estimated supplier cost, a revision by its additional estimated cost x2 on top of the previous quote's
 * amount. The caller names the previous approved quote and the AI allowance of the category; `amountCents`
 * binds an already approved amount to a renewed supplier quote (automatic replacement, same price). */
export type CustomerQuoteBasis={previous?:CamQuote;allowanceUsd?:number;amountCents?:number};
const supplierUsd=(quote:CamQuote,config:{higgsfieldCreditUsd:number})=>quote.caps.usd/1e6+quote.caps['higgsfield-credit']/1e6*config.higgsfieldCreditUsd;
/** No default customer price: pricing must be explicitly configured after the
 * commercial review. Supplier credits and USD cannot be silently conflated. */
export async function customerQuote(jobId:string,quote:CamQuote,basis:CustomerQuoteBasis={}){
 // Reusing imported storyboard media requires no purchase or artificial credit.
 if(quote.scope==="storyboard"&&quote.caps.usd===0&&quote.caps["higgsfield-credit"]===0)
  return {id:createHash("sha256").update(JSON.stringify({jobId,quote:quote.id,amountCents:0})).digest("hex"),amountCents:0,expiresAt:quote.expiresAt};
 const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtextextended('cam-customer-wallet',0))");
 const saved=(await c.query('SELECT * FROM customer_quotes WHERE job_id=$1 AND supplier_quote=$2',[jobId,quote.id])).rows[0];
 if(saved){
  // Existing approvals are immutable. Replace only never-approved fractional quotes.
  const held=(await c.query('SELECT 1 FROM credit_holds WHERE quote_id=$1',[saved.id])).rowCount;
  if(saved.amount_cents%100&&!held){
   const rounded=Math.ceil(saved.amount_cents/100)*100;
   const replacement=createHash('sha256').update(JSON.stringify({jobId,quote:quote.id,amountCents:rounded})).digest('hex');
   await c.query('UPDATE customer_quotes SET id=$2,amount_cents=$3 WHERE id=$1',[saved.id,replacement,rounded]);saved.id=replacement;saved.amount_cents=rounded;
  }
  await c.query('COMMIT');return {id:saved.id,amountCents:saved.amount_cents,expiresAt:new Date(saved.expires_at).getTime()};
 }
 const config=CustomerPricingSchema.safeParse((await c.query("SELECT value FROM settings WHERE key='customer_pricing'")).rows[0]?.value);
 if(!config.success){await c.query('COMMIT');return null;}
 let amountCents:number;
 if(basis.amountCents!==undefined)amountCents=basis.amountCents;
 else if(config.data.mode==="tiers-v2"&&basis.previous){
  const previous=(await c.query('SELECT amount_cents FROM customer_quotes WHERE job_id=$1 AND supplier_quote=$2',[jobId,basis.previous.id])).rows[0];
  if(!previous)throw Error('The previous approved customer quote is missing. Review the current quote.');
  amountCents=Number(previous.amount_cents)+revisionPriceCents(Math.max(0,supplierUsd(quote,config.data)-supplierUsd(basis.previous,config.data))+(basis.allowanceUsd??0));
 }
 else if(config.data.mode==="tiers-v2")amountCents=firstVersionPriceCents(supplierUsd(quote,config.data)+(basis.allowanceUsd??0));
 else amountCents=customerPriceCents(supplierUsd(quote,config.data),config.data);
 if(!Number.isSafeInteger(amountCents)||amountCents<0||amountCents>1000000)throw Error('Customer quote is outside the supported range.');
 const id=createHash('sha256').update(JSON.stringify({jobId,quote:quote.id,amountCents})).digest('hex');
 await c.query('INSERT INTO customer_quotes(id,job_id,supplier_quote,amount_cents,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(job_id,supplier_quote) DO NOTHING',[id,jobId,quote.id,amountCents,new Date(quote.expiresAt)]);
 const row=(await c.query('SELECT * FROM customer_quotes WHERE job_id=$1 AND supplier_quote=$2',[jobId,quote.id])).rows[0];await c.query('COMMIT');return {id:row.id,amountCents:row.amount_cents,expiresAt:new Date(row.expires_at).getTime()};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function reserveCredits(jobId:string,quoteId:string,supplierQuote:string){
 const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtextextended('cam-customer-wallet',0))");
 const quote=(await c.query('SELECT * FROM customer_quotes WHERE id=$1 AND job_id=$2 AND supplier_quote=$3',[quoteId,jobId,supplierQuote])).rows[0];if(!quote||new Date(quote.expires_at).getTime()<=Date.now())throw Error('Review the current customer quote before continuing.');
 const old=(await c.query('SELECT * FROM credit_holds WHERE job_id=$1',[jobId])).rows[0];if(old?.state==='spent'){if(old.quote_id!==quoteId)throw Error('This video has already been billed.');await c.query('COMMIT');return;}
 const balance=Number((await c.query('SELECT coalesce(sum(delta_usd),0)*100 AS cents FROM credit_ledger WHERE wallet=\'customer\'')).rows[0].cents);
 const held=Number((await c.query("SELECT coalesce(sum(amount_cents),0) AS cents FROM credit_holds WHERE state='reserved' AND job_id<>$1",[jobId])).rows[0].cents);
 if(balance-held<quote.amount_cents)throw Error('Not enough available credits. Open My credits to recharge.');
 await c.query("INSERT INTO credit_holds(job_id,quote_id,amount_cents,state) VALUES($1,$2,$3,'reserved') ON CONFLICT(job_id) DO UPDATE SET quote_id=$2,amount_cents=$3,state='reserved',updated_at=now()",[jobId,quoteId,quote.amount_cents]);await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function settleCredits(jobId:string,completed:boolean){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtextextended('cam-customer-wallet',0))");const hold=(await c.query("SELECT * FROM credit_holds WHERE job_id=$1 AND state='reserved' FOR UPDATE",[jobId])).rows[0];if(hold){let ledger:string|null=null;if(completed){ledger=randomUUID();await c.query("INSERT INTO credit_ledger(id,delta_usd,kind,job_id,note,wallet) VALUES($1,$2,'consumption',$3,'Completed video, approved customer quote','customer')",[ledger,(-hold.amount_cents/100).toFixed(2),jobId]);await c.query('UPDATE jobs SET billed_usd=$2 WHERE id=$1',[jobId,(hold.amount_cents/100).toFixed(2)]);}await c.query('UPDATE credit_holds SET state=$2,ledger_id=$3,updated_at=now() WHERE job_id=$1',[jobId,completed?'spent':'released',ledger]);}await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export async function walletTotals(){const r=(await pool.query("SELECT coalesce(sum(amount_cents) FILTER(WHERE state='reserved'),0) AS reserved FROM credit_holds")).rows[0];const balance=Number((await pool.query('SELECT coalesce(sum(delta_usd),0) AS balance FROM credit_ledger WHERE wallet=\'customer\'')).rows[0].balance);return {balance,available:balance-Number(r.reserved)/100,reserved:Number(r.reserved)/100};}

/** The current hold of a video on the customer wallet: the amount the client approved for its versions. */
export async function creditHold(jobId:string){
 const row=(await pool.query('SELECT quote_id,amount_cents,state FROM credit_holds WHERE job_id=$1',[jobId])).rows[0];
 return row?{quoteId:String(row.quote_id),amountCents:Number(row.amount_cents),state:String(row.state) as 'reserved'|'spent'|'released'}:null;
}
export async function availableForProduction(jobId:string){
 const row=(await pool.query("SELECT (SELECT coalesce(sum(delta_usd),0)*100 FROM credit_ledger WHERE wallet='customer') - coalesce(sum(amount_cents) FILTER(WHERE state='reserved' AND job_id<>$1),0) AS cents FROM credit_holds",[jobId])).rows[0];
 return Math.round(Number(row.cents));
}
