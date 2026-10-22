import { z } from 'zod';
import { createHash } from 'node:crypto';

export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const Timing = z.object({duration:z.number().positive().max(180),words:z.array(z.object({word:z.string(),start:z.number().nonnegative(),end:z.number().nonnegative()})).min(1),phrases:z.array(z.object({phrase:z.number().int().positive(),text:z.string().min(1),start:z.number().nonnegative(),end:z.number().positive()})).min(1).max(30)});
export type MotionTiming = z.infer<typeof Timing>;
export const Scene = z.object({id:z.string().regex(/^s[A-Za-z0-9]+$/),phrase:z.number().int().positive(),movement:z.string().min(1).max(800),meaning:z.string().min(1).max(800)});
export const Film = z.object({source:z.string().min(1000).max(200000),referenceChoice:z.string().min(1).max(1000),scenes:z.array(Scene).min(1).max(30),removedWords:z.array(z.object({selector:z.string().regex(/^#[a-zA-Z0-9_-]+$/),at:z.number().nonnegative().describe('Seconds as a plain number (for example 33.07), computed from timing.words start/end values; never an expression or a string.')})).max(30)}).strict();
export type MotionFilm = z.infer<typeof Film>;
export type Receipt = {kind:'writing'|'voice';requestId:string;actualUsd:number|null;credits?:number;quotedCredits?:number;inputTokens?:number;outputTokens?:number;model:string};
export type Checks = {holds:number;offsets:number[];safeZoneViolations:string[];removedWordViolations:string[];sfxBelowVoiceDb:number;mixLufs:number;logo:boolean;};
export function assertChecks(c:Checks){
 const failures:string[]=[];
 if(c.holds!==0)failures.push('transition hold');
 if(!c.offsets.length||c.offsets.some(n=>!Number.isFinite(n)||Math.abs(n)>=.3))failures.push('voice alignment');
 if(c.safeZoneViolations.length)failures.push('safe reading area');
 if(c.removedWordViolations.length)failures.push('removed text');
 if(!Number.isFinite(c.sfxBelowVoiceDb)||c.sfxBelowVoiceDb<15)failures.push('sound level');
 if(!Number.isFinite(c.mixLufs)||Math.abs(c.mixLufs+17)>1)failures.push('mix loudness');
 if(!c.logo)failures.push('brand ending');
 if(failures.length)throw new Error(`Quality checks need correction: ${failures.join(', ')}. Your film has not been submitted for approval.`);
}
export function price(revisions:number){if(!Number.isInteger(revisions)||revisions<0||revisions>2)throw Error('The revision limit has been reached. Contact support.');return 10+5*revisions;}
export function validateTiming(t:MotionTiming,script:string){
 const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
 if(norm(t.phrases.map(p=>p.text).join(' '))!==norm(script)||norm(t.words.map(w=>w.word).join(' '))!==norm(script))throw Error('The recording does not match your complete script.');
 for(const [i,w]of t.words.entries())if(w.end<w.start||w.end>t.duration+.02||i>0&&w.start<t.words[i-1].end-.02)throw Error('Invalid word alignment.');
}
export function sceneSourceOffset(source:string,id:string){
 if(!/^s[A-Za-z0-9]+$/.test(id))return -1;
 return source.search(new RegExp(`^[ \t]*scene\\([ \t]*(["'])${id}\\1[ \t]*,`,'m'));
}
/** Protect fixed machinery and isolate per-scene changes, including all tail code. */
export function validateFilm(film:MotionFilm,reference:string,timing:MotionTiming,previous?:MotionFilm,targets:string[]=[]){
 const marker='# ============================================================ A';
 const prefix=reference.slice(0,reference.indexOf(marker));
 const normalize=(s:string)=>s.replace(/^DUR = .+$/m,'DUR = <duration>');
 if(!prefix||normalize(film.source.slice(0,film.source.indexOf(marker)))!==normalize(prefix))throw Error('The writer changed protected motion machinery.');
 if(film.scenes.length!==timing.phrases.length||new Set(film.scenes.map(s=>s.id)).size!==film.scenes.length||film.scenes.some((s,i)=>s.phrase!==timing.phrases[i].phrase))throw Error(`Each voice phrase needs exactly one distinct scene ID. Expected phrases: ${timing.phrases.map(p=>p.phrase).join(', ')}. Received: ${film.scenes.map(s=>`${s.phrase}:${s.id}`).join(', ')}. Give every phrase its own scene() block and unique ID; preserve all narration.`);
 for(const scene of film.scenes)if(sceneSourceOffset(film.source,scene.id)<0)throw Error(`Missing scene source for ${scene.id}.`);
 if(previous){
  if(!targets.length||targets.some(id=>!previous.scenes.some(s=>s.id===id)))throw Error('Choose the scenes to correct.');
  const split=(f:MotionFilm)=>{
   const positions=f.scenes.map(s=>({id:s.id,start:sceneSourceOffset(f.source,s.id)}));
   const ending=f.source.indexOf('# ------------------------------------------------------------ sous-titres');
   if(ending<0)throw Error('Missing protected subtitle boundary.');
   return [f.source.slice(0,positions[0].start),...positions.map((p,i)=>f.source.slice(p.start,positions[i+1]?.start??ending)),f.source.slice(ending)];
  };
  const a=split(previous),b=split(film);
  // The VIS and MARKS data lines are timing data of the composition: a retiming
  // revision may change them. Subtitles, machinery and the footer stay identical.
  const timingFree=(tail:string)=>tail.split('\n').filter(l=>!/^(VIS|MARKS) = /.test(l)).join('\n');
  if(a.length!==b.length||a.some((part,i)=>i===0?part!==b[i]:i===a.length-1?timingFree(part)!==timingFree(b[i]):!targets.includes(previous.scenes[i-1].id)&&part!==b[i]))throw Error('The correction changed an untargeted scene or protected code.');
  if(film.scenes.some((s,i)=>s.id!==previous.scenes[i]?.id||!targets.includes(s.id)&&(['id','phrase','movement','meaning'] as const).some(key=>s[key]!==previous.scenes[i][key])))throw Error('The correction changed an untargeted scene description.');
  // A paid correction must be visible: Version 2 identical to Version 1 (live on 2026-10-21) is a failure, not a delivery.
  if(film.source===previous.source)throw Error('The correction left the film unchanged. Apply the requested change to the selected scenes so the new version differs visibly.');
 }
}

/** The fixed renderer belongs to the application. Claude authors the scene
 * composition; copying comments/whitespace in 13 KB of machinery is not work. */
export function assembleMotionFilm(film:MotionFilm,reference:string,timing:MotionTiming):MotionFilm{
 const marker='# ============================================================ A';
 const start=film.source.indexOf(marker),fixed=reference.indexOf(marker);
 if(start<0||fixed<0)throw Error('Missing motion composition boundary.');
 const requested=Number(film.source.match(/^DUR = ([0-9]+(?:\.[0-9]+)?)$/m)?.[1]);
 const duration=Number.isFinite(requested)&&requested>timing.duration&&requested<=180?requested:Math.min(180,timing.duration+3);
 const prefix=reference.slice(0,fixed).replace(/^DUR = .+$/m,`DUR = ${duration}`);
 return {...film,source:prefix+film.source.slice(start)};
}
