/** Reconcile pending Stripe recharges with Stripe itself: every pending order with a checkout session is
 * fetched and, when Stripe says it is paid, settled exactly as the webhook would (one ledger entry at most).
 *
 *   npx tsx --env-file=.env scripts/stripe-reconcile.ts
 */
import {pool} from '../src/db';
import {stripeClient,settleTopup} from '../src/lib/stripe-billing';
async function main(){
 const stripe=stripeClient();
 const pending=(await pool.query("SELECT id,session_id,amount_cents FROM credit_orders WHERE status='pending' AND session_id IS NOT NULL ORDER BY created_at")).rows;
 for(const order of pending){
  const session=await stripe.checkout.sessions.retrieve(order.session_id);
  if(session.payment_status!=='paid'){console.log(`${order.id} ${order.amount_cents/100} $: ${session.status} / ${session.payment_status}`);continue;}
  try{await settleTopup(session);const row=(await pool.query("SELECT status,ledger_id FROM credit_orders WHERE id=$1",[order.id])).rows[0];console.log(`${order.id} ${order.amount_cents/100} $: settled -> ${row.status}${row.ledger_id?' (credited)':''}`);}
  catch(e){console.log(`${order.id} ${order.amount_cents/100} $: paid but not settled: ${e instanceof Error?e.message:e}`);}
 }
 const balance=(await pool.query("SELECT round(sum(delta_usd),2) AS usd FROM credit_ledger WHERE wallet='customer'")).rows[0].usd;
 console.log(`balance ${balance} USD`);await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
