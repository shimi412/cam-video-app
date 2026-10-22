import {RecoveryStepError} from '@/lib/agent/recovery-step';
import {assertCamConfigured} from '@/lib/providers/live-policy';
import {actorFor,withAccess} from '@/lib/access';
import {smallJson} from '@/lib/http';
import {startMotion} from '@/lib/motion/service';
export const runtime='nodejs';
export const POST=withAccess(async(request:Request)=>{
 const actor=(await actorFor(request))!;
 try{assertCamConfigured();const id=await startMotion(actor.id,await smallJson(request));return Response.json({id});}
 catch(error){const message=error instanceof Error?error.message:'';return Response.json({error:message.startsWith('Not enough')||error instanceof RecoveryStepError?message:'We could not start this film. Your script is unchanged. No automatic retry was made.'},{status:409});}
});
