/** Regression on the real rejected answer of 2026-10-20, not on the reference.
 * The composition is Claude's; only the executor's handling of its data lines
 * is under test. No provider is contacted. */
import {it,expect,vi} from 'vitest';
import {readFile,writeFile,mkdir,rm,access} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {Film,Timing,digest,validateTiming} from '../src/lib/motion/model';
import {assembleMotionRuntime} from '../src/lib/motion/assembly';
import {applyCompositionAnswer,CompositionAnswer} from '../src/lib/motion/patch';
import {localRepairDiagnostic,mechanicalDataLinePatch,provisionalBuildDiagnostic,bestSavedCandidate} from '../src/lib/motion/diagnostic';
import {compileMotion} from '../src/lib/motion/worker';
const boundary='# ------------------------------------------------------------ sous-titres';
async function fixture(){
 const raw=JSON.parse(await readFile('tests/fixtures/motion-real-candidate-57a06953.json','utf8'));
 return {id:raw.id as string,film:Film.parse(raw.film),timing:Timing.parse(raw.timing),script:raw.script as string,legacyRepairPatch:raw.legacyRepairPatch as NonNullable<CompositionAnswer['patch']>,reference:await readFile('motion/reference/plot-hole-v4-safe.py','utf8')};
}
const dataLinePatch=(film:ReturnType<typeof Film.parse>)=>{const patch=mechanicalDataLinePatch(film);if(!patch)throw Error('No mechanical reading');return patch;};
it('names the real defect of the saved answer and explains where the timing data belongs',async()=>{
 const {film,timing,reference,script}=await fixture();
 expect(()=>validateTiming(timing,script)).not.toThrow();
 expect(film.scenes).toHaveLength(timing.phrases.length);
 const diagnostic=await localRepairDiagnostic(film,reference,timing);
 expect(diagnostic).toMatch(/integer narration phrase IDs/);
 expect(diagnostic).toMatch(/Only the VIS data line after the subtitle boundary is used/);
 expect(diagnostic).not.toMatch(/\/Users\//);
});
it('still rejects the received legacy repair, now with its actual conflicts instead of a missing base',async()=>{
 const {film,timing,reference,legacyRepairPatch}=await fixture();
 const repaired=applyCompositionAnswer({patch:legacyRepairPatch},film);
 expect(repaired.source).not.toBe(film.source);
 await expect(assembleMotionRuntime(repaired,reference,timing)).rejects.toThrow(/Repeated sound configuration/);
});
it('assembles the real composition once its two data lines carry the model\'s own expressions',async()=>{
 const {film,timing,reference}=await fixture();
 const corrected=applyCompositionAnswer({patch:dataLinePatch(film)},film);
 const assembled=await assembleMotionRuntime(corrected,reference,timing);
 const footer=assembled.source.slice(assembled.source.indexOf(boundary));
 expect(footer).toContain('VIS = {1: ws(0), 2: TB0, 3: TC0');
 expect(footer).toContain('"transitions": [{"t": round(t, 3)');
 expect(footer).toContain("'strike': TK, 'counter': TCNT, 'terrible': TT, 'dur': DUR");
 expect(footer).not.toContain("'T_A'");
 // The scenes themselves are unchanged: no creative change by the executor.
 // (Only exact duplicated helper copies before the first scene are blanked.)
 const scenes=(source:string)=>source.slice(source.indexOf('scene("sA"'),source.indexOf(boundary)).replace(/\n+/g,'\n');
 expect(scenes(assembled.source)).toBe(scenes(film.source));
});
it.skipIf(process.platform!=='darwin')('builds the corrected real composition in the sandbox and surfaces its actual timing diagnostics for Claude',async()=>{
 const {id,film,timing,reference}=await fixture();
 const voice=path.resolve('storage/motion',id,'voix.wav');
 const available=await access(voice).then(()=>true,()=>false);
 if(!available)return;// The real recording is local to the production machine.
 vi.stubGlobal('fetch',async()=>{throw Error('External calls prohibited');});
 const dir=path.resolve('storage/motion',`qa-${randomUUID()}`),evidence=path.resolve('storage/qa','motion-real-candidate-57a06953');
 try{
  await mkdir(dir,{recursive:true});await mkdir(evidence,{recursive:true});
  const corrected=await assembleMotionRuntime(applyCompositionAnswer({patch:dataLinePatch(film)},film),reference,timing);
  // The data lines were the executor's defect. What remains is the model's own
  // composition: scene minimums copied from the slower reference recording, so
  // visuals land after the voice. That is the diagnostic the next repair turn
  // must receive; the executor never retimes scenes on its own.
  let outcome:{accepted:boolean;diagnostic:string;audit?:unknown};
  try{const built=await compileMotion(dir,corrected,timing,voice,undefined,[],{compositionOnly:true});outcome={accepted:true,diagnostic:'',audit:built.audit};}
  catch(error){outcome={accepted:false,diagnostic:error instanceof Error?error.message:String(error)};}
  const audit=JSON.parse(await readFile(path.join(dir,'build-audit.json'),'utf8').catch(()=>'null'));
  // The next paid repair step receives this preview together with the data-line diagnostic.
  const provisional=await provisionalBuildDiagnostic(film,reference,timing,voice,path.resolve('storage/motion',`qa-${randomUUID()}`));
  expect(provisional).toMatch(/^Provisional reading, not applied/);
  if(!outcome.accepted)expect(provisional).toContain(outcome.diagnostic.slice(0,80));
  await writeFile(path.join(evidence,'report.json'),JSON.stringify({id,at:new Date().toISOString(),candidateSha256:digest(film.source),correctedSha256:digest(corrected.source),executorPatch:dataLinePatch(film),outcome,provisional,audit,externalCalls:0,limitation:'Executor regression with the executor\'s own data-line correction. Not a Claude decision, not a human approval, no live state changed.'},null,2));
  expect(audit).not.toBeNull();
  expect(audit.offsets).toHaveLength(timing.phrases.length);
  if(!outcome.accepted){
   expect(outcome.diagnostic).toMatch(/voice offsets out of tolerance: phrase 2 lands at 3\.15 s \(attack 2\.19 s, allowed 1\.90-2\.48 s, VIS 2 = TB0\)/);
   expect(outcome.diagnostic).toMatch(/phrase 4 lands at [\d.]+ s \(attack 6\.70 s, allowed 6\.41-6\.99 s, VIS 4 = max\(ws\(19\), TD0 \+ 0\.05\)\)/);
   expect(outcome.diagnostic).toMatch(/DUR 39\.6 is too short: the logo lettering settles at 39\.40 s/);
   expect(outcome.diagnostic).toMatch(/attaque voix \/ arrivee du visuel|phrase : /);
  }
 }finally{vi.unstubAllGlobals();await rm(dir,{recursive:true,force:true});}
},300000);

it.skipIf(process.platform!=='darwin')('selects the writer\'s closest saved candidate by measured checks, never the executor\'s own reading',async()=>{
 const {id,film,timing,reference}=await fixture();
 const voice=path.resolve('storage/motion',id,'voix.wav');
 if(!(await access(voice).then(()=>true,()=>false)))return;
 const dir=path.resolve('storage/motion',`qa-${randomUUID()}`);
 try{
  await mkdir(dir,{recursive:true});
  const corrected=applyCompositionAnswer({patch:dataLinePatch(film)},film);
  await writeFile(path.join(dir,`writing-candidate-${'a'.repeat(64)}.json`),JSON.stringify({answerHash:'x',film}));
  await writeFile(path.join(dir,`writing-candidate-${'b'.repeat(64)}.json`),JSON.stringify({answerHash:'y',film:corrected}));
  const best=await bestSavedCandidate(dir,reference,timing,voice,film);
  expect(best?.film.source).toBe(corrected.source);expect(best?.currentScore).toBe(Infinity);expect(best?.score).toBeGreaterThan(0);
  expect(best?.diagnostic).toMatch(/DUR 39\.6 is too short/);
  expect(await bestSavedCandidate(dir,reference,timing,voice,corrected)).toBeNull();
 }finally{await rm(dir,{recursive:true,force:true});}
},300000);
