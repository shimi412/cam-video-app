import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {MemoryEntry,TurnState,AgentStore} from '../src/lib/agent/store';
import type {StepResult,AgentTransport} from '../src/lib/agent/transport';
vi.mock('../src/lib/motion/store',()=>({motionDirectory:vi.fn()}));
vi.mock('../src/lib/settings',()=>({getSetting:async()=>undefined}));
import {motionDirectory} from '../src/lib/motion/store';
import {agentDependencies} from '../src/lib/agent/runtime';
import {agentWriterDependencies,writeMotionAgent,startingSource,sceneIds,phraseWords,explainArrivals,MARKER,BOUNDARY} from '../src/lib/motion/agent-writer';
import {Timing,type MotionTiming,type MotionFilm} from '../src/lib/motion/model';

const fixture=JSON.parse(await readFile('tests/fixtures/motion-real-candidate-57a06953.json','utf8')) as {timing:MotionTiming;reference:string};
const timing=Timing.parse(fixture.timing);
const template=await readFile('motion/template/build.py','utf8');
function store(){
 const turns=new Map<string,{hash:string;state:TurnState}>(),events:{session:string;key:string;kind:string;content:unknown;sequence:number}[]=[],memories:MemoryEntry[]=[];
 const s:AgentStore={lock:async(_id,work)=>work(),get:async(se,id,hash)=>{const t=turns.get(se+id);if(t&&t.hash!==hash)throw Error('Input changed');return t?structuredClone(t.state):null;},put:async(se,id,hash,state)=>{turns.set(se+id,{hash,state:structuredClone(state)});},history:async()=>[],event:async(session,key,kind,content)=>{if(!events.some(e=>e.session===session&&e.key===key))events.push({session,key,kind,content:structuredClone(content),sequence:events.length+1});},memories:async()=>memories,propose:async()=>randomUUID()};
 return {store:s,turns};
}
const call=(name:string,args:unknown):StepResult=>({message:{role:'assistant',content:null,tool_calls:[{id:randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}}]},actualUsd:.01});
const sceneBody=(label:string)=>`${MARKER} · test\n`+timing.phrases.map((p,i)=>`scene("s${String.fromCharCode(65+i)}", NAVY)\nshow("s${String.fromCharCode(65+i)}", ws(${phraseWords(timing)[i].indexes[0]}))\nput(txt("t${i}", 400, "${label} ${i}", 120))\n`).join('')+'LOGO_NET = DUR - 3\nLAND = DUR - 4\n';
let dir='';
beforeEach(async()=>{dir=await mkdtemp(path.join(os.tmpdir(),'motion-agent-'));vi.mocked(motionDirectory).mockReturnValue(dir);vi.stubEnv('CAM_LIVE_ENABLED','1');vi.stubEnv('CAM_MOTION_MODEL','anthropic/claude-test');});
afterEach(async()=>{vi.unstubAllEnvs();await rm(dir,{recursive:true,force:true});});

