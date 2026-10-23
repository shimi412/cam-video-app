import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {assertChecks,price,legacyMotionPrice,assertMotionRevisionAvailable,validateFilm,validateTiming,type Checks,type MotionFilm} from '../src/lib/motion/model';
import {protectedHtml,validateMotionHtml} from '../src/lib/motion/html-policy';
const source=readFileSync('motion/template/build.py','utf8'),timing=JSON.parse(readFileSync('motion/template/timing.json','utf8'));
const film:MotionFilm={source,referenceChoice:'Use the supplied rhythm and transitions.',removedWords:[],scenes:timing.phrases.map((p:{phrase:number},i:number)=>({id:'s'+String.fromCharCode(65+i),phrase:p.phrase,movement:'Letters enter and transition into the next object.',meaning:'The visual explains this sentence.'}))};
const good:Checks={holds:0,offsets:[-.1,.29],safeZoneViolations:[],removedWordViolations:[],sfxBelowVoiceDb:18,mixLufs:-17,logo:true};
describe('motion quality gates',()=>{
 it('accepts only measured complete checks',()=>{expect(()=>assertChecks(good)).not.toThrow();for(const patch of [{holds:1},{offsets:[.3]},{offsets:[NaN]},{safeZoneViolations:['word outside']},{removedWordViolations:['#old']},{sfxBelowVoiceDb:14},{mixLufs:-12},{logo:false}])expect(()=>assertChecks({...good,...patch})).toThrow('Quality checks');});
 it('keeps the legacy $10 + $5 ladder for films saved without an accepted price, and the three-version limit',()=>{expect([0,1,2].map(price)).toEqual([10,15,20]);expect([0,1,2].map(legacyMotionPrice)).toEqual([10,15,20]);expect(()=>price(3)).toThrow('revision limit');expect(()=>assertMotionRevisionAvailable(3)).toThrow('revision limit');expect(()=>assertMotionRevisionAvailable(2)).not.toThrow();});
 it('matches the complete original narration',()=>{expect(()=>validateTiming(timing,timing.phrases.map((p:{text:string})=>p.text).join(' '))).not.toThrow();expect(()=>validateTiming(timing,'A different story.')).toThrow();});
 it('preserves the reference machinery',()=>{expect(()=>validateFilm(film,source,timing)).not.toThrow();expect(()=>validateFilm({...film,source:source.replace('BEAT = 60 / 96','BEAT = 60 / 120')},source,timing)).toThrow('machinery');});
 it('rejects changing an untargeted scene or caption footer',()=>{expect(()=>validateFilm({...film,source:source.replace('fsB = fit(["REALLY?"]', 'fsB = fit(["Something else"]')},source,timing,film,['sA'])).toThrow();expect(()=>validateFilm({...film,source:source.replace('"Then somebody needs to explain", 1340','"Then somebody needs to explain", 1200')},source,timing,film,['sA'])).toThrow();});
 it('preserves scenes across database JSON key reordering',()=>{
  const stored={...film,scenes:film.scenes.map(s=>({meaning:s.meaning,movement:s.movement,phrase:s.phrase,id:s.id}))};
  expect(()=>validateFilm(film,source,timing,stored,['sB'])).toThrow('left the film unchanged');
  expect(()=>validateFilm({...film,source:source.replace('fsB = fit(["REALLY?"], SW, 900, 125, 300)','fsB = fit(["REALLY?"], SW, 900, 125, 120)')},source,timing,stored,['sB'])).not.toThrow();
 });
 it('allows locally bundled fonts without allowing remote connections',()=>{const html='<html><head><script src="assets/gsap.min.js"></script></head><body><script>const tl=gsap.timeline({paused:true});window.__timelines["main"]=tl;</script></body></html>';const secured=protectedHtml(html);expect(secured).toContain("font-src 'self' file: data:");expect(secured).toContain("connect-src 'none'");expect(secured).not.toContain("script-src 'unsafe-inline' 'self' file: data:");});
 it('rejects browser escape and executable markup',()=>{const wrap=(js:string)=>`<html><head><script src="assets/gsap.min.js"></script></head><body><script>${js}</script></body></html>`;for(const js of ['fetch("/api/account")','new WebSocket("x")','tl.constructor("x")()','window.location="x"'])expect(()=>validateMotionHtml(wrap(js))).toThrow();expect(()=>validateMotionHtml(wrap('const tl=gsap.timeline({paused:true});tl.to("#a",{x:1,duration:1},0);window.__timelines["main"]=tl;'))).not.toThrow();});
});
it('lets a targeted revision retime the VIS and MARKS data lines but not the subtitles or machinery',async()=>{
 const {validateFilm}=await import('../src/lib/motion/model');
 const retimed={...film,source:source.replace('VIS = {1: ws(0)','VIS = {1: ws(0) + .05')};
 expect(()=>validateFilm(retimed,source,timing,film,['sA'])).not.toThrow();
 const captions={...film,source:source.replace('("Then somebody needs to explain", 1340)','("Then somebody needs to explain why", 1340)')};
 expect(()=>validateFilm(captions,source,timing,film,['sA'])).toThrow('untargeted scene or protected code');
});
