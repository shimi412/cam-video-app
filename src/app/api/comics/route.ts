import {withAccess,actorFor} from '@/lib/access';
import {smallJson} from '@/lib/http';
import {assertCamConfigured} from '@/lib/providers/live-policy';
import {motionPreflight} from '@/lib/motion/worker';
import {prepareComic} from '@/lib/comics/service';
import {ComicStop} from '@/lib/comics/errors';
import {fulfilmentMode} from '@/lib/studio/missions';
export const runtime='nodejs';
// Studio mode (Shimi, 2026-10-26): the server produces nothing itself, so the engine configuration and the Motion worker checks only apply to engine categories.
export const POST=withAccess(async(request:Request)=>{try{const body=await smallJson(request) as {category?:unknown};const category=body?.category==='clay'||body?.category==='motion'?body.category:'comics';
 if(await fulfilmentMode(category)!=='studio'){assertCamConfigured();await motionPreflight();}
 const view=await prepareComic((await actorFor(request))!.id,body);return Response.json(view);}catch(e){return Response.json({error:e instanceof ComicStop?e.clientMessage:'Preparation could not be priced. Your script is preserved. No image or video was generated.'},{status:409});}});
