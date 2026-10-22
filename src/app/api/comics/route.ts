import {withAccess,actorFor} from '@/lib/access';
import {smallJson} from '@/lib/http';
import {assertCamConfigured} from '@/lib/providers/live-policy';
import {motionPreflight} from '@/lib/motion/worker';
import {prepareComic} from '@/lib/comics/service';
import {ComicStop} from '@/lib/comics/errors';
export const runtime='nodejs';
export const POST=withAccess(async(request:Request)=>{try{assertCamConfigured();await motionPreflight();const view=await prepareComic((await actorFor(request))!.id,await smallJson(request));return Response.json(view);}catch(e){return Response.json({error:e instanceof ComicStop?e.clientMessage:'Preparation could not be priced. Your script is preserved. No image or video was generated.'},{status:409});}});
