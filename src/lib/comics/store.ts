import {pool} from '@/db';
import {z} from 'zod';
import path from 'node:path';
import {providerMode} from '../providers/mode';
import {reserveCredits} from '../customer-wallet';
import type {ComicState,Quote} from './model';
export const comicDirectory=(id:string)=>path.resolve('storage/comics',z.uuid().parse(id));
/** Where a saved media name of a film lives: the engine's files under storage/comics/<id>/, a studio delivery
 * (`studio/<id>/vN-<sha>.mp4`, written by `deliverMission`) under storage/studio/<id>/. Only this film's own studio folder. */
export function comicFile(id:string,file:string){const safe=z.uuid().parse(id);return file.startsWith(`studio/${safe}/`)?path.resolve('storage',file):path.join(comicDirectory(safe),file);}
/** The client account a film belongs to (the executor delivers without a session). */
export async function comicActor(jobId:string){const r=await pool.query('SELECT actor_id FROM comics_runs WHERE job_id=$1',[z.uuid().parse(jobId)]);if(!r.rows[0])throw Error('Video not found.');return String(r.rows[0].actor_id);}
export async function getComic(id:string,actor:string){const r=await pool.query('SELECT c.state,j.saved_to_library FROM comics_runs c JOIN jobs j ON j.id=c.job_id WHERE c.job_id=$1 AND c.actor_id=$2 AND j.deleted_at IS NULL',[z.uuid().parse(id),actor]);if(!r.rows[0])throw Error('Video not found.');return {...r.rows[0].state,saved:r.rows[0].saved_to_library} as ComicState;}
export async function saveComic(s:ComicState){await pool.query("WITH saved AS (UPDATE comics_runs SET state=$2,updated_at=now() WHERE job_id=$1 RETURNING job_id) UPDATE jobs SET status=$3 WHERE id IN (SELECT job_id FROM saved)",[s.id,JSON.stringify(s),s.phase==='complete'?'succeeded':s.phase==='blocked'?'failed':s.queued?'running':'estimated']);}
export async function lockComic<T>(id:string,fn:()=>Promise<T>,tryOnly=false){const c=await pool.connect();let locked=false;try{const r=await c.query(`SELECT ${tryOnly?'pg_try_advisory_lock':'pg_advisory_lock'}(hashtextextended($1,0)) AS locked`,[`comics-${z.uuid().parse(id)}`]);if(tryOnly&&!r.rows[0].locked)return;locked=true;return await fn();}finally{if(locked)await c.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[`comics-${id}`]);c.release();}}
export async function createComic(actor:string,id:string,title:string,script:string){
 const c=await pool.connect();try{await c.query('BEGIN');// New films follow the single journey (Shimi, 2026-10-23); saved films without `journey` keep the legacy gated flow.
 const s:ComicState={version:1,journey:'single',id:z.uuid().parse(id),title,script,phase:'planning',revision:0,queued:false,progress:'Preparing your estimate',approvedQuotes:[],operations:{},notes:[],votes:{},approved:{},images:{},clips:{},settings:{music:'normal',captions:true},targets:[]};
 const r=await c.query("INSERT INTO jobs(id,script,title,params,status) VALUES($1,$2,$3,$4,'draft') ON CONFLICT(id) DO NOTHING RETURNING id",[id,script,title,JSON.stringify({filmType:'comics',productionMethod:'whimsical-v1',aspectRatio:'9:16',executionMode:providerMode(),live:true})]);
 if(r.rowCount)await c.query('INSERT INTO comics_runs(job_id,actor_id,state) VALUES($1,$2,$3)',[id,actor,JSON.stringify(s)]);
 else{const old=(await c.query('SELECT state FROM comics_runs WHERE job_id=$1 AND actor_id=$2',[id,actor])).rows[0];if(!old||old.state.script!==script||old.state.title!==title)throw Error('This request belongs to another video.');}
 await c.query('COMMIT');return getComic(id,actor);
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function holdComic(s:ComicState,q:Quote){const supplier=`comics-${q.id}`,id=`${s.id}-${q.id}`;await pool.query('INSERT INTO customer_quotes(id,job_id,supplier_quote,amount_cents,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(job_id,supplier_quote) DO NOTHING',[id,s.id,supplier,q.totalUsd*100,new Date(q.expires)]);await reserveCredits(s.id,id,supplier);}
