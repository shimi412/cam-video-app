import {it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir,cp,rm} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {TimedComposition,timedExchangeAnswer} from '../src/lib/motion/exchange';
import {compileMotion} from '../src/lib/motion/worker';
import {writeMotion} from '../src/lib/motion/writer';
import {agentDependencies} from '../src/lib/agent/runtime';
import type {AgentStore,TurnState} from '../src/lib/agent/store';
import {digest} from '../src/lib/motion/model';
import {referenceFixture} from '../motion/runtime/fixture';
vi.mock('../src/lib/settings',()=>({getSetting:async()=> 'anthropic/claude-test'}));

it.each(['initial','repair'])('executes contract 5 %s through compilation, browser checks and a separate model review',async mode=>{
 const id=randomUUID(),dir=path.resolve('storage/motion',id),original={...agentDependencies};
 const states=new Map<string,{hash:string;state:TurnState}>();let writes=0,reviews=0;
 const store:AgentStore={lock:async(_id,fn)=>fn(),get:async(_s,id,hash)=>{const row=states.get(id);if(row){expect(row.hash).toBe(hash);return structuredClone(row.state);}return null;},put:async(_s,id,hash,state)=>{states.set(id,{hash,state:structuredClone(state)});},history:async()=>[],event:async()=>{},memories:async()=>[],propose:async()=>randomUUID()};
 vi.stubGlobal('fetch',async()=>{throw Error('External calls prohibited');});
 try{
  const fixture=await referenceFixture(),reference=await readFile('motion/reference/plot-hole-v4-safe.py','utf8');
  const film={...fixture.film,source:reference};await mkdir(dir,{recursive:true});await cp(fixture.voice,path.join(dir,'voix.wav'));
  // Derive fixture data from the real sandboxed reference, not hardcoded times.
  const built=await compileMotion(path.join(dir,'reference-fixture'),film,fixture.timing,fixture.voice,undefined,[],{compositionOnly:true});
  const soundCues=JSON.parse(await readFile(path.join(dir,'reference-fixture/marks.json'),'utf8'));
  const {stdout}=await promisify(execFile)('python3',['-c',`import ast,json
s=open('motion/reference/plot-hole-v4-safe.py').read()
n=next(n for n in ast.parse(s).body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id=='SUBS')
print(json.dumps([v[0] for v in ast.literal_eval(n.value)]))`]);
  // Arrival times mix measured numbers and the composition's own expression names;
  // derived cues (transitions, dur, logo_net) are omitted, film accents may be null.
  const cues=Object.fromEntries(Object.entries(soundCues).filter(([k])=>!['transitions','dur','logo_net'].includes(k)));
  const c=TimedComposition.parse({duration:built.audit.duration,body:reference.slice(reference.indexOf('scene("sA",'),reference.indexOf('# ------------------------------------------------------------ sous-titres')),subtitles:JSON.parse(stdout),visualTiming:fixture.timing.phrases.map((p:{phrase:number;start:number},i:number)=>({phrase:p.phrase,at:i===1?'TB0':i===3?'max(ws(19), TD0 + .05)':p.start+built.audit.offsets[i]})),soundCues:{...cues,counter:null},referenceChoice:film.referenceChoice,scenes:film.scenes,removedWords:film.removedWords});
  expect(TimedComposition.safeParse({...c,visualTiming:[{phrase:1,at:"'T_A'"}]}).success).toBe(false);
  expect(()=>timedExchangeAnswer({composition:{...c,visualTiming:c.visualTiming.slice(1)}})).toThrow('exactly one entry');
  expect(TimedComposition.safeParse({...c,visualTiming:"{'sA':'T_A'}"}).success).toBe(false);
  const good='fsB = fit(["REALLY?"], SW, 900, 125, 300)',bad='fsB = unknown_measure(["REALLY?"], SW, 900, 125, 300)';
  const failedFilm={...film,source:reference.replace(good,bad)};
  agentDependencies.store=store;
  agentDependencies.transport=async input=>{
   const envelope=JSON.parse((input.messages[0].content as {text:string}[])[0].text),request=JSON.parse(envelope.currentRequest);let answer;
   if(input.turn.startsWith('motion-creative-')){
    reviews++;answer={sourceSha256:request.sourceHash,verdict:'approve',scenes:request.targets.map((id:string)=>({id,requestSatisfied:true,integration:'Reference composition preserved.',motionEvidence:'The scene changes across sampled frames.',readable:true,brandConsistent:true})),issues:[],limitations:'Fixture verdict, not human aesthetic acceptance.'};
   }else{
    writes++;expect(writes).toBe(1);
    if(mode==='repair'){
     expect(input.minimumOutputTokens).toBe(1000);expect(input.remainingUsd).toBeCloseTo(.4);
     expect(request.repairSourceSha256).toBe(digest(failedFilm.source));
     expect(request.previous).toBeUndefined();
     answer={patch:{baseSha256:request.repairSourceSha256,edits:[{before:bad,after:good}]}};
    }else{expect(input.minimumOutputTokens).toBe(12000);answer={composition:c};}
   }
   return {actualUsd:.01,message:{role:'assistant',content:null,tool_calls:[{id:randomUUID(),type:'function',function:{name:'submit_plan',arguments:JSON.stringify(answer)}}]}};
  };
  const input={contract:5 as const,jobId:id,revision:0,script:fixture.script,timing:fixture.timing,targets:[],feedback:'',...(mode==='repair'?{repair:{attempt:1,error:'unknown_measure is not defined',failedFilm}}:{})};
  const result=await writeMotion(input);expect(writes).toBe(1);expect(reviews).toBe(1);
  expect(result.creativeApproval?.sourceHash).toBe(digest(result.film.source));expect(result.receipt.actualUsd).toBeCloseTo(.02);
  await writeMotion(input);expect(writes).toBe(1);expect(reviews).toBe(1);
 }finally{Object.assign(agentDependencies,original);vi.unstubAllGlobals();await rm(dir,{recursive:true,force:true});}
},180000);
