import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {pool} from '@/db';
import {setSetting} from '../settings';
/** Studio mode (plan B, Shimi 2026-10-23): the client uses the same screens, Shimi produces each
 * version on his machine and uploads it here. The client never reads "automatic" or "manual":
 * only "in production" and "ready". See docs/studio-mode-plan-b-2026-10-23.md. */
export type Category='clay'|'motion'|'comics';
export type FulfilmentMode='engine'|'studio';
export const CATEGORIES:Category[]=['clay','motion','comics'];
export const Fulfilment=z.object({clay:z.enum(['engine','studio']).default('engine'),motion:z.enum(['engine','studio']).default('engine'),comics:z.enum(['engine','studio']).default('engine')});
export type FulfilmentSettings=z.infer<typeof Fulfilment>;
/** The admin setting `fulfilment` (key per category); a missing or invalid setting reads as engine everywhere.
 * Read through the pool like `customer_pricing` (the comics pricing and tests inject the pool, not the ORM). */
export async function fulfilmentSettings():Promise<FulfilmentSettings>{const parsed=Fulfilment.safeParse((await pool.query("SELECT value FROM settings WHERE key='fulfilment'")).rows[0]?.value??{});return parsed.success?parsed.data:Fulfilment.parse({});}
export async function fulfilmentMode(category:Category):Promise<FulfilmentMode>{return (await fulfilmentSettings())[category];}
/** Switches one category (Shimi, 2026-10-26: Attack first); the other categories keep their saved mode. A running film never changes mode: `fulfilment` is saved in its state at creation. */
export async function setFulfilmentMode(category:Category,mode:FulfilmentMode){const next=Fulfilment.parse({...await fulfilmentSettings(),[category]:mode});await setSetting('fulfilment',next);return next;}
export const Mission=z.object({id:z.uuid(),jobId:z.uuid(),category:z.enum(['clay','motion','comics']),version:z.number().int().positive(),title:z.string(),script:z.string(),feedback:z.array(z.object({text:z.string(),scene:z.number().int().positive().optional(),seconds:z.number().optional()})),priceCents:z.number().int().nonnegative(),state:z.enum(['queued','in-production','delivered']),mediaPath:z.string().nullable(),mediaSha256:z.string().nullable(),notes:z.string().nullable(),createdAt:z.string(),deliveredAt:z.string().nullable()});
export type StudioMission=z.infer<typeof Mission>;
const row=(r:Record<string,unknown>):StudioMission=>Mission.parse({id:r.id,jobId:r.job_id,category:r.category,version:r.version,title:r.title,script:r.script,feedback:r.feedback??[],priceCents:r.price_cents,state:r.state,mediaPath:r.media_path??null,mediaSha256:r.media_sha256??null,notes:r.notes??null,createdAt:new Date(r.created_at as string).toISOString(),deliveredAt:r.delivered_at?new Date(r.delivered_at as string).toISOString():null});
/** One mission per client version: V1 after the price approval, then one per approved revision quote. */
export async function createMission(input:{jobId:string;category:Category;version:number;title:string;script:string;feedback?:StudioMission['feedback'];priceCents:number}){
 const id=randomUUID();
 const r=await pool.query("INSERT INTO studio_missions(id,job_id,category,version,title,script,feedback,price_cents,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'queued') ON CONFLICT(job_id,version) DO UPDATE SET feedback=EXCLUDED.feedback,price_cents=EXCLUDED.price_cents RETURNING *",[id,input.jobId,input.category,input.version,input.title.slice(0,200),input.script,JSON.stringify(input.feedback??[]),input.priceCents]);
 const mission=row(r.rows[0]);await notifyStudio(mission).catch(()=>{});return mission;
}
export async function listMissions(filter:{open?:boolean}={}){const r=await pool.query(`SELECT * FROM studio_missions ${filter.open?"WHERE state<>'delivered'":''} ORDER BY created_at DESC LIMIT 200`);return r.rows.map(row);}
export async function missionsForJob(jobId:string){const r=await pool.query("SELECT * FROM studio_missions WHERE job_id=$1 ORDER BY version",[jobId]);return r.rows.map(row);}
export async function missionById(id:string){const r=await pool.query("SELECT * FROM studio_missions WHERE id=$1",[z.uuid().parse(id)]);return r.rows[0]?row(r.rows[0]):null;}
export const studioDirectory=(jobId:string)=>path.join(process.cwd(),'storage','studio',jobId);
/** The delivered film is stored by hash under storage/studio/<job>/; the client review page serves it. */
export async function deliverMission(id:string,file:{bytes:Uint8Array;contentType:string},notes?:string){
 if(!/^video\/mp4$/.test(file.contentType))throw Error('Upload an MP4 film.');
 if(file.bytes.length<1000||file.bytes.length>400*1024*1024)throw Error('The film must be between 1 KB and 400 MB.');
 const current=(await pool.query("SELECT * FROM studio_missions WHERE id=$1",[id])).rows[0];if(!current)throw Error('Unknown mission.');
 const mission=row(current),sha=createHash('sha256').update(file.bytes).digest('hex'),dir=studioDirectory(mission.jobId),name=`v${mission.version}-${sha.slice(0,16)}.mp4`;
 await mkdir(dir,{recursive:true});await writeFile(path.join(dir,name),file.bytes);
 const r=await pool.query("UPDATE studio_missions SET state='delivered',media_path=$2,media_sha256=$3,notes=$4,delivered_at=now() WHERE id=$1 RETURNING *",[id,path.join('studio',mission.jobId,name),sha,notes?.trim().slice(0,2000)||null]);
 return row(r.rows[0]);
}
export async function markInProduction(id:string){const r=await pool.query("UPDATE studio_missions SET state='in-production' WHERE id=$1 AND state='queued' RETURNING *",[id]);return r.rows[0]?row(r.rows[0]):null;}
/** Telegram notification to Shimi (CAM_STUDIO_TELEGRAM_BOT_TOKEN + CAM_STUDIO_TELEGRAM_CHAT_ID); silent when unset. */
export function studioNotificationText(m:StudioMission,origin=process.env.APP_URL??'http://127.0.0.1:3108'){
 const feedback=m.feedback.length?`\nRetours client (V${m.version-1}) :\n`+m.feedback.map(f=>`- ${f.scene?`scène ${f.scene} : `:f.seconds!==undefined?`à ${f.seconds.toFixed(1)} s : `:''}${f.text}`).join('\n'):'';
 return `CAM studio : nouvelle mission ${m.category} V${m.version}\nTitre : ${m.title}\nPrix approuvé : ${(m.priceCents/100).toFixed(0)} $\n${origin}/admin/studio\n\nScript :\n${m.script}${feedback}`.slice(0,3900);
}
export async function notifyStudio(m:StudioMission,send:(text:string)=>Promise<void>=sendTelegram){await send(studioNotificationText(m));}
/** Option C (2026-10-26): the client's locked notes on version N, sent to Shimi so he sets the price and delay of version N+1 on /admin/studio. */
export function studioFeedbackText(film:{id:string;title:string;category:Category;version:number},notes:{text:string;targets:number[]}[],origin=process.env.APP_URL??'http://127.0.0.1:3108'){
 const list=notes.map(n=>`- ${n.targets.length===1?`scène ${n.targets[0]} : `:''}${n.text}`).join('\n');
 return `CAM studio : retours client sur ${film.category} V${film.version}, prix de la V${film.version+1} à fixer\nTitre : ${film.title}\n${origin}/admin/studio\n\nRetours :\n${list}`.slice(0,3900);
}
export async function sendStudioMessage(text:string){await sendTelegram(text);}
async function sendTelegram(text:string){
 const token=process.env.CAM_STUDIO_TELEGRAM_BOT_TOKEN,chat=process.env.CAM_STUDIO_TELEGRAM_CHAT_ID;if(!token||!chat)return;
 const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chat,text,disable_web_page_preview:true})});
 if(!response.ok)throw Error(`Telegram ${response.status}`);
}
