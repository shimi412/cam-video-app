import {readFile,cp,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {validatePlan,type ComicState,type CameraMove} from '../../src/lib/comics/model';
import type {MotionTiming} from '../../src/lib/motion/model';
const exec=promisify(execFile);
/** A complete clip prompt in the shape of comics/skills/attack-prompting.md (200 to 900 characters, what stays, what moves, Avoid line). */
export const fixtureClipPrompt=(moves:string,beat:string)=>`1 continuous shot, 5 seconds, no cuts, real-time. Flat 2D cel animation in the exact style of the start image, no gradients, no 3D. NO ON-SCREEN TEXT: no text, no title, no caption, no lettering. REFERENCE: the start image is the exact scene and first frame; everything stays exactly as drawn except ${moves}. No hand, figure, object or symbol enters the frame. CAMERA: locked off, no camera movement, no zoom. 0.0-3.5s: ${beat}. 3.5-5.0s: everything holds. LOCKS: only ${moves} move, the rest identical throughout; nothing floats. Avoid: jitter, warping, added figures, hands, new objects, symbols, text, lettering, gradients, camera movement, cuts.`;
type Motion=['local',CameraMove['kind'],CameraMove['amount']]|['generated',string,string];
export async function comicsFixture(){
 const phrases:string[]=JSON.parse(await readFile('comics/template/voice/script.json','utf8'));
 // Shimi 2026-10-25: a camera-only idea is local (free, applied by the montage); a visible change is generated with the director's own prompt.
 const scenes:[string,string,string,string,string,Motion][]=[
  ['A tactical blueprint city, one building highlighted, all other buildings untouched.','absent','electric blue','precise military operations','Targeting lines converge on the single highlighted building.',['local','push','subtle']],
  ['Blank silhouette posters under one red streetlight, no real faces.','absent','deep red','hundreds of hostages','Paper edges stir slightly; posters remain attached.',['generated','the paper edges of the posters','the lower edges of the posters lift and settle twice in a light draught, every poster staying attached to the wall']],
  ['Cutaway school above underground tunnels and inactive rocket launchers.','absent','toxic green','civilian areas','The camera slowly descends to the underground cutaway.',['local','tilt-down','medium']],
  ['A dark shoulder and gloved hands present a rising graph, face hidden.','partial','cyan','population increase','The hand lifts the chart slightly.',['generated','the gloved hands and the chart','the gloved hands lift the chart ten centimetres toward the lens, slowly, then hold it']],
  ['Black city skyline beneath rocket trails and interception bursts.','absent','orange','thousands of rockets','The trails move through the sky.',['local','pan-left','subtle']],
  ['The same skyline below a quiet empty sky.','absent','blue','zero rocket attacks','Clouds drift slowly above the still skyline.',['generated','the two flat clouds','the two flat clouds drift slowly toward screen-right above the still skyline']],
  ['A partial gloved hand opens a gate, no visible prisoners or victims.','partial','gold','the war ended','The hand opens the gate.',['generated','the gate leaf and the gloved hand','the gloved hand pushes the gate leaf slowly open toward screen-left, hinge side fixed, light widening on the floor']],
  ['An open charter book on a desk, all pages blank for lettering added in code.','absent','red','founding charter','The book pages move slightly.',['generated','the right-hand page of the book','the right-hand page lifts at its corner, turns slowly over to the left and settles flat']],
  ['The hero seen from behind faces a wall of distorted propaganda screens.','partial','blue','Gazalighting','The screens pulse faintly; hero remains facing them.',['local','hold','subtle']]];
 const plan=validatePlan(phrases.join(' '),{panels:phrases.map((narration,i)=>{const [scene,,color,title,action,motion]=scenes[i];return {id:i+1,narration,scene,hero:'absent' /* Shimi 2026-10-22: no hero in Attack; the reference clips still show him, the plan is hero-free */,color,title,action,camera:'A slow steady push into the panel.',preserve:'Keep the original panel drawing, colours and silhouettes.',meaning:narration,
  ...(motion[0]==='local'?{motion:'local',cameraMove:{kind:motion[1],amount:motion[2]},videoPrompt:'',lockEndFrame:true}:{motion:'generated',cameraMove:{kind:'hold',amount:'subtle'},videoPrompt:fixtureClipPrompt(motion[1],motion[2]),lockEndFrame:true})};})});
 const timing=JSON.parse(await readFile('comics/reference/timing-harrison.json','utf8')) as MotionTiming;
 return {script:phrases.join(' '),plan,timing,voice:path.resolve('storage/cam-attack-gazalighting/voix/voix-harrison-respire.wav')};
}
export async function injectComicAssets(s:ComicState,dir:string){const f=await comicsFixture();await mkdir(dir,{recursive:true});s.plan=f.plan;s.timing=f.timing;await cp(f.voice,path.join(dir,'voice.wav'));s.voice='voice.wav';for(const p of f.plan.panels){const n=String(p.id).padStart(2,'0');await exec('ffmpeg',['-y','-loglevel','error','-i',`storage/cam-attack-gazalighting/montage/assets/clips/case-${n}.mp4`,'-vf','scale=270:480','-an','-c:v','libx264','-preset','fast','-crf','25',path.join(dir,`clip-${p.id}.mp4`)]);s.clips[p.id]=`clip-${p.id}.mp4`;await exec('ffmpeg',['-y','-loglevel','error','-i',`storage/cam-attack-gazalighting/montage/assets/stills/case-${n}-debut.jpg`,'-vf','scale=270:480',path.join(dir,`image-${p.id}.png`)]);s.images[p.id]=`image-${p.id}.png`;}}
