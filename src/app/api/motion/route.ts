import {RecoveryStepError} from '@/lib/agent/recovery-step';
import {assertCamConfigured} from '@/lib/providers/live-policy';
import {actorFor,withAccess} from '@/lib/access';
import {smallJson} from '@/lib/http';
import {startMotion,ClientMessage} from '@/lib/motion/service';
import {motionFirstVersionOffer} from '@/lib/motion/pricing';
export const runtime='nodejs';
/** The first-version offer shown on the creation screen: estimated delay and price, no paid call. */
export const GET=withAccess(async()=>{
 try{return Response.json(await motionFirstVersionOffer(),{headers:{'Cache-Control':'no-store'}});}
 catch(error){return Response.json({error:error instanceof ClientMessage?error.message:'The film price is unavailable right now. Please try again later.'},{status:409});}
});
export const POST=withAccess(async(request:Request)=>{
 const actor=(await actorFor(request))!;
 try{assertCamConfigured();const id=await startMotion(actor.id,await smallJson(request));return Response.json({id});}
 catch(error){const message=error instanceof Error?error.message:'';return Response.json({error:message.startsWith('Not enough')||error instanceof RecoveryStepError||error instanceof ClientMessage?message:'We could not start this film. Your script is unchanged. No automatic retry was made.'},{status:409});}
});