describe('startingSource',()=>{
 it('keeps the template prelude, generates subtitle groups from the recognised words, and places editable data lines',()=>{
  const source=startingSource(template,timing);
  expect(source.slice(0,source.indexOf(MARKER)).replace(/^DUR = .+$/m,'')).toBe(template.slice(0,template.indexOf(MARKER)).replace(/^DUR = .+$/m,''));
  expect(source).toContain(BOUNDARY);expect(source).toMatch(/^VIS = \{1: ws\(0\)/m);expect(source).toMatch(/^MARKS = \{"sober"/m);expect(source).toContain('**MARKS}');
  const subs=[...source.matchAll(/^\s+\("([^"]+)", 1340\),$/gm)].map(m=>m[1]);
  expect(subs.length).toBeGreaterThanOrEqual(timing.phrases.length);
  const words=timing.words.map(w=>w.word).join(' ');expect(subs.join(' ')).toBe(words);
  expect(sceneIds(source)).toEqual([]);
 });
});

describe('writeMotionAgent',()=>{
 it('lets the model write, build, read the failures, fix and submit; the result is the file whose last build passed',async()=>{
  const builds:string[]=[];
  agentWriterDependencies.build=vi.fn(async(_buildDir:string,film:MotionFilm)=>{builds.push(film.source);const bad=film.source.includes('draft 0');return {checks:{holds:bad?2:0,offsets:timing.phrases.map(()=>0),safeZoneViolations:[],removedWordViolations:[],sfxBelowVoiceDb:20,mixLufs:-17,logo:true},audit:{duration:50,scenes:film.scenes.map(s=>({id:s.id,start:0,end:1}))}};});
  agentWriterDependencies.review=vi.fn(async()=>{throw Error('review unavailable');});
  let step=0;const transport:AgentTransport=vi.fn(async input=>{
   step++;const last=String(input.messages.at(-1)?.content??'');
   if(step===1)return call('read_skill',{id:'motion-method'});
   if(step===2)return call('write_scenes',{body:sceneBody('draft')});
   if(step===3)return call('set_data',{VIS:'{'+timing.phrases.map((p,i)=>`${p.phrase}: ws(${phraseWords(timing)[i].indexes[0]})`).join(', ')+'}',MARKS:'{"sober": [1.0, 2.0], "logo_impact": LAND}',DUR:50,removedWords:[]});
   if(step===4)return call('run_build',{});
   if(step===5){expect(last).toContain('transition hold');return call('edit',{old:'draft 0',new:'final 0'});}
   if(step===6)return call('submit_plan',{referenceChoice:'Validated method',scenes:timing.phrases.map((p,i)=>({id:`s${String.fromCharCode(65+i)}`,phrase:p.phrase,movement:'m',meaning:'x'}))});
   if(step===7){expect(last).toContain('Run run_build');return call('run_build',{});}
   if(step===8){expect(last).toContain('PASS');return call('submit_plan',{referenceChoice:'Validated method',scenes:timing.phrases.map((p,i)=>({id:`s${String.fromCharCode(65+i)}`,phrase:p.phrase,movement:'m',meaning:'x'}))});}
   throw Error('unexpected step '+step+' after: '+last.slice(0,600));
  });
  const {store:s}=store();agentDependencies.store=s;agentDependencies.transport=transport;agentDependencies.readSkill=async()=>'method';
  const result=await writeMotionAgent({contract:6,jobId:randomUUID(),revision:0,script:timing.phrases.map(p=>p.text).join('\n'),timing,targets:[],feedback:''});
  expect(builds).toHaveLength(2);expect(result.film.source).toContain('final 0');expect(result.film.scenes).toHaveLength(timing.phrases.length);expect(result.creativeApproval).toBeUndefined();expect(result.receipt.actualUsd).toBeCloseTo(.08);
  const saved=JSON.parse(await readFile(path.join(dir,(await import('node:fs')).readdirSync(dir).find(n=>n.startsWith('agent-'))!,'state.json'),'utf8'));expect(saved.lastBuild.ok).toBe(true);
 });
 it('refuses edits to the locked prelude and footer, and a submission without a passing build',async()=>{
  agentWriterDependencies.build=vi.fn(async()=>{throw Error('never');});
  let step=0;const seen:string[]=[];const transport:AgentTransport=vi.fn(async input=>{
   step++;seen.push(String(input.messages.at(-1)?.content??''));
   if(step===1)return call('read_skill',{id:'motion-method'});
   if(step===2)return call('edit',{old:'NAVY, MID, LIGHT = "#203C6C"',new:'NAVY, MID, LIGHT = "#000000"'});
   if(step===3)return call('edit',{old:'def check_holds():',new:'def check_holds_x():'});
   if(step===4)return call('submit_plan',{referenceChoice:'x',scenes:[{id:'sA',phrase:1,movement:'m',meaning:'x'}]});
   throw new (await import('../src/lib/agent/runtime')).AgentPlanFailure('stop',undefined);
  });
  const {store:s}=store();agentDependencies.store=s;agentDependencies.transport=transport;agentDependencies.readSkill=async()=>'method';
  await expect(writeMotionAgent({contract:6,jobId:randomUUID(),revision:0,script:'x',timing,targets:[],feedback:''})).rejects.toThrow();
  expect(seen[2]).toContain('prelude is locked');expect(seen[3]).toContain('footer');expect(seen[4]).toContain('run_build');
 });
});
describe('writeMotionAgent revisions',()=>{
 it('keeps the previous film as the working file, rejects an edit to an untargeted scene at build, and accepts a visible change to the targeted scene',async()=>{
  const previousBody=sceneBody('final');
  const previousSource=startingSource(template,timing).replace(/^# =+ A ·[^\n]*\n\n/m,previousBody).replace(/^MARKS = .*$/m,'MARKS = {"sober": [1.0, 2.0], "logo_impact": LAND}');
  const previous:MotionFilm={source:previousSource,referenceChoice:'Validated method',scenes:timing.phrases.map((p,i)=>({id:`s${String.fromCharCode(65+i)}`,phrase:p.phrase,movement:'m',meaning:'x'})),removedWords:[]};
  const builds:string[]=[];
  agentWriterDependencies.build=vi.fn(async(_buildDir:string,film:MotionFilm,_timing,_voice,prev?:MotionFilm,targets:string[]=[])=>{const {validateFilm}=await import('../src/lib/motion/model');validateFilm(film,template,timing,prev,targets);builds.push(film.source);return {checks:{holds:0,offsets:timing.phrases.map(()=>0),safeZoneViolations:[],removedWordViolations:[],sfxBelowVoiceDb:20,mixLufs:-17,logo:true},audit:{duration:50,scenes:film.scenes.map(s=>({id:s.id,start:0,end:1}))}};});
  agentWriterDependencies.review=vi.fn(async()=>{throw Error('no review');});
  let step=0;const seen:string[]=[];const transport:AgentTransport=vi.fn(async input=>{
   step++;seen.push(String(input.messages.at(-1)?.content??''));
   if(step===1)return call('read_skill',{id:'motion-method'});
   if(step===2)return call('run_build',{});
   if(step===3){expect(seen[2]).toContain('left the film unchanged');return call('edit',{old:'"final 0"',new:'"changed 0"'});}
   if(step===4)return call('run_build',{});
   if(step===5){expect(seen[4]).toContain('untargeted');return call('edit',{old:'"changed 0"',new:'"final 0"'});}
   if(step===6)return call('edit',{old:'"final 1"',new:'"bolder 1"'});
   if(step===7)return call('run_build',{});
   if(step===8){if(!seen[7].includes('PASS'))throw Error('build 3 said: '+seen[7].slice(0,400));return call('submit_plan',{referenceChoice:'Validated method',scenes:previous.scenes});}
   throw Error('unexpected step '+step+' after: '+seen.at(-1)?.slice(0,300));
  });
  const {store:s}=store();agentDependencies.store=s;agentDependencies.transport=transport;agentDependencies.readSkill=async()=>'method';
  const result=await writeMotionAgent({contract:6,jobId:randomUUID(),revision:1,script:'x',timing,previous,targets:['sB'],feedback:'Make scene B bolder'});
  expect(result.film.source).toContain('bolder 1');expect(result.film.source).toContain('final 0');expect(builds).toHaveLength(1);
 });
});
describe('explainArrivals',()=>{
 it('follows a late phrase from its VIS entry to the anchors that define it',()=>{
  const source=['T_G = max(TIS + .35 + .6, ws(52) + .4 + .6, 22.6)','TH0 = max(ws(54), T_G + .08)','TIS = ws(50) + .2','# ------------------------------------------------------------ sous-titres','VIS = {7: TG0, 8: TH0}'].join('\n');
  const text=explainArrivals(source,[8]);
  expect(text).toContain('VIS 8 = TH0');expect(text).toContain('TH0 = max(ws(54), T_G + .08) (line 2)');expect(text).toContain('T_G = max(TIS + .35 + .6, ws(52) + .4 + .6, 22.6) (line 1)');expect(text).toContain('TIS = ws(50) + .2 (line 3)');
 });
});
