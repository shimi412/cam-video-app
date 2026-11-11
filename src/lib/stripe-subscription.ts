import type Stripe from "stripe";
import { pool } from "@/db";
import { MONTHLY_INCLUDED_CREDITS, CREDITS_PER_USD } from "@/lib/credits-display";
import { sendStudioMessage } from "@/lib/studio/missions";
/** Monthly plan of the CAM Video Studio (Shimi, 2026-11-11): 200 USD a month through a Stripe payment link
 * (subscription, metadata plan=cam-monthly, price lookup key cam_video_studio_monthly) instead of a monthly
 * invoice. Every paid subscription invoice adds the 600 included credits of its month, once per month, with the
 * same ledger note as scripts/studio-monthly-credits.ts so both paths stay idempotent together. */
export const MONTHLY_PLAN_METADATA="cam-monthly";
export const MONTHLY_PLAN_PRICE=process.env.STRIPE_MONTHLY_PRICE_ID||"price_1UaWAoE40qDkqswRAebypujz";
type Loose=Record<string,unknown>;
const obj=(v:unknown):Loose=>(v&&typeof v==="object"?v as Loose:{});
const str=(v:unknown)=>typeof v==="string"?v:typeof v==="object"&&v?String((v as Loose).id??""):"";
/** True when the invoice belongs to the CAM monthly plan, whatever the Stripe API shape (2022 `subscription_details`
 * and `price`, 2025 `parent.subscription_details` and `pricing.price_details`). */
export function monthlyPlanInvoice(invoice:Stripe.Invoice|Loose){
 const i=obj(invoice);
 const metadata={...obj(obj(i.subscription_details).metadata),...obj(obj(obj(i.parent).subscription_details).metadata),...obj(i.metadata)};
 if(metadata.plan===MONTHLY_PLAN_METADATA)return true;
 const lines=(obj(i.lines).data as unknown[]|undefined)??[];
 return lines.some(l=>{const line=obj(l);return str(line.price)===MONTHLY_PLAN_PRICE||str(obj(obj(line.pricing).price_details).price)===MONTHLY_PLAN_PRICE;});
}
/** Month covered by the invoice (first line period, else the invoice date), as YYYY-MM. */
export function invoiceMonth(invoice:Stripe.Invoice|Loose){
 const i=obj(invoice);const lines=(obj(i.lines).data as unknown[]|undefined)??[];
 const start=Number(obj(obj(lines[0]).period).start)||Number(i.period_start)||Number(i.created)||Date.now()/1000;
 return new Date(start*1000).toISOString().slice(0,7);
}
async function balanceCredits(){const r=await pool.query("SELECT coalesce(sum(delta_usd),0) AS usd FROM credit_ledger WHERE wallet='customer'");return Math.round(Number(r.rows[0].usd)*CREDITS_PER_USD);}
/** invoice.paid: add the month's included credits once. Returns what happened, for the logs. */
export async function settleMonthlyInvoice(invoice:Stripe.Invoice){
 if(!invoice.livemode)return "test invoice ignored";
 if(invoice.status!=="paid"&&(invoice.amount_paid??0)<=0)return "invoice not paid";
 if(!monthlyPlanInvoice(invoice))return "not the CAM monthly plan";
 const month=invoiceMonth(invoice),note=`Monthly included credits ${month}`;
 const c=await pool.connect();let added=false;
 try{await c.query("BEGIN");await c.query("SELECT pg_advisory_xact_lock(hashtext($1))",[note]);
  const done=await c.query("SELECT 1 FROM credit_ledger WHERE wallet='customer' AND note=$1",[note]);
  if(!done.rowCount){await c.query("INSERT INTO credit_ledger(id,delta_usd,kind,note,wallet) VALUES(gen_random_uuid(),$1,'adjustment',$2,'customer')",[(MONTHLY_INCLUDED_CREDITS/CREDITS_PER_USD).toFixed(2),note]);added=true;}
  await c.query("COMMIT");}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
 const amount=((invoice.amount_paid??0)/100).toFixed(0),balance=await balanceCredits();
 await sendStudioMessage(`CAM : abonnement mensuel payé (${amount} ${(invoice.currency??"usd").toUpperCase()}, ${month}). ${added?`${MONTHLY_INCLUDED_CREDITS} crédits ajoutés`:"crédits du mois déjà ajoutés"}. Solde client : ${balance} crédits.`).catch(()=>{});
 return added?`added ${MONTHLY_INCLUDED_CREDITS} credits for ${month}`:`credits already added for ${month}`;
}
/** invoice.payment_failed and customer.subscription.deleted: Shimi is told, nothing else changes. */
export async function notifySubscriptionEvent(event:Stripe.Event){
 const o=event.data.object as unknown as Loose;
 if(event.type==="invoice.payment_failed"){if(!monthlyPlanInvoice(o))return;await sendStudioMessage(`CAM : échec du paiement de l'abonnement mensuel (${invoiceMonth(o)}). Stripe réessaiera ; vérifier le tableau de bord.`).catch(()=>{});}
 if(event.type==="customer.subscription.deleted"){if(obj(o.metadata).plan!==MONTHLY_PLAN_METADATA)return;await sendStudioMessage("CAM : l'abonnement mensuel a été résilié par le client (fin de période). Les crédits mensuels s'arrêtent.").catch(()=>{});}
}
