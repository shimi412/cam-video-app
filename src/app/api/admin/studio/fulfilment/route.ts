import {z} from 'zod';
import {withAccess} from '@/lib/access';
import {smallJson} from '@/lib/http';
import {fulfilmentSettings,setFulfilmentMode} from '@/lib/studio/missions';
export const runtime='nodejs';
/** Admin switch of the fulfilment mode per category (Shimi, 2026-10-26): `engine` (the in-app
 * engine) or `studio` (a mission for the local executor). Applies to films created afterwards. */
const Body=z.object({category:z.enum(['clay','motion','comics']),mode:z.enum(['engine','studio'])}).strict();
export const GET=withAccess(async()=>Response.json({fulfilment:await fulfilmentSettings()}),'admin');
export const POST=withAccess(async(request:Request)=>{
 const parsed=Body.safeParse(await smallJson(request));
 if(!parsed.success)return Response.json({error:'Choose a category and a mode (engine or studio).'},{status:400});
 return Response.json({fulfilment:await setFulfilmentMode(parsed.data.category,parsed.data.mode)});
},'admin');
