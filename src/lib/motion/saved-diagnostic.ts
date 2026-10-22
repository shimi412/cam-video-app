import {pool} from '@/db';
import type {MotionState} from './state';
import type {AgentMessage} from '../agent/transport';

/** Read the original rejection, without invoking Claude or mutating its receipt. */
export async function savedWritingDiagnostic(id:string,s:MotionState){
 const rows=(await pool.query("SELECT state FROM cam_agent_turns WHERE session_id=$1 AND state->'loadedSkills' ? 'motion-method' ORDER BY updated_at DESC LIMIT 8",[id])).rows;
 for(const row of rows){
  const messages=row.state.messages as AgentMessage[];
  try{
   const first=messages[0]?.content;
   if(!Array.isArray(first))continue;
   const envelope=JSON.parse(first.find(p=>p.type==='text')!.text!);
   const input=JSON.parse(envelope.currentRequest);
   if(input.jobId!==id||input.revision!==s.revision)continue;
   const calls=new Map(messages.flatMap(m=>(m.tool_calls??[]).map(c=>[c.id,c.function.name] as const)));
   for(const message of [...messages].reverse()){
    if(message.role!=='tool'||calls.get(message.tool_call_id??'')!=='submit_plan')continue;
    const result=JSON.parse(String(message.content));
    if(result.accepted===false)return `Saved writer rejection: ${typeof result.error==='string'?result.error:JSON.stringify(result.error)}`;
   }
  }catch{continue;}
 }
 return null;
}
