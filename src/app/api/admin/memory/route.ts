import {z} from 'zod';
import {pool} from '@/db';
import {actorFor,withAccess} from '@/lib/access';
import {smallJson} from '@/lib/http';
import {reviewMemory} from '@/lib/agent/store';
export const GET=withAccess(async()=>Response.json({memories:(await pool.query('SELECT id,content,reason,source_session,source_turn,status,version,created_at,reviewed_at,reviewed_by FROM cam_agent_memories ORDER BY created_at DESC LIMIT 200')).rows},{headers:{'Cache-Control':'no-store'}}),'admin');
export const POST=withAccess(async request=>{
 try{
  const input=z.object({id:z.uuid(),version:z.number().int().positive(),status:z.enum(['approved','rejected','retired'])}).strict().parse(await smallJson(request));
  const actor=await actorFor(request);if(!actor||actor.role!=='admin')return Response.json({error:'Administrator access required.'},{status:403});
  await reviewMemory({...input,actor:actor.id});return Response.json({ok:true});
 }catch{return Response.json({error:'This rule could not be updated. Refresh and review its latest version.'},{status:409});}
},'admin');
