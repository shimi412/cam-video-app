import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {validatePlan,assertChecks,boardHash,exactExcerpt,type ComicState} from '../src/lib/comics/model';
import {comicsFixture} from '../comics/runtime/fixture';
import {imageParams,clipParams,sheetParams} from '../src/lib/comics/prompts';
it('preserves complete narration, refuses any hero in a new plan and rejects feedback as visible copy',async()=>{const f=await comicsFixture();const noHero=structuredClone(f.plan);for(const p of noHero.panels)p.hero='absent';expect(validatePlan(f.script,noHero)).toEqual(noHero);
 // Shimi, 2026-10-22: a new plan with any hero is refused; a saved film that already had him keeps the old one-third rule for its own revisions.
 const legacy=structuredClone(f.plan);legacy.panels[0].hero='partial';expect(()=>validatePlan(f.script,legacy)).toThrow('no hero');expect(validatePlan(f.script,legacy,legacy,[])).toEqual(legacy);
 const bad=structuredClone(noHero);bad.panels[0].hero='full';expect(()=>validatePlan(f.script,bad)).toThrow('no hero');bad.panels[0].hero='absent';bad.panels[0].title='Please remove the badges';expect(()=>validatePlan(f.script,bad)).toThrow('quote');bad.panels[0].title='';bad.panels[0].narration+=' Invented words';expect(()=>validatePlan(f.script,bad)).toThrow('every word');});
it('rejects an unrelated scene change in a feedback batch',async()=>{const f=await comicsFixture(),p=structuredClone(f.plan);p.panels[7].color='purple';expect(()=>validatePlan(f.script,p,f.plan,[2])).toThrow('untargeted');expect(validatePlan(f.script,p,f.plan,[8]).panels[7].color).toBe('purple');});
it('requests native vertical images, one action, muted clips and code-only lettering',async()=>{const f=await comicsFixture(),image=imageParams(f.plan.panels[0],'saved-sheet'),clip=clipParams(f.plan.panels[0],'approved-image',3.4);expect(image.aspect_ratio).toBe('9:16');expect(image.resolution).toBe('2k');expect(image.medias[0].value).toBe('saved-sheet');expect(image.prompt).toContain('No hero, no superhero');expect(image.medias).toHaveLength(2);expect(image.prompt).toContain('All lettering is added separately in code');expect(clip.duration).toBe(4);expect(clip.sound).toBe('off');expect(clip.medias[0].value).toBe('approved-image');expect(sheetParams(f.plan).medias).toHaveLength(1);expect(sheetParams(f.plan).prompt).not.toMatch(/Hero:/);});
it('blocks quality failures rather than making a partial film approvable',()=>{const c={durations:true,safeZones:[],flashCandidates:[],mixLufs:-16,sfxBelowVoiceDb:18,logo:true,duration:59};expect(()=>assertChecks(c)).not.toThrow();for(const change of [{durations:false},{safeZones:['title']},{mixLufs:-7},{sfxBelowVoiceDb:4},{logo:false}])expect(()=>assertChecks({...c,...change})).toThrow('Quality');
 // Flash candidates are consultative since 2026-10-21: disclosed with evidence at the visual approval, never a stop.
 expect(()=>assertChecks({...c,flashCandidates:[12.4],flashNotes:[{time:12.4,evidence:['evidence/flash-0-before.jpg']}]})).not.toThrow();});
it('binds approval to both the selected plan and its exact images',async()=>{const f=await comicsFixture();const s={plan:f.plan,images:{1:'accepted-image'}} as unknown as ComicState;expect(boardHash(s)).not.toBe(boardHash({...s,images:{1:'changed-image'}}));});
it('uses the entire 0.8-second flash window and has no Gazalighting wording in production titles',async()=>{const flash=await readFile('comics/runtime/flash-check.py','utf8'),build=await readFile('comics/runtime/build.py','utf8');expect(flash).toContain('range(1,24)');expect(build).not.toContain('title(word_at(');expect(build).toContain('html.escape');expect(build).toContain('MIN_VISIBLE = 0.8');});
it('keeps quote and request identities stable after PostgreSQL JSON key reordering',async()=>{const {hash}=await import('../src/lib/comics/model');expect(hash({plan:{scene:'one',hero:'absent'},revision:1})).toBe(hash({revision:1,plan:{hero:'absent',scene:'one'}}));expect(hash({ids:[1,2]})).not.toBe(hash({ids:[2,1]}));});

it('repairs a near-exact title to the narration\'s own spelling and rejects invented copy (live Attack Start 2026-10-22)',()=>{
 const n='Now, there are zero rocket attacks. The moment they released the hostages, the war ended.';
 expect(exactExcerpt(n,'Zero rocket attacks')).toBe('zero rocket attacks');
 expect(exactExcerpt(n,'zero rocket attacks.')).toBe('zero rocket attacks.');
 expect(exactExcerpt(n,'Zero, rocket attacks')).toBe('zero rocket attacks');
 expect(exactExcerpt(n,'the war ended')).toBe('the war ended');
 expect(exactExcerpt(n,'rockets stopped')).toBeNull();
});
it('accepts one-frame clip resampling skew but rejects a diverging encode (live Attack 2026-10-22)',async()=>{
 const {encodedFramesMatch}=await import('../src/lib/comics/render');
 const live=[0.97,0.972,0.979,0.982,0.984,0.966,0.969,0.98,0.953,0.979].map(similarity=>({similarity}));
 expect(encodedFramesMatch(live)).toBe(true);
 expect(encodedFramesMatch(live.map((c,i)=>i===2?{similarity:.71}:c))).toBe(false);
 expect(encodedFramesMatch(live.map(c=>({similarity:c.similarity-.03})))).toBe(false);
 expect(encodedFramesMatch([])).toBe(false);
});
