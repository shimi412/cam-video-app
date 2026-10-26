import {withAccess} from '@/lib/access';
import {pool} from '@/db';
import {listMissions,deliverMission,markInProduction,fulfilmentSettings} from '@/lib/studio/missions';
import {applyStudioDelivery,quoteStudioRevision} from '@/lib/comics/service';
export const runtime='nodejs';
/** Option C (2026-10-26): with the missions, the state of each film as the admin needs it to price the next
 * version: its phase, whether the client is waiting for a studio quote, and the client's locked notes in full. */
async function filmStates(jobIds:string[]){
 if(!jobIds.length)return {};
 const rows=(await pool.query("SELECT job_id,state FROM comics_runs WHERE job_id=ANY($1::uuid[])",[jobIds])).rows as {job_id:string;state:{phase?:string;filmVersion?:number;pendingStudioQuote?:boolean;studioDelayMinutes?:number;quote?:{kind:string;additionalUsd:number};notes?:{text:string;targets:number[];status:string}[]}}[];
 return Object.fromEntries(rows.map(r=>[r.job_id,{phase:r.state.phase??'',version:r.state.filmVersion??0,pendingStudioQuote:!!r.state.pendingStudioQuote,quotedUsd:r.state.quote?.kind==='revision'?r.state.quote.additionalUsd:null,delayMinutes:r.state.studioDelayMinutes??null,lockedNotes:(r.state.notes??[]).filter(n=>n.status==='locked').map(n=>({text:n.text,targets:n.targets}))}]));
}
export const GET=withAccess(async()=>{const missions=await listMissions();return Response.json({missions,films:await filmStates([...new Set(missions.map(m=>m.jobId))]),fulfilment:await fulfilmentSettings()});},'admin');
export const POST=withAccess(async(request:Request)=>{
 try{
  const form=await request.formData();const id=String(form.get('id')??''),action=String(form.get('action')??'deliver');
  if(!/^[0-9a-f-]{36}$/.test(id))return Response.json({error:'Unknown mission.'},{status:400});
  if(action==='start'){return Response.json({mission:await markInProduction(id)});}
  // Option C: `id` is the film (job) id; the client then sees the revision card with this price and delay.
  if(action==='quote'){return Response.json({film:await quoteStudioRevision(id,{priceUsd:Number(form.get('priceUsd')),delayMinutes:Number(form.get('delayMinutes'))})});}
  const file=form.get('film');if(!(file instanceof File))return Response.json({error:'Attach the MP4 film.'},{status:400});
  const mission=await deliverMission(id,{bytes:new Uint8Array(await file.arrayBuffer()),contentType:file.type||'video/mp4'},String(form.get('notes')??''));
  // The client's film moves to "version ready" (every studio category goes through the comics flow since option C, 2026-10-26).
  await applyStudioDelivery(mission.id);
  return Response.json({mission});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Delivery failed.'},{status:409});}
},'admin');
