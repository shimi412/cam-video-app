import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {assembleMotionRuntime} from '../src/lib/motion/assembly';
import {digest,Timing,type MotionFilm} from '../src/lib/motion/model';
import {applyCompositionAnswer} from '../src/lib/motion/patch';
async function fixture(){const source=await readFile('motion/reference/plot-hole-v4-safe.py','utf8'),timing=Timing.parse(JSON.parse(await readFile('motion/template/timing.json','utf8')));const film:MotionFilm={source,referenceChoice:'Preserve the reference direction.',removedWords:[],scenes:timing.phrases.map((p,i)=>({id:'s'+String.fromCharCode(65+i),phrase:p.phrase,movement:'Animated typography',meaning:p.text}))};return {source,timing,film};}
it('owns every footer function even when a received legacy answer renames or changes it',async()=>{const {source,timing,film}=await fixture();const modified=source.replace('def find(seq','def find_sub(seq').replace('i0 = find(toks','i0 = find_sub(toks').replace('    bad = 0','    bad = -999');const assembled=await assembleMotionRuntime({...film,source:modified},source,timing);expect(assembled.source).toContain('def find(seq');expect(assembled.source).not.toContain('find_sub');expect(assembled.source).toContain('    bad = 0');expect(assembled.source).not.toContain('bad = -999');const boundary='# ------------------------------------------------------------ sous-titres',start='# ============================================================ A';expect(assembled.source.slice(assembled.source.indexOf(start),assembled.source.indexOf(boundary))).toBe(source.slice(source.indexOf(start),source.indexOf(boundary)));});
it('rejects creative helper definitions and executable config instead of relaxing the sandbox',async()=>{const {source,timing,film}=await fixture();await expect(assembleMotionRuntime({...film,source:source.replace('scene("sA", NAVY)','def arbitrary():\n    return 0\nscene("sA", NAVY)')},source,timing)).rejects.toThrow('def arbitrary()');await expect(assembleMotionRuntime({...film,source:source.replace('SUBS = [','SUBS = eval("payload")\nOTHER = [')},source,timing)).rejects.toThrow('Unsupported configuration call');});
it('diagnoses wrong timing keys and quoted expressions before the runtime can throw a KeyError',async()=>{
 const {source,timing,film}=await fixture();
 await expect(assembleMotionRuntime({...film,source:source.replace('VIS = {1: ws(0)',"VIS = {'sA': 'ws(0)'")},source,timing)).rejects.toThrow('integer narration phrase IDs');
 await expect(assembleMotionRuntime({...film,source:source.replace('VIS = {1: ws(0)',"VIS = {1: 'ws(0)'")},source,timing)).rejects.toThrow('never quoted expressions');
 await expect(assembleMotionRuntime({...film,source:source.replace('VIS = {1: ws(0)','VIS = {999: ws(0)')},source,timing)).rejects.toThrow('exactly these phrase IDs');
});
it('recovers legacy repair metadata only from the exact saved source without changing its receipt',async()=>{
 const {mkdtemp,rm,writeFile}=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const {savedRepairBase}=await import('../src/lib/motion/candidate'),{film}=await fixture();
 const dir=await mkdtemp(path.join(os.tmpdir(),'motion-repair-base-'));
 try{
  const file=path.join(dir,`writing-candidate-${'a'.repeat(64)}.json`),raw=JSON.stringify({answerHash:'original',film});
  await writeFile(file,raw);expect(await savedRepairBase(dir,film.source)).toEqual(film);expect(await readFile(file,'utf8')).toBe(raw);
  await expect(savedRepairBase(dir,film.source+'\n')).rejects.toThrow('no exact candidate');
  await writeFile(path.join(dir,`writing-candidate-${'b'.repeat(64)}.json`),JSON.stringify({film:{...film,referenceChoice:'Different metadata'}}));
  await expect(savedRepairBase(dir,film.source)).rejects.toThrow('ambiguous');
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('edits only the exact saved candidate and preserves descriptions unless explicitly changed',async()=>{const {film}=await fixture();const patch={baseSha256:digest(film.source),edits:[{before:'fsB = fit(["REALLY?"], SW, 900, 125, 300)',after:'fsB = fit(["REALLY?"], SW, 900, 125, 120)'}]};const result=applyCompositionAnswer({patch},film);expect(result.source).toContain(patch.edits[0].after);expect(result.scenes).toEqual(film.scenes);expect(()=>applyCompositionAnswer({patch},result)).toThrow('source changed');expect(()=>applyCompositionAnswer({patch:{...patch,edits:[{before:'\n',after:''}]}},film)).toThrow('Edit 1 of 1 matches more than once');expect(()=>applyCompositionAnswer({patch:{...patch,edits:[patch.edits[0],{before:'absent text',after:''}]}},film)).toThrow('Edit 2 of 2 matches nothing');expect(()=>applyCompositionAnswer({film,patch},film)).toThrow('exactly one');});
it('replays a saved patch after a worker restart without applying it twice',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const {saveCompositionCandidate}=await import('../src/lib/motion/candidate');
 const dir=await mkdtemp(path.join(os.tmpdir(),'motion-candidate-'));
 try{const file=path.join(dir,'candidate.json'),{film}=await fixture();await saveCompositionCandidate(file,{film});
 const answer={patch:{baseSha256:digest(film.source),edits:[{before:'fsB = fit(["REALLY?"], SW, 900, 125, 300)',after:'fsB = fit(["REALLY?"], SW, 900, 125, 120)'}]}};
 const applied=await saveCompositionCandidate(file,answer);expect(await saveCompositionCandidate(file,answer)).toEqual(applied);expect(applied.source).not.toEqual(film.source);
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('keeps the saved revision base intact when a patch changes protected or untargeted source',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const {saveCompositionCandidate}=await import('../src/lib/motion/candidate');const {validateFilm}=await import('../src/lib/motion/model');
 const dir=await mkdtemp(path.join(os.tmpdir(),'motion-revision-'));
 try{const file=path.join(dir,'candidate.json'),{film,source,timing}=await fixture();
 const validate=(f:MotionFilm)=>validateFilm(f,source,timing,film,['sB']);
 const bad={patch:{baseSha256:digest(film.source),edits:[{before:'# ------------------------------------------------------------ sous-titres',after:'# SUBTITLE BOUNDARY'}]}};
 await expect(saveCompositionCandidate(file,bad,film,validate)).rejects.toThrow('removes the protected subtitle boundary');
 const good={patch:{baseSha256:digest(film.source),edits:[{before:'fsB = fit(["REALLY?"], SW, 900, 125, 300)',after:'fsB = fit(["REALLY?"], SW, 900, 125, 120)'}]}};
 const result=await saveCompositionCandidate(file,good,film,validate);expect(result.source).toContain(good.patch.edits[0].after);
 expect(await saveCompositionCandidate(file,good,film,validate)).toEqual(result);
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('derives transitions, duration and logo timing itself and accepts omitted film-specific accents',async()=>{
 const {source,timing,film}=await fixture();
 const marker='# ============================================================ A',boundary='# ------------------------------------------------------------ sous-titres';
 const body=source.slice(source.indexOf(marker),source.indexOf(boundary));
 const subs=source.slice(source.indexOf('SUBS = ['),source.indexOf(']\ncur_i = 0')+1).replace(/\(/g,'[').replace(/\)/g,']');
 const data=(marks:string)=>({...film,source:`DUR = 46.2\n${body}${boundary}\n${subs}\nVIS = {1: ws(0), 2: TB0, 3: TC0, 4: max(ws(19), TD0 + .05), 5: max(ws(33), TE0), 6: max(ws(47), T_E + .08), 7: TG, 8: max(ws(67), T_G + .05), 9: max(ws(78), T_H + .05), 10: max(ws(86), T_I + .08)}\nMARKS = ${marks}\n`});
 const assembled=await assembleMotionRuntime(data("{'sober': [T_F, T_G], 'logo_impact': LAND, 'transitions': [], 'dur': 1, 'logo_net': 2, 'strike': None}"),source,timing);
 const footer=assembled.source.slice(assembled.source.indexOf(boundary));
 expect(footer).toContain('json.dump({"transitions": [{"t": round(t, 3), "d": d, "technique": l, "de": a, "vers": b} for (t, d, l, a, b) in sorted(TR)], \'sober\': [T_F, T_G], \'plot\': SC[\'sJ\'][0], \'q_final\': LOGO_NET - 1.0, \'logo_impact\': LAND, \'logo_net\': LOGO_NET, \'dur\': DUR}, open(P / "marks.json", "w")');
 expect(footer).not.toContain("'strike'");expect(footer).not.toContain("'dur': 1");
 await expect(assembleMotionRuntime(data("{'sober': ['T_F', 'T_G'], 'logo_impact': LAND}"),source,timing)).rejects.toThrow('never quoted strings');
 await expect(assembleMotionRuntime(data("{'logo_impact': LAND}"),source,timing)).rejects.toThrow('MARKS must include sober');
 await expect(assembleMotionRuntime(data("{'sober': T_F, 'logo_impact': LAND}"),source,timing)).rejects.toThrow('[start, end]');
});
it('points a non-matching edit at the closest current line so the writer can copy it',async()=>{
 const {film}=await fixture();
 const changed={...film,source:film.source.replace('fsB = fit(["REALLY?"], SW, 900, 125, 300)','fsB = fit(["REALLY?"], SW, 900, 125, 280)')};
 expect(()=>applyCompositionAnswer({patch:{baseSha256:digest(changed.source),edits:[{before:'fsB = fit(["REALLY?"], SW, 900, 125, 300)',after:'x'}]}},changed)).toThrow('Closest current line: "fsB = fit([\\"REALLY?\\"], SW, 900, 125, 280)"');
});
