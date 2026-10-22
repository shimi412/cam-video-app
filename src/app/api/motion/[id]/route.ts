import {RecoveryStepError} from '@/lib/agent/recovery-step';
import {actorFor,withAccess} from '@/lib/access';
import {smallJson} from '@/lib/http';
import {getMotion} from '@/lib/motion/store';
import {publicMotion} from '@/lib/motion/state';
import {actMotion,ClientMessage} from '@/lib/motion/service';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export const GET=withAccess(async(request:Request,context:Context)=>{try{const {id}=await context.params;return Response.json(publicMotion(id,await getMotion(id,(await actorFor(request))!.id)),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Video not found.'},{status:404});}});
export const POST=withAccess(async(request:Request,context:Context)=>{
 const {id}=await context.params,actor=(await actorFor(request))!;
 try{const view=await actMotion(id,actor.id,await smallJson(request));return Response.json(view);}
 catch(error){const message=error instanceof Error?error.message:'';const safe=/^(Watch and approve|Approve your|Review the complete|Review the current correction|The correction price|The visual review|Final review:|This film|Your film|Select a scene|This film|Not enough|A submitted request|Sound and subtitle|Separate the visual|Revisions are)/.test(message);return Response.json({error:safe||error instanceof RecoveryStepError||error instanceof ClientMessage?message:'This change could not be applied. Your work is saved; no automatic paid retry was made.'},{status:409});}
});
