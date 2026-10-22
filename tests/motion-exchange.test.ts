import {it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir,cp,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import path from 'node:path';
import type {AgentStore,TurnState} from '../src/lib/agent/store';
import {agentDependencies} from '../src/lib/agent/runtime';
import {writeMotion} from '../src/lib/motion/writer';
import {MotionComposition,compositionFilm} from '../src/lib/motion/exchange';
import {digest} from '../src/lib/motion/model';
import {referenceFixture} from '../motion/runtime/fixture';
vi.mock('../src/lib/settings',()=>({getSetting:async()=> 'anthropic/claude-test'}));
it.each(['initial','revision','creative-initial','creative-revision'])('executes the %s structured contract with the real compiler and browser, without paid calls',async mode=>{
 const revision=mode.endsWith('revision');
 const id=randomUUID(),dir=path.resolve('storage/motion',id),original={...agentDependencies},states=new Map<string,{hash:string;state:TurnState}>();let calls=0;
 const store:AgentStore={lock:async(_id,fn)=>fn(),get:async(_s,id,hash)=>{const row=states.get(id);if(row){expect(row.hash).toBe(hash);return structuredClone(row.state);}return null;},put:async(_s,id,hash,state)=>{states.set(id,{hash,state:structuredClone(state)});},history:async()=>[],event:async()=>{},memories:async()=>[],propose:async()=>randomUUID()};
 vi.stubGlobal('fetch',async()=>{throw Error('No external network in regression');});
 try{
  const fixture=await referenceFixture();await mkdir(dir,{recursive:true});await cp(fixture.voice,path.join(dir,'voix.wav'));
  // Independently turn the known reference into a model-shaped response. The
  // response contains no required technical boundary comments or runtime code.
  const {stdout}=await promisify(execFile)('python3',['-c',`import ast,json
s=open('motion/reference/plot-hole-v4-safe.py').read();tree=ast.parse(s);config={}
for n in tree.body:
 if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ['SUBS','VIS','DUR']: config[n.targets[0].id]=n.value
 if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and ast.unparse(n.value.func)=='json.dump': config['MARKS']=n.value.args[0]
a=s.index('scene("sA",');b=s.index('# ------------------------------------------------------------ sous-titres')
print(json.dumps(dict(body=s[a:b],duration=ast.literal_eval(config['DUR']),subtitles=[v[0] for v in ast.literal_eval(config['SUBS'])],visualTiming=ast.unparse(config['VIS']),soundCues=ast.unparse(config['MARKS']))))`]);
  const metadata={scenes:fixture.film.scenes,referenceChoice:fixture.film.referenceChoice,removedWords:fixture.film.removedWords};
  const composition=MotionComposition.parse({...metadata,...JSON.parse(stdout)});
  const good='fsB = fit(["REALLY?"], SW, 900, 125, 300)',bad='fsB = unknown_measure(["REALLY?"], SW, 900, 125, 300)';
  const structured={...composition,body:composition.body.replace(good,bad)};
  const previous={...fixture.film,source:await readFile('motion/reference/plot-hole-v4-safe.py','utf8')};
  const patch={baseSha256:digest(previous.source),edits:[{before:good,after:'fsB = fit(["REALLY?"], SW, 900, 125, 290)'}]};
  agentDependencies.store=store;agentDependencies.transport=async input=>{
   calls++;let answer;
   if(input.turn.startsWith('motion-creative-')){
    const envelope=JSON.parse((input.messages[0].content as {text:string}[])[0].text),request=JSON.parse(envelope.currentRequest);
    expect((input.messages[0].content as {type:string}[]).filter(p=>p.type==='image_url')).toHaveLength(revision?3:5);
    if(revision)expect(request.direction.integration).toContain('existing');
    return {actualUsd:.01,message:{role:'assistant',content:null,tool_calls:[{id:'visual-review',type:'function',function:{name:'submit_plan',arguments:JSON.stringify({sourceSha256:request.sourceHash,verdict:revision?'revise':'approve',scenes:request.targets.map((id:string)=>({id,requestSatisfied:!revision,integration:'The change is technically valid but does not achieve the visual request.',motionEvidence:'The sampled frames preserve the same unchanged emphasis.',readable:true,brandConsistent:true})),issues:revision?[{sceneId:'sB',observation:'The requested hierarchy change is not visible enough.',correction:'Recompose the word hierarchy within this scene and preserve its transition.'}]:[],limitations:'Frame samples do not prove smooth playback.'})}}]}};
   }
   if(revision){
    expect(input.system).toContain('REVISION submit ONLY');
    // Reject an out-of-scope change without poisoning the candidate base.
    answer=calls===1?{patch:{...patch,edits:[{before:'scene("sA", NAVY)',after:'scene("sA", CR)'}]}}:{patch};
    if(calls===2)expect(input.messages.at(-1)?.content).toContain('Candidate unchanged');
   }else{
    answer=calls===1?{composition:structured}:{patch:{baseSha256:digest(compositionFilm(structured).source),edits:[{before:bad,after:good}]}};
    if(calls===2)expect(input.messages.at(-1)?.content).toContain('unknown_measure');
   }
   if(mode==='creative-revision')answer={...answer,direction:{request:'Slightly reduce the word in this scene.',integration:'Keep the existing composition and its visual hierarchy.',movement:'Preserve the current entry and outgoing transition.',preserve:'All other scenes and narration remain unchanged.',proofs:[{sceneId:'sB',visibleResult:'The word is smaller while its underline stays readable.'}]}};
   if(calls>2)throw Error('Unexpected paid retry');
   return {actualUsd:.01,message:{role:'assistant',content:null,tool_calls:[{id:`call-${calls}`,type:'function',function:{name:'submit_plan',arguments:JSON.stringify(answer)}}]}};
  };
  const work=()=>writeMotion({contract:mode.startsWith('creative')?4:3,jobId:id,revision:revision?1:0,script:fixture.script,timing:fixture.timing,targets:revision?['sB']:[],feedback:revision?'Slightly reduce REALLY size':'',...(revision?{previous}:{})});
  if(mode==='creative-revision'){
   // Consultative review: a revise verdict is persisted with the film, not a failure.
   const revised=await work();expect(calls).toBe(3);expect(revised.creativeApproval?.verdict).toBe('revise');expect(revised.creativeApproval?.issues?.[0]?.sceneId).toBe('sB');expect(revised.creativeApproval?.sourceHash).toBe(digest(revised.film.source));
   // The same saved candidate and review survive a retry without a new model call.
   const again=await work();expect(calls).toBe(3);expect(again.creativeApproval).toEqual(revised.creativeApproval);return;
  }
  const result=await work();
  expect(calls).toBe(mode==='creative-initial'?3:2);expect(result.receipt.actualUsd).toBeCloseTo(mode==='creative-initial'?.03:.02);if(mode==='creative-initial')expect(result.creativeApproval?.sourceHash).toBe(digest(result.film.source));expect([...states.values()][0].state.complete).toBe(true);
 }finally{Object.assign(agentDependencies,original);vi.unstubAllGlobals();await rm(dir,{recursive:true,force:true});}
},180000);
