/** Studio executor helper (2026-10-26): deliver the film of a studio mission to the client and
 * notify Telegram. The mission id is the uuid of the work folder `storage/comics/<uuid>/`.
 *
 *   npx tsx --env-file=.env scripts/studio-deliver.ts <missionId> [file.mp4] [notes.md]
 *
 * Defaults: the newest final.mp4 among the render folders, and notes.md beside it. */
import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {deliverMission,notifyStudio} from '../src/lib/studio/missions';
import {pool} from '../src/db';
const [id,fileArg,notesArg]=process.argv.slice(2);
if(!id){console.error('usage: studio-deliver.ts <missionId> [file.mp4] [notes.md]');process.exit(2);}
const dir=path.resolve('storage/comics',id);
let file=fileArg?path.resolve(fileArg):'';
if(!file){
 const renders=(await readdir(dir)).filter(n=>n.startsWith('render-'));
 const candidates=await Promise.all(renders.map(async n=>({file:path.join(dir,n,'final.mp4'),time:await stat(path.join(dir,n,'final.mp4')).then(s=>s.mtimeMs).catch(()=>0)})));
 file=candidates.filter(c=>c.time).sort((a,b)=>b.time-a.time)[0]?.file??'';
 if(!file)throw Error('No render-*/final.mp4 in the work folder.');
}
const notes=await readFile(notesArg?path.resolve(notesArg):path.join(dir,'notes.md'),'utf8').catch(()=>'');
const bytes=new Uint8Array(await readFile(file));
const mission=await deliverMission(id,{bytes,contentType:'video/mp4'},notes);
let applied='not wired';
try{const svc=await import('../src/lib/comics/service') as Record<string,unknown>;const apply=svc.applyStudioDelivery as ((missionId:string)=>Promise<unknown>)|undefined;if(apply){await apply(id);applied='applied';}}catch(e){applied=`failed: ${e instanceof Error?e.message:String(e)}`;}
await notifyStudio({...mission,script:`Livré : ${path.basename(file)} (${(bytes.length/1e6).toFixed(1)} MB). Notes : ${notes.slice(0,300)||'aucune'}`,feedback:[]}).catch(()=>{});
console.log(JSON.stringify({mission:mission.id,version:mission.version,state:mission.state,media:mission.mediaPath??null,clientState:applied}));
await pool.end();
