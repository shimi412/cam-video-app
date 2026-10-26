/** Monthly included credits (Shimi, 2026-10-26): 600 credits (60 USD on the customer wallet) are added once per
 * calendar month with the plan, on top of recharges. Idempotent: a second run in the same month adds nothing.
 *
 *   npx tsx --env-file=.env scripts/studio-monthly-credits.ts            # this month
 *   npx tsx --env-file=.env scripts/studio-monthly-credits.ts --welcome  # also the 1,200 welcome credits, once ever
 */
import {pool} from '../src/db';
import {MONTHLY_INCLUDED_CREDITS,WELCOME_CREDITS,CREDITS_PER_USD} from '../src/lib/credits-display';
async function main(){
 const month=new Date().toISOString().slice(0,7);
 const note=`Monthly included credits ${month}`;
 const done=await pool.query("SELECT 1 FROM credit_ledger WHERE wallet='customer' AND note=$1",[note]);
 if(done.rowCount){console.log('already added for',month);}
 else{await pool.query("INSERT INTO credit_ledger(id,delta_usd,kind,note,wallet) VALUES(gen_random_uuid(),$1,'adjustment',$2,'customer')",[(MONTHLY_INCLUDED_CREDITS/CREDITS_PER_USD).toFixed(2),note]);console.log('added',MONTHLY_INCLUDED_CREDITS,'credits for',month);}
 if(process.argv.includes('--welcome')){
  const w=await pool.query("SELECT 1 FROM credit_ledger WHERE wallet='customer' AND note='Welcome credits'");
  if(w.rowCount)console.log('welcome credits already added');
  else{await pool.query("INSERT INTO credit_ledger(id,delta_usd,kind,note,wallet) VALUES(gen_random_uuid(),$1,'adjustment','Welcome credits','customer')",[(WELCOME_CREDITS/CREDITS_PER_USD).toFixed(2)]);console.log('added',WELCOME_CREDITS,'welcome credits');}
 }
 await pool.end();
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exit(1);});
