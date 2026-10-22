import {rm,mkdir,readdir,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {Film} from './model';
import {assembleMotionRuntime} from './assembly';
import {applyCompositionAnswer} from './patch';
import {compileMotion,inspectMotion} from './worker';
import {digest,validateFilm,type MotionFilm,type MotionTiming} from './model';
const boundary='# ------------------------------------------------------------ sous-titres';
/** Names of the helpers defined by the application prelude, for the writer brief. */
export function preludeHelperNames(reference:string){
 const marker='# ============================================================ A';
 return [...reference.slice(0,reference.indexOf(marker)).matchAll(/^def ([A-Za-z_][A-Za-z0-9_]*)\(/gm)].map(m=>m[1]);
}
const strip=(message:string)=>message.replace(/\/[^\s"']*\/(motion\/runtime\/|storage\/motion\/)/g,'$1').slice(0,4000);
/** Local, free validator pass over a saved rejected source. Returns the precise
 * current diagnostic or null when the source assembles. Never executes author code. */
export async function localRepairDiagnostic(film:MotionFilm,reference:string,timing:MotionTiming,previous?:MotionFilm,targets:string[]=[]){
 try{
  // Same order as the writer: an initial answer is assembled onto the fixed
  // machinery before validation; a revision patches an already assembled film.
  if(previous)validateFilm(film,reference,timing,previous,targets);
  else validateFilm(await assembleMotionRuntime(film,reference,timing),reference,timing);
  return null;
 }catch(error){return strip(error instanceof Error?error.message:String(error));}
}
/** The one mechanical reading of a legacy answer whose data lines were wrong:
 * the VIS[k] assignments the composition itself wrote become the VIS data
 * line, and quoted cue names in MARKS become the names they quote. Nothing
 * creative is decided. Returns null when the source offers no such reading. */
export function mechanicalDataLinePatch(film:MotionFilm){
 const at=film.source.indexOf(boundary);if(at<0)return null;
 const tail=film.source.slice(at).split('\n');
 const vis=tail.find(l=>l.startsWith('VIS = ')),marks=tail.find(l=>l.startsWith('MARKS = '));
 const arrivals=[...film.source.slice(0,at).matchAll(/^VIS\[(\d+)\] = (.+)$/gm)].map(m=>`${m[1]}: ${m[2].trim()}`);
 if(!vis||!marks||!arrivals.length||!tail.filter(l=>l.startsWith('VIS = ')).length)return null;
 const ids=arrivals.map(a=>Number(a.split(':')[0]));
 if(new Set(ids).size!==film.scenes.length||film.scenes.some(s=>!ids.includes(s.phrase)))return null;
 let cues:Record<string,unknown>;
 try{cues=JSON.parse(marks.slice('MARKS = '.length).replace(/'/g,'"'));}catch{return null;}
 const value=(v:unknown)=>typeof v==='number'?String(v):typeof v==='string'&&/^[A-Za-z0-9_ .+\-*/(),]+$/.test(v)?v:null;
 const entries:string[]=[];
 const sober=Array.isArray(cues.sober)&&cues.sober.length===2?cues.sober.map(value):null;
 if(!sober||sober.some(v=>v===null))return null;
 entries.push(`'sober': [${sober.join(', ')}]`);
 for(const key of ['plot','q_final','logo_impact','strike','counter','terrible']){const v=value(cues[key]);if(v!==null)entries.push(`'${key}': ${v}`);}
 if(!entries.some(e=>e.startsWith("'logo_impact'")))return null;
 return {baseSha256:digest(film.source),edits:[{before:`${vis}\n${marks}`,after:`VIS = {${arrivals.join(', ')}}\nMARKS = {${entries.join(', ')}}`}]};
}
/** What the real build would say once the data lines carry the composition's
 * own values: timing, holds and duration diagnostics that would otherwise cost
 * the writer a second paid step. Diagnostic only; nothing is persisted. */
export async function provisionalBuildDiagnostic(film:MotionFilm,reference:string,timing:MotionTiming,voice:string,dir:string){
 const patch=mechanicalDataLinePatch(film);if(!patch)return null;
 const note='Provisional reading, not applied: with VIS rebuilt from the VIS[k] assignments inside your composition and MARKS names unquoted, ';
 try{
  const assembled=await assembleMotionRuntime(applyCompositionAnswer({patch},film),reference,timing);
  validateFilm(assembled,reference,timing);
  try{await compileMotion(dir,assembled,timing,voice,undefined,[],{compositionOnly:true});return note+'the sandbox build passes the hold, voice-offset and duration checks. Include that data-line correction in your patch.';}
  catch(error){return note+'the sandbox build reports: '+strip(error instanceof Error?error.message:String(error))+' Correct the data lines and these timing issues in the same patch.';}
  finally{await rm(dir,{recursive:true,force:true}).catch(()=>{});}
 }catch(error){return note+'assembly still reports: '+strip(error instanceof Error?error.message:String(error));}
}

/** Turn raw browser measurements into the correction the writer can act on. */
export function visualDiagnostic(visual:{safeZoneViolations:string[];removedWordViolations:string[];logo:boolean}){
 const parts:string[]=[];
 const subtitles=visual.safeZoneViolations.filter(v=>/: subtitle /.test(v)),others=visual.safeZoneViolations.filter(v=>!/: subtitle /.test(v));
 if(subtitles.length){
  const scenes=[...new Set(subtitles.map(v=>v.split(':')[0]))];
  parts.push(`Subtitles leave the safe reading area (y must stay within 262-1480) in scenes ${scenes.join(', ')}: a SUBS group that wraps to two or more lines at 46 px from top 1340 extends below 1480. Split long SUBS groups into shorter narration excerpts (about 30 characters, one line each, in narration order; the reference uses 15 short groups) and omit groups whose words the large title already shows. SUBS is the data line after the subtitle boundary; the 1340 position is fixed.`);
 }
 if(others.length)parts.push(`Text leaves the safe reading area (x 120-940, y 262-1480): ${others.slice(0,12).join('; ')}${others.length>12?` and ${others.length-12} more`:''}. Move, shrink or wrap these elements inside the area.`);
 if(visual.removedWordViolations.length)parts.push(`Declared removed words are still visible: ${visual.removedWordViolations.join('; ')}. Read the opacity timeline: if the word is still at opacity 1 after your fade, its entry animation plays later than the fade, so place the fade after the word has entered (after its landing time) and declare that later disappearance time in patch.removedWords (a field of the patch object next to edits, never source text). Declare only words that must vanish from the final sentence.`);
 if(!visual.logo)parts.push('The CAM brand ending is not visible at the end of the film.');
 return parts.join(' ');
}
/** Score a saved candidate by the same measurable checks the build applies:
 * registered hold violations, phrases outside the voice tolerance, duration.
 * Lower is better; an unassemblable candidate scores Infinity. */
export async function scoreCandidate(film:MotionFilm,reference:string,timing:MotionTiming,voice:string,dir:string){
 try{
  const assembled=await assembleMotionRuntime(film,reference,timing);validateFilm(assembled,reference,timing);
  try{await compileMotion(dir,assembled,timing,voice,undefined,[],{compositionOnly:true});}
  catch(error){
   const audit=JSON.parse(await readFile(path.join(dir,'build-audit.json'),'utf8').catch(()=>'null')) as {holds:number;offsets:number[];duration:number;logoAt:number}|null;
   if(!audit)return {score:Infinity,diagnostic:strip(error instanceof Error?error.message:String(error))};
   const late=audit.offsets.filter(n=>!Number.isFinite(n)||Math.abs(n)>=.3).length,duration=audit.logoAt+2.2>audit.duration+.01||audit.duration<=timing.duration?1:0;
   // Build failures dominate: a candidate that builds is always closer than one that does not.
   return {score:1000*(audit.holds*2+late*2+duration),diagnostic:strip(error instanceof Error?error.message:String(error))};
  }finally{await rm(dir,{recursive:true,force:true}).catch(()=>{});}
  // The build passed; the remaining distance is the browser's visual checks.
  try{
   await mkdir(dir,{recursive:true});const built=await assembleMotionRuntime(film,reference,timing);await compileMotion(dir,built,timing,voice,undefined,[],{compositionOnly:true});
   const visual=await inspectMotion(dir);const count=visual.safeZoneViolations.length+visual.removedWordViolations.length+(visual.logo?0:1);
   return {score:count,diagnostic:count?'Visual checks failed. '+visualDiagnostic(visual):null};
  }catch(error){return {score:999,diagnostic:strip(error instanceof Error?error.message:String(error))};}
  finally{await rm(dir,{recursive:true,force:true}).catch(()=>{});}
 }catch(error){return {score:Infinity,diagnostic:strip(error instanceof Error?error.message:String(error))};}
}
/** Among the writer's own saved candidates for this video, the one closest to
 * passing. The executor selects by measured checks only; it edits nothing. */
export async function bestSavedCandidate(directory:string,reference:string,timing:MotionTiming,voice:string,current:MotionFilm,options:{preferNewestBuilding?:boolean;within?:{from:number;to:number}[]}={}){
 const entries=await readdir(directory).catch(()=>[] as string[]);
 const files=[...entries.filter(n=>/^writing-candidate-[a-f0-9]{64}\.json$/.test(n)).map(n=>({file:path.join(directory,n),key:'film'})),...entries.filter(n=>/^candidate-[a-f0-9]{16}$/.test(n)).map(n=>({file:path.join(directory,n,'film.json'),key:''}))];
 const candidates:{film:MotionFilm;at:number}[]=[],seen=new Set<string>([digest(current.source)]);
 for(const {file,key} of files){
  try{const raw=JSON.parse(await readFile(file,'utf8'));const parsed=Film.safeParse(key?raw[key]:raw);if(!parsed.success||parsed.data.scenes.length!==current.scenes.length||seen.has(digest(parsed.data.source)))continue;const at=(await stat(file)).mtimeMs;if(options.within&&!options.within.some(w=>at>=w.from-1000&&at<=w.to+1000))continue;seen.add(digest(parsed.data.source));candidates.push({film:parsed.data,at});}catch{/* unreadable receipts are skipped */}
 }
 const currentScore=await scoreCandidate(current,reference,timing,voice,path.join(directory,'diagnostic-score-current'));
 const scored:{film:MotionFilm;score:number;diagnostic:string|null;at:number}[]=[];
 for(const c of candidates){const {score,diagnostic}=await scoreCandidate(c.film,reference,timing,voice,path.join(directory,`diagnostic-score-${digest(c.film.source).slice(0,12)}`));scored.push({film:c.film,score,diagnostic,at:c.at});}
 let best:(typeof scored)[number]|null=null;
 if(options.preferNewestBuilding){
  // During a creative revision, the newest candidate that still builds carries
  // the revision in progress; an older technically cleaner film would lose it.
  // Builds means the Python ran and the audit exists; hold/offset issues keep it eligible.
  for(const c of scored)if(Number.isFinite(c.score)&&c.score!==999&&(!best||c.at>best.at))best=c;
 }else for(const c of scored)if(c.score<currentScore.score&&(!best||c.score<best.score||c.score===best.score&&c.at>best.at))best=c;
 return best?{...best,currentScore:currentScore.score}:null;
}
