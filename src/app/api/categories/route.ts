import {withAccess} from '@/lib/access';
import {fulfilmentSettings,CATEGORIES} from '@/lib/studio/missions';
export const runtime='nodejs';
/** Where each home page card leads (option C, 2026-10-26). The response names only a path per category:
 * the client never reads how a category is fulfilled. `null` = the home page form itself. */
const ENGINE:Record<string,string|null>={clay:null,motion:'/motion/new',comics:'/comics/new'};
export const GET=withAccess(async()=>{
 const fulfilment=await fulfilmentSettings();
 return Response.json({href:Object.fromEntries(CATEGORIES.map(c=>[c,fulfilment[c]==='studio'?`/comics/new?category=${c}`:ENGINE[c]]))},{headers:{'Cache-Control':'no-store'}});
});
