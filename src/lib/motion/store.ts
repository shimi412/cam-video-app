import {pool} from '@/db';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {z} from 'zod';
import type {MotionState} from './state';
import {price} from './model';
import {providerMode} from '../providers/mode';
export const motionDirectory=(id:string,revision?:number)=>path.resolve('storage/motion',z.uuid().parse(id),revision===undefined?'':`revision-${z.number().int().min(0).max(2).parse(revision)}`);
export async function getMotion(id:string,actor:string){

 const r=await pool.query('SELECT m.state,j.title,j.saved_to_library FROM motion_runs m JOIN jobs j ON j.id=m.job_id WHERE m.job_id=$1 AND m.actor_id=$2 AND j.deleted_at IS NULL',[z.uuid().parse(id),actor]);if(!r.rows[0])throw Error('Video not found.');return {...r.rows[0].state,title:r.rows[0].title,saved:r.rows[0].saved_to_library} as MotionState;
}
export async function saveMotion(id:string,state:MotionState){await pool.query('UPDATE motion_runs SET state=$2,updated_at=now() WHERE job_id=$1',[id,JSON.stringify(state)]);}
export async function lockMotion<T>(id:string,fn:()=>Promise<T>,tryOnly=false){const c=await pool.connect();let owned=false;try{const r=await c.query(`SELECT ${tryOnly?'pg_try_advisory_lock':'pg_advisory_lock'}(hashtextextended($1,0)) AS acquired`,[`motion-${id}`]);if(tryOnly&&!r.rows[0].acquired)return;owned=true;return await fn();}finally{if(owned)await c.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[`motion-${id}`]);c.release();}}
export async function motionQuote(id:string,revision:number,offer?:{id:string;totalUsd:number}){
 const quote=offer?.id??`motion-v1-${revision}`,quoteId=`${id}-${quote}`;
 await pool.query('INSERT INTO customer_quotes(id,job_id,supplier_quote,amount_cents,expires_at) VALUES($1,$2,$3,$4,now()+interval \'15 minutes\') ON CONFLICT(job_id,supplier_quote) DO UPDATE SET expires_at=excluded.expires_at',[quoteId,id,quote,(offer?.totalUsd??price(revision))*100]);
 return {quoteId,quote};
}
export async function newMotion(actor:string,input:{script:string;title:string;requestId:string}){
 // Request ID is supplied once by the start form; reloads cannot create a second billable job.
 const id=z.uuid().parse(input.requestId);const c=await pool.connect();
 try{await c.query('BEGIN');const state:MotionState={version:1,phase:'queued',revision:0,title:input.title,script:input.script,progress:'Waiting to start',work:'initial',targets:[],feedback:'',deferredFeedback:'',votes:{},receipts:[],operations:{},approved:{},settings:{music:'normal',captions:true},history:[]};
 const row=await c.query("INSERT INTO jobs(id,script,title,params,status) VALUES($1,$2,$3,$4,'draft') ON CONFLICT(id) DO NOTHING RETURNING id",[id,input.script,input.title,JSON.stringify({filmType:'motion',productionMethod:'whimsical-v1',aspectRatio:'9:16',executionMode:providerMode(),live:true})]);
 if(row.rowCount)await c.query('INSERT INTO motion_runs(job_id,actor_id,state) VALUES($1,$2,$3)',[id,actor,JSON.stringify(state)]);
 else{const saved=await c.query('SELECT state FROM motion_runs WHERE job_id=$1 AND actor_id=$2',[id,actor]);if(!saved.rows[0]||saved.rows[0].state.script!==input.script)throw Error('This start request belongs to a different film.');}
 await c.query('COMMIT');return id;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export const operationId=()=>randomUUID();
