import {pool} from '@/db';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {AgentMessage} from './transport';

export const sessionId=(id:string)=>z.uuid().parse(id);
export const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export type MemoryEntry={id:string;content:string;reason:string;source_session:string;source_turn:string;status:string;version:number};
export type TurnState={transportIdentityVersion?:2;messages:AgentMessage[];system:string;memory:MemoryEntry[];spent:number;step:number;complete:boolean;result?:unknown;loadedSkills:string[];measured?:{messages:number;promptTokens:number;cachedTokens?:number;cacheWriteTokens?:number;at?:number}};
export type AgentStore={
 lock:<T>(session:string,work:()=>Promise<T>)=>Promise<T>;
 get:(session:string,id:string,hash:string)=>Promise<TurnState|null>;
 put:(session:string,id:string,hash:string,state:TurnState)=>Promise<void>;
 history:(session:string,before?:number)=>Promise<{sequence:number;kind:string;content:unknown}[]>;
 event:(session:string,key:string,kind:'request'|'decision'|'execution',content:unknown)=>Promise<void>;
 memories:()=>Promise<MemoryEntry[]>;
 propose:(session:string,turn:string,content:string,reason:string)=>Promise<string>;
};
export const postgresAgentStore:AgentStore={
 async lock(session,work){sessionId(session);const c=await pool.connect();try{await c.query("SELECT pg_advisory_lock(hashtextextended($1,0))",[`agent-${session}`]);await c.query('INSERT INTO cam_agent_sessions(id) VALUES($1) ON CONFLICT DO NOTHING',[session]);return await work();}finally{await c.query("SELECT pg_advisory_unlock(hashtextextended($1,0))",[`agent-${session}`]);c.release();}},
 async get(session,id,hash){const row=(await pool.query('SELECT input_hash,state FROM cam_agent_turns WHERE session_id=$1 AND id=$2',[sessionId(session),id])).rows[0];if(!row)return null;if(row.input_hash!==hash)throw Error('This agent turn belongs to different inputs.');return row.state as TurnState;},
 async put(session,id,hash,state){await pool.query(`INSERT INTO cam_agent_turns(session_id,id,input_hash,state) VALUES($1,$2,$3,$4) ON CONFLICT(session_id,id) DO UPDATE SET state=excluded.state,updated_at=now() WHERE cam_agent_turns.input_hash=excluded.input_hash`,[sessionId(session),id,hash,JSON.stringify(state)]);},
 async history(session,before){return (await pool.query('SELECT sequence,kind,content FROM cam_agent_events WHERE session_id=$1 AND sequence<$2 ORDER BY sequence DESC LIMIT 12',[sessionId(session),before??Number.MAX_SAFE_INTEGER])).rows.reverse().map(row=>({...row,sequence:Number(row.sequence)}));},
 async event(session,key,kind,content){await pool.query('INSERT INTO cam_agent_sessions(id) VALUES($1) ON CONFLICT DO NOTHING',[sessionId(session)]);await pool.query('INSERT INTO cam_agent_events(session_id,event_key,kind,content) VALUES($1,$2,$3,$4) ON CONFLICT(session_id,event_key) DO NOTHING',[session,key,kind,JSON.stringify(content)]);},
 async memories(){return (await pool.query("SELECT id,content,reason,source_session,source_turn,status,version FROM cam_agent_memories WHERE status='approved' ORDER BY created_at,id")).rows;},
 async propose(session,turn,content,reason){const c=z.string().trim().min(10).max(1500).parse(content),r=z.string().trim().min(10).max(1000).parse(reason);return (await pool.query(`INSERT INTO cam_agent_memories(id,content,reason,source_session,source_turn) VALUES($1,$2,$3,$4,$5) ON CONFLICT(source_session,source_turn,content) DO UPDATE SET content=cam_agent_memories.content RETURNING id`,[randomUUID(),c,r,sessionId(session),turn])).rows[0].id;},
};

export async function reviewMemory(input:{id:string;version:number;status:'approved'|'rejected'|'retired';actor:string}){
 const row=await pool.query(`UPDATE cam_agent_memories SET status=$1,reviewed_by=$2,reviewed_at=now(),version=version+1 WHERE id=$3 AND version=$4 AND ((status='pending' AND $1 IN ('approved','rejected')) OR (status='approved' AND $1='retired')) RETURNING id`,[input.status,input.actor,z.uuid().parse(input.id),z.number().int().positive().parse(input.version)]);
 if(!row.rowCount)throw Error('This memory changed. Refresh before reviewing it.');
}
