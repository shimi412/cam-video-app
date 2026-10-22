import {cp,mkdir,readFile,writeFile,realpath,lstat,readdir,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {readdirSync,existsSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {sandbox,pythonBuild} from './sandbox';
import {protectedHtml} from './html-policy';
import {assertChecks,digest,validateFilm,type MotionFilm,type MotionTiming,type Checks} from './model';
const exec=promisify(execFile);
const root=process.cwd();
export type BuildAudit={holds:number;offsets:number[];scenes:{id:string;start:number;end:number|null;background:string}[];duration:number;logoAt:number;events?:{scene:string;t0:number;t1:number;label:string}[];holdViolations?:{scene:string;next:string;transition:number;label:string;t0:number;t1:number}[]};
const python=()=>path.resolve(process.env.CAM_MOTION_PYTHON??'.venv-motion-runtime/bin/python');
const chrome=()=>{if(process.env.CAM_MOTION_CHROME)return process.env.CAM_MOTION_CHROME;const base=path.join(os.homedir(),'.cache/hyperframes/chrome/chrome-headless-shell');const found=readdirSync(base).sort().reverse().map(v=>path.join(base,v,'chrome-headless-shell-mac-arm64/chrome-headless-shell')).find(existsSync);if(!found)throw Error('Install a local headless browser for motion rendering.');return found;};
async function noLinks(dir:string){for(const name of await readdir(dir)){const file=path.join(dir,name),s=await lstat(file);if(s.isSymbolicLink())throw Error('Generated file links are forbidden.');if(s.isDirectory())await noLinks(file);}}
export async function compileMotion(dir:string,film:MotionFilm,timing:MotionTiming,voice:string,previous?:MotionFilm,targets:string[]=[],options:{compositionOnly?:boolean}={}){
 const reference=await readFile(path.join(root,'motion/template/build.py'),'utf8');validateFilm(film,reference,timing,previous,targets);
 await mkdir(dir,{recursive:true});await cp(path.join(root,'motion/template/assets'),path.join(dir,'assets'),{recursive:true});
 for(const name of ['audit-build.py','browser-audit.mjs','optional-helpers.py'])await cp(path.join(root,'motion/runtime',name),path.join(dir,name));
 await cp(path.join(root,'motion/template/compose-audio.py'),path.join(dir,'compose-audio.py'));
 await cp(voice,path.join(dir,'assets/voix.wav'));
 await writeFile(path.join(dir,'reference.py'),reference);
 await writeFile(path.join(dir,'timing.json'),JSON.stringify(timing));await writeFile(path.join(dir,'film.json'),JSON.stringify(film));await writeFile(path.join(dir,'build.py'),film.source);
 let log;try{log=await pythonBuild(dir);}catch(error){const e=error as Error&{stderr?:string};throw Error(`Composition build failed: ${(e.stderr??e.message).slice(-4000)}`);}await writeFile(path.join(dir,'build.log'),log.stdout+log.stderr);
 await noLinks(dir);
 const html=await readFile(path.join(dir,'index.html'),'utf8');await writeFile(path.join(dir,'render.html'),protectedHtml(html));
 const audit:BuildAudit=JSON.parse(await readFile(path.join(dir,'build-audit.json'),'utf8'));
 // Name every failing condition: the writer only sees this text, never the audit.
 const failures:string[]=[];
 if(audit.holds!==0){
  const detail=(audit.holdViolations??[]).slice(0,8).map(v=>{const deadline=v.transition-.6,shift=v.t1-deadline;return `event "${v.label}" of ${v.scene} runs ${v.t0.toFixed(2)}-${v.t1.toFixed(2)} s but the ${v.scene}->${v.next} transition is at ${v.transition.toFixed(2)} s, so it must end by ${deadline.toFixed(2)} s: start it ${shift.toFixed(2)} s earlier (and shorten it if its start would collide with the previous event), or make it the transition gesture by starting it exactly at ${v.transition.toFixed(2)} s`;}).join('; ');
  failures.push(`${audit.holds} transition hold violations: ${detail||'see the TENUE lines'}. Rule: nothing may start or move in the 0.6 s before a transition, except the gesture the transition itself follows (a fall the camera pans with), registered as M(js, T, T + d, label) starting exactly at the transition time T. Moving the transition later is only possible when the next phrase's visual still lands within 0.3 s of its voice attack; prefer moving the event earlier. Apply exactly these numeric changes in one patch and change nothing else`);
 }
 if(audit.offsets.length!==timing.phrases.length)failures.push(`${audit.offsets.length} visual arrival times for ${timing.phrases.length} phrases`);
 const late=audit.offsets.map((n,i)=>({phrase:timing.phrases[i]?.phrase??i+1,offset:n})).filter(o=>!Number.isFinite(o.offset)||Math.abs(o.offset)>=.3);
 if(late.length){
  const boundaryAt=film.source.indexOf('# ------------------------------------------------------------ sous-titres');
  const entries=visEntries(film.source.slice(Math.max(0,boundaryAt)).split('\n').find(l=>/^VIS = \{/.test(l))??'');
  failures.push(`voice offsets out of tolerance: ${late.map(o=>{const attack=timing.phrases.find(x=>x.phrase===o.phrase)?.start??0;const arrival=Number.isFinite(o.offset)?attack+o.offset:NaN;return `phrase ${o.phrase} lands at ${Number.isFinite(arrival)?arrival.toFixed(2):'?'} s (attack ${attack.toFixed(2)} s, allowed ${(attack-.29).toFixed(2)}-${(attack+.29).toFixed(2)} s, VIS ${o.phrase} = ${entries.get(o.phrase)??'?'})`;}).join('; ')}. A phrase's arrival is exactly the value of its VIS entry on the data line after the subtitle boundary: change that expression, or the scene variables it uses, so the first visual lands with the phrase's first word`);
 }
 if(!Number.isFinite(audit.duration)||audit.duration>180)failures.push(`invalid duration ${audit.duration}`);
 else if(audit.duration<=timing.duration)failures.push(`DUR ${audit.duration} must exceed the recording length ${timing.duration}`);
 // An event without duration hides motion from the hold check and from the review.
 const instant=(audit.events??[]).filter(e=>!(e.t1>e.t0));
 if(instant.length)failures.push(`registered events without duration: ${instant.slice(0,6).map(e=>`${e.scene} "${e.label}" at ${e.t0.toFixed(2)} s`).join(', ')}${instant.length>6?` and ${instant.length-6} more`:''}; every ev()/M/L call must declare the real end time of its movement (t1 > t0), so the 0.6 s hold before a transition is measured honestly and the review can sample the movement`);
 if(!Number.isFinite(audit.logoAt))failures.push('LOGO_NET is not a number');
 else if(audit.logoAt+2.2>audit.duration+.01)failures.push(`DUR ${audit.duration} is too short: the logo lettering settles at ${audit.logoAt.toFixed(2)} s and needs 2.2 s more, so DUR must be at least ${(audit.logoAt+2.2).toFixed(2)} (request it as duration)`);
 if(failures.length)throw Error(`Quality checks need correction: ${failures.join('; ')}. Full offsets ${JSON.stringify(audit.offsets.map(n=>Number(n.toFixed(2))))}. ${log.stdout.slice(-3500)}`);
 // Restore immutable runtime/assets after untrusted Python, before rendering.
 await cp(path.join(root,'motion/template/assets'),path.join(dir,'assets'),{recursive:true,force:true});await cp(voice,path.join(dir,'assets/voix.wav'));
 await cp(path.join(root,'motion/template/compose-audio.py'),path.join(dir,'compose-audio.py'));
 await cp(path.join(root,'motion/runtime/browser-audit.mjs'),path.join(dir,'browser-audit.mjs'));
 await writeFile(path.join(dir,'film.json'),JSON.stringify(film));
 if(!options.compositionOnly)await sandbox(dir,python(),['compose-audio.py'],{read:[path.dirname(path.dirname(python()))]});
 return {audit,htmlSha256:digest(html)};
}
export async function inspectMotion(dir:string){
 const modules=path.join(root,'node_modules');
 await sandbox(dir,process.execPath,[path.join(dir,'browser-audit.mjs'),path.join(modules,'puppeteer-core/lib/puppeteer/puppeteer-core.js'),chrome()],{subprocesses:true,read:[modules,path.dirname(path.dirname(chrome())), '/Library/Fonts','/Library/Preferences'],timeout:180000});
 return JSON.parse(await readFile(path.join(dir,'browser-audit.json'),'utf8')) as Pick<Checks,'safeZoneViolations'|'removedWordViolations'|'logo'>;
}
async function peak(file:string,volume:number){const r=await exec('ffmpeg',['-hide_banner','-i',file,'-af',`volume=${volume},volumedetect`,'-f','null','-'],{maxBuffer:1024*1024});const n=r.stderr.match(/max_volume: ([-\d.]+) dB/);if(!n)throw Error('Sound measurement failed.');return Number(n[1]);}
export async function motionSound(dir:string,music:"normal"|"quiet"|"off"="normal"){
 const voice=await peak(path.join(dir,'assets/voix.wav'),1),sfx=await peak(path.join(dir,'assets/bruitages.wav'),.35);
 const mix=path.join(dir,'mix.wav');
 await exec('ffmpeg',['-y','-loglevel','error',...['voix','musique','bruitages'].flatMap(n=>['-i',path.join(dir,`assets/${n}.wav`)]),'-filter_complex',`[1:a]volume=${music==='off'?0:music==='quiet'?.2:.45}[m];[2:a]volume=0.35[s];[0:a][m][s]amix=inputs=3:normalize=0,loudnorm=I=-17:TP=-1.5:LRA=11[a]`,'-map','[a]','-ar','48000',mix]);
 const r=await exec('ffmpeg',['-hide_banner','-i',mix,'-af','ebur128','-f','null','-'],{maxBuffer:1024*1024});const matches=[...r.stderr.matchAll(/I:\s*(-?[\d.]+) LUFS/g)];
 return {sfxBelowVoiceDb:voice-sfx,mixLufs:Number(matches.at(-1)?.[1])};
}
/** Top-level entries of the VIS data line, `{1: ws(0), 2: max(a, b), ...}`. */
export function visEntries(line:string){
 const map=new Map<number,string>();const body=line.slice(line.indexOf('{')+1,line.lastIndexOf('}'));
 let depth=0,current='';const parts:string[]=[];
 for(const ch of body){if(ch==='('||ch==='[')depth++;if(ch===')'||ch===']')depth--;if(ch===','&&depth===0){parts.push(current);current='';}else current+=ch;}
 if(current.trim())parts.push(current);
 for(const part of parts){const m=part.replace(/\n/g,' ').match(/^\s*(\d+)\s*:\s*(.+)$/);if(m)map.set(Number(m[1]),m[2].trim());}
 return map;
}
/** Compare encoded frames with the independently inspected composition. This
 * catches missing fonts/assets in the bundler, not just a successful encode. */
export async function verifyRenderedMotion(dir:string){
 const samples:{time:number;file:string}[]=JSON.parse(await readFile(path.join(dir,'render-samples.json'),'utf8'));
 if(!samples.length)throw Error('Quality checks need correction: missing render comparisons.');
 const results=[];
 for(const sample of samples){
  const r=await exec('ffmpeg',['-hide_banner','-ss',String(sample.time),'-i',path.join(dir,'silent.mp4'),'-i',path.join(dir,sample.file),'-filter_complex','[0:v]scale=540:960,format=yuv420p,setpts=PTS-STARTPTS[a];[1:v]scale=540:960,format=yuv420p,setpts=PTS-STARTPTS[b];[a][b]ssim','-frames:v','1','-f','null','-'],{maxBuffer:1024*1024});
  const similarity=Number(r.stderr.match(/All:([\d.]+)/)?.[1]);results.push({...sample,similarity});
 }
 await writeFile(path.join(dir,'render-comparison.json'),JSON.stringify(results,null,2));
 if(results.some(r=>!Number.isFinite(r.similarity)||r.similarity<.96))throw Error('Quality checks need correction: encoded video differs from the inspected composition.');
 return results;
}
let queue:Promise<unknown>=Promise.resolve();
export function renderMotion(dir:string,quality:"draft"|"delivery"="draft"){const next=queue.then(async()=>{
 const cli=path.join(root,'node_modules/hyperframes/dist/cli.js');
 const ffmpeg=await realpath(process.env.CAM_MOTION_FFMPEG??path.join(os.homedir(),'.local/bin/ffmpeg'));
 const ffprobe=await realpath(process.env.CAM_MOTION_FFPROBE??path.join(os.homedir(),'.local/bin/ffprobe'));
 const result=await sandbox(dir,process.execPath,[cli,'render',dir,'--composition','render.html','--quality',quality,'--fps','30','--workers','2','--output',path.join(dir,'silent.mp4')],{subprocesses:true,read:[path.join(root,'node_modules'),path.dirname(path.dirname(chrome())),path.dirname(ffmpeg),path.dirname(ffprobe),'/Library/Fonts','/Library/Preferences'],network:true,timeout:30*60*1000,env:{HYPERFRAMES_BROWSER_PATH:chrome(),PRODUCER_HEADLESS_SHELL_PATH:chrome(),HYPERFRAMES_FFMPEG_PATH:ffmpeg,HYPERFRAMES_FFPROBE_PATH:ffprobe,PATH:`${path.dirname(ffmpeg)}:${path.dirname(ffprobe)}:/usr/bin:/bin:/usr/sbin:/sbin`}});
 await writeFile(path.join(dir,'render.log'),result.stdout+result.stderr);
 await verifyRenderedMotion(dir);
 await exec('ffmpeg',['-y','-loglevel','error','-i',path.join(dir,'silent.mp4'),'-i',path.join(dir,'mix.wav'),'-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-shortest','-movflags','+faststart',path.join(dir,'final.mp4')]);
 await exec('ffmpeg',['-y','-loglevel','error','-i',path.join(dir,'final.mp4'),'-vf','scale=540:960','-c:v','libx264','-preset','fast','-crf','24','-c:a','copy','-movflags','+faststart',path.join(dir,'preview.mp4')]);
 });queue=next.catch(()=>{});return next;}
export async function buildMotion(input:{dir:string;film:MotionFilm;timing:MotionTiming;voice:string;previous?:MotionFilm;targets?:string[];progress?:(text:string)=>Promise<void>}){
 await input.progress?.('Composing your film');const compiled=await compileMotion(input.dir,input.film,input.timing,input.voice,input.previous,input.targets);
 await input.progress?.('Checking timing, readability and sound');
 const browser=await inspectMotion(input.dir),sound=await motionSound(input.dir);
 const checks:Checks={holds:compiled.audit.holds,offsets:compiled.audit.offsets,...browser,...sound};
 await writeFile(path.join(input.dir,'checks.json'),JSON.stringify(checks,null,2));assertChecks(checks);
 await input.progress?.('Rendering your complete preview');await renderMotion(input.dir);
 for(const scene of input.film.scenes){const row=compiled.audit.scenes.find(s=>s.id===scene.id)!;await exec('ffmpeg',['-y','-loglevel','error','-ss',String(row.start),'-i',path.join(input.dir,'preview.mp4'),'-t',String((row.end??compiled.audit.duration)-row.start),'-c:v','libx264','-preset','fast','-c:a','aac','-movflags','+faststart',path.join(input.dir,`${scene.id}.mp4`)]);await exec('ffmpeg',['-y','-loglevel','error','-ss',String(Math.min(1,((row.end??compiled.audit.duration)-row.start)/2)),'-i',path.join(input.dir,`${scene.id}.mp4`),'-frames:v','1','-q:v','3',path.join(input.dir,`${scene.id}.jpg`)]);}
 return {...compiled,checks};
}

/** Read-only local readiness check, before reserving credits or calling a writer. */
export async function motionPreflight(){
 if(process.platform!=='darwin')throw Error('Motion rendering requires an isolated worker on this server.');
 await access('/usr/bin/sandbox-exec');await access(python());await access(chrome());
 await exec(python(),['-c','import numpy, fontTools']);
 await exec('ffmpeg',['-version']);await exec('ffprobe',['-version']);
 await access(path.join(root,'node_modules/hyperframes/dist/cli.js'));
 await access(process.env.CAM_MOTION_WHISPER_MODEL??path.join(os.homedir(),'.cache/hyperframes/whisper/models/ggml-medium.bin'));
 await exec('whisper-cli',['--help'],{timeout:10000});
}
