import {it,expect} from 'vitest';import {readFile} from 'node:fs/promises';import {assembleMotionFilm,validateFilm,Timing} from '../src/lib/motion/model';
it('assembles trusted machinery without changing Claude scene content or weakening validation',async()=>{
 const ref=await readFile('motion/reference/plot-hole-v4-safe.py','utf8'),timing=Timing.parse(JSON.parse(await readFile('motion/template/timing.json','utf8'))),marker='# ============================================================ A';
 const ids=[...ref.matchAll(/^scene\("([^"]+)",/gm)].map(m=>m[1]);const body=ref.slice(ref.indexOf(marker));const film={source:'Untrusted altered prelude\n'+body,referenceChoice:'Fixed machinery',scenes:timing.phrases.map((p,i)=>({id:ids[i],phrase:p.phrase,movement:'Type moves',meaning:'Explain meaning'})),removedWords:[]};
 const assembled=assembleMotionFilm(film,ref,timing);expect(assembled.source.slice(assembled.source.indexOf(marker))).toBe(body);expect(assembled.source).not.toContain('Untrusted altered prelude');expect(()=>validateFilm(assembled,ref,timing)).not.toThrow();expect(()=>assembleMotionFilm({...film,source:'missing boundary'},ref,timing)).toThrow();
});

it('discards exact duplicated runtime helpers before scenes but rejects modified helpers with their name and location',async()=>{
 const {assembleMotionRuntime}=await import('../src/lib/motion/assembly');
 const {referenceFixture}=await import('../motion/runtime/fixture');const fixture=await referenceFixture();
 const ref=await readFile('motion/reference/plot-hole-v4-safe.py','utf8'),marker='# ============================================================ A';
 const helper=ref.slice(ref.indexOf('def scene('),ref.indexOf('def put(')).trim();
 const duplicate=ref.replace(marker,marker+'\nSC = {}\nEV = []\nTR = []\ncur = [None]\n'+helper+'\n#');
 const assembled=await assembleMotionRuntime({...fixture.film,source:duplicate},ref,fixture.timing);
 expect(assembled.source.match(/^def scene\(/gm)).toHaveLength(1);expect(()=>validateFilm(assembled,ref,fixture.timing)).not.toThrow();
 await expect(assembleMotionRuntime({...fixture.film,source:ref.replace(marker,marker+'\ndef scene(sid, bg):\n    return 3\n#')},ref,fixture.timing)).rejects.toThrow(/Composition line .*def scene/);
});

it('accepts Python single quotes for scene IDs without changing revision scope',async()=>{
 const {referenceFixture}=await import('../motion/runtime/fixture');const f=await referenceFixture(),ref=await readFile('motion/reference/plot-hole-v4-safe.py','utf8');
 const film={...f.film,source:ref.replace(/scene\("([^"\n]+)",/g,"scene('$1',")};
 expect(()=>validateFilm(film,ref,f.timing)).not.toThrow();expect(()=>validateFilm(film,ref,f.timing,film,['sB'])).toThrow('left the film unchanged');expect(()=>validateFilm({...film,source:film.source.replace("scene('sB', CR)","scene('sB', CR)  # revised")},ref,f.timing,film,['sB'])).not.toThrow();
 expect(()=>validateFilm({...film,source:film.source.replace("scene('sA', NAVY)","scene('sA', CR)")},ref,f.timing,film,['sB'])).toThrow('untargeted');
});
