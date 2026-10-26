/** Studio executor helper (2026-10-26): assemble an Attack film from a work folder with the same
 * montage, sound mix and checks as the engine (HyperFrames board, captions, music, logo, flash and
 * loudness checks). Zero paid call.
 *
 *   npx tsx --env-file=.env scripts/studio-build.ts <uuid>
 *
 * The folder is `storage/comics/<uuid>/` and must hold: `plan.json` ({"panels":[…]} with, per panel,
 * `motion` local|generated and `cameraMove`), `timing.json` (from studio-align.ts), `voice/voix.wav`,
 * and for every panel either `clips/case-N.mp4` (generated) or `images/case-N.png` (local camera).
 * Optional `settings.json` ({"music":"normal"|"quiet"|"off","captions":true}).
 * Prints the media path (`render-…/final.mp4`) and the checks. */
import {access,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {buildComic} from '../src/lib/comics/render';
import {Plan,type ComicState} from '../src/lib/comics/model';
import {localClip} from '../src/lib/comics/controls';
const [id]=process.argv.slice(2);
if(!id){console.error('usage: studio-build.ts <uuid>');process.exit(2);}
const dir=path.resolve('storage/comics',id);
const plan=Plan.parse(JSON.parse(await readFile(path.join(dir,'plan.json'),'utf8')));
const timing=JSON.parse(await readFile(path.join(dir,'timing.json'),'utf8'));
const settings=await readFile(path.join(dir,'settings.json'),'utf8').then(t=>JSON.parse(t)).catch(()=>({music:'normal',captions:true}));
const clips:Record<string,string>={},images:Record<string,string>={},localClips:Record<string,true>={};
const state={version:1,id,title:'studio',script:plan.panels.map(p=>p.narration).join(' '),phase:'working',revision:0,queued:false,progress:'',plan,approvedQuotes:[],operations:{},notes:[],votes:{},approved:{},timing,voice:await access(path.join(dir,'voice/voix-aligned.wav')).then(()=>'voice/voix-aligned.wav').catch(()=>'voice/voix.wav'),images,clips,settings,targets:[],localClips} as unknown as ComicState;
for(const p of plan.panels){
 const clip=`clips/case-${p.id}.mp4`,image=`images/case-${p.id}.png`;
 const hasClip=await access(path.join(dir,clip)).then(()=>true).catch(()=>false),hasImage=await access(path.join(dir,image)).then(()=>true).catch(()=>false);
 if(hasImage)images[p.id]=image;
 if(p.motion==='generated'&&hasClip)clips[p.id]=clip;
 else{
  if(!hasImage)throw Error(`Panel ${p.id}: no clip and no image.`);
  await mkdir(path.join(dir,'clips'),{recursive:true});
  clips[p.id]=await localClip(state,p.id);localClips[p.id]=true;
 }
}
const result=await buildComic(state);
await writeFile(path.join(dir,'build-result.json'),JSON.stringify(result,null,1));
console.log(JSON.stringify({media:result.media,checks:result.checks,fallbacks:result.fallbacks}));
