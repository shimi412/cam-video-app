import {withAccess} from '@/lib/access';
import {listMissions,deliverMission,markInProduction} from '@/lib/studio/missions';
export const runtime='nodejs';
export const GET=withAccess(async()=>Response.json({missions:await listMissions()}),'admin');
export const POST=withAccess(async(request:Request)=>{
 try{
  const form=await request.formData();const id=String(form.get('id')??''),action=String(form.get('action')??'deliver');
  if(!/^[0-9a-f-]{36}$/.test(id))return Response.json({error:'Unknown mission.'},{status:400});
  if(action==='start'){return Response.json({mission:await markInProduction(id)});}
  const file=form.get('film');if(!(file instanceof File))return Response.json({error:'Attach the MP4 film.'},{status:400});
  const mission=await deliverMission(id,{bytes:new Uint8Array(await file.arrayBuffer()),contentType:file.type||'video/mp4'},String(form.get('notes')??''));
  return Response.json({mission});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Delivery failed.'},{status:409});}
},'admin');
