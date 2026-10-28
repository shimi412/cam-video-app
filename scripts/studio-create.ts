/** Create a studio film on behalf of a workspace user and approve its estimate, as the client would on the site
 * (Shimi, 2026-10-28: a script received outside the site still goes through the site for review and feedback).
 *   npx tsx --env-file=.env scripts/studio-create.ts <user email> <category clay|motion|comics> "<title>" <script.txt>
 * Prints the job id and the mission id; deliver the version with studio-deliver.ts (or studio-deliver-remote.sh). */
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pool} from '../src/db';
import {prepareComic,actComic} from '../src/lib/comics/service';
async function main(){
 const [email,category,title,file]=process.argv.slice(2);
 if(!email||!category||!title||!file)throw Error('usage: studio-create.ts <email> <category> <title> <script file>');
 const user=(await pool.query('SELECT id FROM app_users WHERE lower(email)=lower($1)',[email])).rows[0];
 if(!user)throw Error(`No account for ${email}`);
 const script=(await readFile(file,'utf8')).trim(),requestId=randomUUID();
 const view=await prepareComic(user.id,{requestId,title,script,category});
 const quote=view?.quote;if(!quote)throw Error('No estimate was produced');
 console.log(`job ${requestId}: ${quote.totalUsd} $, ${view.estimateMinutes} min`);
 await actComic(requestId,user.id,{type:'approve-price',quoteId:quote.id});
 const mission=(await pool.query('SELECT id,version,price_cents FROM studio_missions WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1',[requestId])).rows[0];
 console.log(`mission ${mission.id} (version ${mission.version}, ${mission.price_cents/100} $)`);
 await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
