import {cp,mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import {readdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {sandbox} from '../motion/sandbox';

import {comicDirectory} from './store';
import {assertChecks,panelCamera,type ComicState,type Checks} from './model';
import {pythonRuntime,comicSandboxOptions,stillClip} from './controls';
const exec=promisify(execFile);
function chrome(){const base=path.join(os.homedir(),'.cache/hyperframes/chrome/chrome-headless-shell');const file=readdirSync(base).sort().reverse().map(v=>path.join(base,v,'chrome-headless-shell-mac-arm64/chrome-headless-shell')).find(existsSync);if(!file)throw Error('Install the local renderer.');return file;}
async function peak(file:string){const r=await exec('ffmpeg',['-hide_banner','-i',file,'-af','volumedetect','-f','null','-']);const value=Number(r.stderr.match(/max_volume: ([-\d.]+) dB/)?.[1]);if(!Number.isFinite(value))throw Error('Sound measurement failed.');return value;}
/** film.json for build.py. Since 2026-10-25 it carries no narration title (captions only) and no
 * clip prompt; a panel whose clip is a local loop of its still is marked `motion: local` with its
 * camera move, which the build animates; a generated or legacy clip keeps the board camera only. */
export function filmDocument(s:ComicState){
 if(!s.plan)throw Error('Plan missing.');
 return {panels:s.plan.panels.map(p=>{const local=!!s.localClips?.[p.id];const panel:Record<string,unknown>={...p};delete panel.title;delete panel.videoPrompt;delete panel.lockEndFrame;return {...panel,motion:local?'local':'generated',cameraMove:local?panelCamera(p):{kind:'hold',amount:'subtle'}};}),captions:s.settings.captions};
}
export async function buildComic(s:ComicState){
 if(!s.plan||!s.timing||!s.voice||s.plan.panels.some(p=>!s.clips[p.id]))throw Error('The full film is not ready to assemble.');
 const root=comicDirectory(s.id),name=`render-${s.revision}-${s.settings.music}-${s.settings.captions?'captions':'clean'}`,dir=path.join(root,name);
 await mkdir(path.join(dir,'assets/clips'),{recursive:true});await mkdir(path.join(dir,'assets/stills'),{recursive:true});
 await cp('comics/template/assets',path.join(dir,'assets'),{recursive:true});
 for(const p of s.plan.panels)await cp(path.join(root,s.clips[p.id]),path.join(dir,`assets/clips/case-${String(p.id).padStart(2,'0')}.mp4`));
 await cp(path.join(root,s.voice),path.join(dir,'assets/narration.wav'));
 for(const f of ['build.py','compose-audio.py','browser-audit.mjs','flash-check.py'])await cp(`comics/runtime/${f}`,path.join(dir,f));
 await writeFile(path.join(dir,'timing.json'),JSON.stringify(s.timing));await writeFile(path.join(dir,'film.json'),JSON.stringify(filmDocument(s)));
 const opts=await comicSandboxOptions();
 const fallbacks:number[]=[];
 // A short source flash must not be hidden by the final montage. Preserve the
 // paid clip and animate the already-approved image locally; disclose this in review.
 for(const p of s.plan.panels){const clip=path.join(dir,`assets/clips/case-${String(p.id).padStart(2,'0')}.mp4`);
  if(s.localClips?.[p.id])continue;// already a loop of the approved still
  const scan=await sandbox(dir,await pythonRuntime(),['flash-check.py',clip],opts);
  if(JSON.parse(scan.stdout).candidates.length){
   const approved=s.images[p.id];if(!approved)throw Error(`Panel ${p.id} needs a reviewed still before local flash correction.`);
   const still=path.join(dir,`assets/stills/approved-${p.id}.png`);await cp(path.join(root,approved),still);
   const duration=Number((await exec('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',clip])).stdout);
   if(!Number.isFinite(duration)||duration<.8||duration>30)throw Error('Invalid source clip duration.');
   await stillClip(still,clip,duration);fallbacks.push(p.id);
  }
 }
 await writeFile(path.join(dir,'camera-fallbacks.json'),JSON.stringify(fallbacks));
 await sandbox(dir,await pythonRuntime(),['build.py'],opts);await cp(path.join(dir,'index.html'),path.join(dir,'render.html'));
 await sandbox(dir,await pythonRuntime(),['compose-audio.py'],opts);
 // node_modules is resolved through symlinks (a git worktree links it); the seatbelt matches real paths.
 const modules=await realpath('node_modules');
 await sandbox(dir,process.execPath,['browser-audit.mjs',path.join(modules,'puppeteer-core/lib/puppeteer/puppeteer-core.js'),chrome()],{subprocesses:true,read:[modules,path.dirname(path.dirname(chrome())),'/Library/Fonts','/Library/Preferences'],timeout:240000});
 const browser=JSON.parse(await readFile(path.join(dir,'browser-audit.json'),'utf8')),audit=JSON.parse(await readFile(path.join(dir,'build-audit.json'),'utf8'));
 const voice=path.join(dir,'assets/narration.wav'),sfx=path.join(dir,'assets/bruitages.wav'),voicePeak=await peak(voice),sfxPeak=await peak(sfx),sfxGain=Math.min(.3,10**((voicePeak-18-sfxPeak)/20));
 await exec('ffmpeg',['-y','-loglevel','error',...['narration','musique','bruitages'].flatMap(n=>['-i',path.join(dir,`assets/${n}.wav`)]),'-filter_complex',`[1:a]volume=${s.settings.music==='off'?0:s.settings.music==='quiet'?.15:.34}[m];[2:a]volume=${sfxGain}[s];[0:a]apad=whole_dur=${audit.duration}[v];[v][m][s]amix=inputs=3:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]`,'-map','[a]','-t',String(audit.duration),'-ar','48000',path.join(dir,'mix.wav')]);
 const measured=await exec('ffmpeg',['-hide_banner','-i',path.join(dir,'mix.wav'),'-af','ebur128','-f','null','-'],{maxBuffer:1024*1024});const lufs=Number([...measured.stderr.matchAll(/I:\s*(-?[\d.]+) LUFS/g)].at(-1)?.[1]);
 const briefItems:string[]=audit.briefItems??[];
 const checks:Checks={durations:!briefItems.length,briefItems,titleRepairs:audit.titleRepairs??[],stillFallbacks:fallbacks,safeZones:browser.safeZones,flashCandidates:[],flashNotes:[],mixLufs:lufs,sfxBelowVoiceDb:voicePeak-(sfxPeak+20*Math.log10(sfxGain)),logo:browser.logo,duration:audit.duration};
 assertChecks(checks);await encodeComic(dir);
 const flashes=await sandbox(dir,await pythonRuntime(),['flash-check.py','final.mp4'],opts);
 // Title entrances are excluded by construction; any other candidate becomes a disclosed
 // note with before/after evidence frames for the human visual approval (2026-10-21).
 checks.flashCandidates=flashCandidatesOutsideEntrances(JSON.parse(flashes.stdout).candidates,audit.titleEntrances??[]);
 await mkdir(path.join(dir,'evidence'),{recursive:true});
 for(const [i,time] of checks.flashCandidates.slice(0,12).entries()){const evidence:string[]=[];for(const [label,at] of [['before',time-1/30],['after',time+2/30]] as const){const file=`evidence/flash-${i}-${label}.jpg`;await exec('ffmpeg',['-y','-loglevel','error','-ss',String(Math.max(0,at)),'-i',path.join(dir,'final.mp4'),'-frames:v','1','-vf','scale=540:960',path.join(dir,file)]);evidence.push(`${name}/${file}`);}checks.flashNotes!.push({time,evidence});}
 await writeFile(path.join(dir,'checks.json'),JSON.stringify(checks,null,2));assertChecks(checks);
 return {media:`${name}/final.mp4`,checks,fallbacks};
}

/** A title enters with a short eased tween; a change in its first 0.4 s is that entrance, not a flash. */
export function flashCandidatesOutsideEntrances(candidates:number[],entrances:number[]){return candidates.filter(t=>!entrances.some(e=>t>=e-1/30&&t<=e+.4));}

/** Audit screenshots and encoded frames of a film made of 24 fps AI clips resampled at 30 fps
 * sit one to three frames apart (live Attack 2026-10-22: best matches at -1 and -2 frames, a slow
 * pan on a panel still at .953). The guard proves the encoded film is the inspected one: every
 * sample must reach .93 within three frames and the median of the best matches must reach .96; a
 * missing asset, a black panel or a dropped scene scores far lower on several samples. */
export function encodedFramesMatch(comparisons:{similarity:number}[]){
 if(!comparisons.length)return false;
 const sorted=comparisons.map(c=>c.similarity).sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
 return sorted[0]>=.93&&median>=.96;
}
async function encodeComic(dir:string){
 const ffmpeg=await realpath(process.env.CAM_MOTION_FFMPEG??path.join(os.homedir(),'.local/bin/ffmpeg')),ffprobe=await realpath(process.env.CAM_MOTION_FFPROBE??path.join(os.homedir(),'.local/bin/ffprobe'));
 const modules=await realpath('node_modules');
 const result=await sandbox(dir,process.execPath,[path.join(modules,'hyperframes/dist/cli.js'),'render',dir,'--composition','render.html','--quality','draft','--fps','30','--workers','2','--output',path.join(dir,'silent.mp4')],{subprocesses:true,read:[modules,path.dirname(path.dirname(chrome())),path.dirname(ffmpeg),path.dirname(ffprobe),'/Library/Fonts','/Library/Preferences'],network:true,timeout:1800000,env:{HYPERFRAMES_BROWSER_PATH:chrome(),PRODUCER_HEADLESS_SHELL_PATH:chrome(),HYPERFRAMES_FFMPEG_PATH:ffmpeg,HYPERFRAMES_FFPROBE_PATH:ffprobe,PATH:`${path.dirname(ffmpeg)}:${path.dirname(ffprobe)}:/usr/bin:/bin`}});
 await writeFile(path.join(dir,'render.log'),result.stdout+result.stderr);
 const samples:{time:number;file:string}[]=JSON.parse(await readFile(path.join(dir,'render-samples.json'),'utf8')),comparisons=[];
 if(!samples.length)throw Error('Quality checks need correction: missing encoded frame comparisons.');
 for(const sample of samples){let similarity=0,offset=0;for(const delta of [0,-1/30,1/30,-2/30,2/30,-3/30,3/30]){
  const r=await exec(ffmpeg,['-hide_banner','-ss',String(Math.max(0,sample.time+delta)),'-i',path.join(dir,'silent.mp4'),'-i',path.join(dir,sample.file),'-filter_complex','[0:v]scale=540:960,format=yuv420p,setpts=PTS-STARTPTS[a];[1:v]scale=540:960,format=yuv420p,setpts=PTS-STARTPTS[b];[a][b]ssim','-frames:v','1','-f','null','-'],{maxBuffer:1048576});
  const n=Number(r.stderr.match(/All:([\d.]+)/)?.[1]);if(n>similarity){similarity=n;offset=delta;}if(similarity>=.96)break;
 }comparisons.push({...sample,similarity,offset});}
 await writeFile(path.join(dir,'render-comparison.json'),JSON.stringify(comparisons,null,2));if(!encodedFramesMatch(comparisons))throw Error('Quality checks need correction: encoded video differs from the inspected film.');
 await exec(ffmpeg,['-y','-loglevel','error','-i',path.join(dir,'silent.mp4'),'-i',path.join(dir,'mix.wav'),'-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-shortest','-movflags','+faststart',path.join(dir,'final.mp4')]);
 await exec(ffmpeg,['-y','-loglevel','error','-i',path.join(dir,'final.mp4'),'-vf','scale=540:960','-c:v','libx264','-preset','fast','-crf','24','-c:a','copy','-movflags','+faststart',path.join(dir,'preview.mp4')]);
}
