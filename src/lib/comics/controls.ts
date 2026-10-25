import {cp,readFile,stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {realpath} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {sandbox} from '../motion/sandbox';
import {hash,type ComicState} from './model';
import {comicDirectory} from './store';
const exec=promisify(execFile);
export const python=()=>path.resolve(process.env.CAM_MOTION_PYTHON??'.venv-motion-runtime/bin/python');
/** The interpreter handed to the sandbox is the real path: Python looks for pyvenv.cfg next to the path it was started with, and the seatbelt matches real paths (a git worktree links `.venv-motion-runtime`). */
export const pythonRuntime=()=>realpath(python());
/** Sandbox options shared by the comic build and the deterministic controls: the local Python runtime
 * and ffmpeg/ffprobe are readable, nothing else. The runtime is resolved through symlinks (a git
 * worktree links `.venv-motion-runtime`; the seatbelt matches real paths). */
export async function comicSandboxOptions(){
 const bin=await realpath(process.env.CAM_MOTION_FFMPEG??path.join(os.homedir(),'.local/bin/ffmpeg'));
 const probe=await realpath(process.env.CAM_MOTION_FFPROBE??path.join(os.homedir(),'.local/bin/ffprobe'));
 const runtime=path.dirname(path.dirname(await realpath(python())));
 return {subprocesses:true,read:[runtime,path.dirname(path.dirname(python())),path.dirname(bin),path.dirname(probe),'/usr/local/bin'],env:{PATH:`${path.dirname(bin)}:${path.dirname(probe)}:/usr/local/bin:/usr/bin:/bin`}};
}
/** Deterministic still check (Shimi, 2026-10-25), run in the sandbox like the flash check:
 * letterbox/pillarbox bars and a large uniform empty block. Returns the issues; never decides art. */
export async function frameCheck(s:ComicState,file:string):Promise<{issues:string[]}>{
 const dir=comicDirectory(s.id),script=path.join(dir,'frame-check.py'),source='comics/runtime/frame-check.py';
 if(!(await stat(script).catch(()=>null))||(await readFile(script,'utf8'))!==(await readFile(source,'utf8')))await cp(source,script);
 const result=await sandbox(dir,await pythonRuntime(),['frame-check.py',file],await comicSandboxOptions());
 const parsed=JSON.parse(result.stdout) as {issues:string[]};return {issues:parsed.issues};
}
/** Motion energy of a clip: mean absolute difference between consecutive frames (12 fps,
 * 108x192 grey, 0 to 255), measured with ffmpeg. Calibrated on the seven clips of film 2399f947
 * (2026-10-25): 4.03, 7.05, 0.81, 6.36, 11.44, 5.42, 6.88; the clip at 0.81 (panel 3, bars rising
 * imperceptibly over eight seconds) is the frozen one. The Gazalighting reference clips measure
 * 2.69, 1.18, 9.32, 2.44, 6.37, 0.34, 3.12, 1.51, 8.43, where 0.34 and 1.18 are stills Shimi kept
 * on purpose and 1.51 a clip frozen on its last clean frame. Below 2 a clip is frozen and goes to
 * the local camera path. Never lower this to make a reference pass. */
// Calibration of 2026-10-25 evening: the Gazalighting reference film (validated by Shimi) has live clips at 1.18 and 1.51; the frozen clips measured 0.81 (2399f947 panel 3), 0.34, 0.14 and 0.26. Threshold 1.
export const FROZEN_CLIP_ENERGY=1;
export async function clipMotion(s:ComicState,file:string):Promise<number>{
 const r=await exec('ffmpeg',['-v','error','-i',path.join(comicDirectory(s.id),file),'-vf','fps=12,scale=108:192,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-','-f','null','-'],{maxBuffer:16*1024*1024});
 const values=[...r.stdout.matchAll(/YAVG=([\d.]+)/g)].map(m=>Number(m[1])).filter(Number.isFinite);
 if(!values.length)throw Error('Motion energy could not be measured.');
 return values.reduce((a,b)=>a+b,0)/values.length;
}
/** A still looped into a 1080x1920 clip (the flash fallback since 2026-10-19, the local camera path since 2026-10-25). */
export async function stillClip(still:string,out:string,seconds:number){
 await exec('ffmpeg',['-y','-loglevel','error','-loop','1','-i',still,'-t',String(seconds),'-vf','scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920','-r','30','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',out]);
}
/** The free clip of a local panel: the approved still, looped over the phrase plus a margin for the
 * transitions; the build applies the director's camera move. Idempotent by still and duration. */
export async function localClip(s:ComicState,panelId:number){
 const still=s.images[panelId];if(!still)throw Error(`Panel ${panelId} has no approved still for its local clip.`);
 const t=s.timing?.phrases.find(p=>p.phrase===panelId);const seconds=Math.min(30,Math.max(3,Math.ceil((t?t.end-t.start:4)+2)));
 const dir=comicDirectory(s.id),file=`local-${panelId}-${hash({still,seconds}).slice(0,16)}.mp4`;
 if(!(await stat(path.join(dir,file)).catch(()=>null)))await stillClip(path.join(dir,still),path.join(dir,file),seconds);
 return file;
}
