import Stripe from "stripe";
import { pool } from "@/db";
import { randomUUID } from "node:crypto";
import { creditedUsdForCents } from "@/lib/credits-display";
export function stripeClient(){const key=process.env.STRIPE_SECRET_KEY;if(!key)throw Error("Payments are not configured yet. Please contact Bina.");return new Stripe(key,{maxNetworkRetries:0,timeout:20000});}
export function paymentsConfigured(){return Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_WEBHOOK_SECRET&&process.env.CAM_PUBLIC_URL);}
export async function createTopup(actor:string,id:string,cents:number){
 if(!paymentsConfigured())throw Error("Payments are not configured yet. Please contact Bina.");
 const stripe=stripeClient(),live=process.env.STRIPE_SECRET_KEY!.startsWith("sk_live_");
 await pool.query("INSERT INTO credit_orders(id,actor_id,amount_cents,live) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",[id,actor,cents,live]);
 const order=(await pool.query("SELECT * FROM credit_orders WHERE id=$1",[id])).rows[0];if(order.actor_id!==actor||order.amount_cents!==cents||order.live!==live)throw Error("This recharge identifier is already used.");
 if(order.status==='paid'||order.status==='test-paid')throw Error("This recharge has already been processed.");
 if(!order.session_id&&Date.now()-new Date(order.created_at).getTime()>23*3600000)throw Error("This recharge request has expired. Start a new recharge.");
 const origin=new URL(process.env.CAM_PUBLIC_URL!).origin;
 const session=order.session_id?await stripe.checkout.sessions.retrieve(order.session_id):await stripe.checkout.sessions.create({mode:"payment",allowed_payment_method_types:["card"],client_reference_id:id,metadata:{orderId:id},line_items:[{price_data:{currency:"usd",unit_amount:cents,product_data:{name:live?"CAM video credits":"CAM credits · test only"}},quantity:1}],success_url:`${origin}/credits?payment=received`,cancel_url:`${origin}/credits?payment=cancelled`},{idempotencyKey:`cam-topup-${id}`});
 await pool.query("UPDATE credit_orders SET session_id=$2 WHERE id=$1",[id,session.id]);if(!session.url)throw Error("This checkout has expired. Start a new recharge.");return session.url;
}
/** Payment verification is required before entering this transaction. Multiple events
 * for the same session are serialized and can create at most one ledger entry. */
export async function settleTopup(session:Stripe.Checkout.Session){
 if(session.payment_status!=="paid"||session.mode!=="payment")return;
 const c=await pool.connect();try{await c.query("BEGIN");const order=(await c.query("SELECT * FROM credit_orders WHERE id=$1 FOR UPDATE",[session.client_reference_id])).rows[0];
 if(!order)throw Error("Unknown payment order.");
 if(session.currency!=="usd"||session.amount_total!==order.amount_cents||session.livemode!==order.live||session.metadata?.orderId!==order.id||(order.session_id&&order.session_id!==session.id))throw Error("Payment does not match the saved order.");
 if(order.status!=='paid'&&order.status!=='test-paid'){
 let ledger:string|null=null;if(session.livemode){ledger=randomUUID();await c.query("INSERT INTO credit_ledger(id,delta_usd,kind,note,wallet) VALUES($1,$2,'topup',$3,'customer')",[ledger,creditedUsdForCents(order.amount_cents).toFixed(2),`Stripe recharge ${session.id}`]);}
 await c.query("UPDATE credit_orders SET status=$2,session_id=$3,ledger_id=$4 WHERE id=$1",[order.id,session.livemode?'paid':'test-paid',session.id,ledger]);}
 await c.query("COMMIT");}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
}
