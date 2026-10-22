import {recoveryDependencies} from '../src/lib/agent/recovery-supervisor';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {reviewDelivery} from '../src/lib/agent/delivery-review';
import {settleCredits} from '../src/lib/customer-wallet';
vi.mock('../src/lib/agent/delivery-review',()=>({reviewDelivery:vi.fn(async()=>({ready:true}))}));
import {beforeEach,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {hash,boardHash,quoteHash,type ComicState,type Quote} from '../src/lib/comics/model';
const f=vi.hoisted(()=>({state:null as unknown,holds:0,dir:'/tmp/cam-comics-unit-no-media'}));
vi.mock('../src/lib/comics/store',()=>({getComic:async()=>structuredClone(f.state),saveComic:async(s:unknown)=>{f.state=structuredClone(s);},lockComic:async(_id:string,work:()=>Promise<unknown>)=>work(),holdComic:async()=>{f.holds++;},comicDirectory:()=>f.dir,createComic:vi.fn()}));
vi.mock('../src/lib/agent/observations',()=>({observeVideo:async()=>{}}));
vi.mock('../src/lib/customer-wallet',()=>({settleCredits:vi.fn(),CustomerPricingSchema:{parse:()=>({mode:'adaptive-v1',multiplier:2,higgsfieldCreditUsd:.1})}}));
vi.mock('../src/db',()=>({pool:{query:vi.fn(async()=>({rows:[],rowCount:0}))}}));
import {actComic,runComic,comicDependencies,type ComicDependencies} from '../src/lib/comics/service';
function state(){return f.state as ComicState;}
function quote(kind:Quote['kind']):Quote{return {id:randomUUID(),kind,items:{},credits:0,analysisUsd:0,costUsd:0,totalUsd:10,additionalUsd:0,expires:Date.now()+60000,inputHash:quoteHash(state(),kind)};}
const deps=():ComicDependencies=>({...comicDependencies,rework:async(_s,panel)=>({scene:`Reworked panel ${panel}`,action:'A slow pan.',preserve:'the table'}),inspect:async()=>({sha:'saved',description:'Fixture',sampledFrames:1,issues:[] as string[]}),authorize:async<T,>(_id:string,work:()=>Promise<T>)=>work(),direct:vi.fn(async s=>({plan:s.plan!,deferred:[]})),price:vi.fn(async(s,kind)=>({...quote(kind),inputHash:quoteHash(s,kind)}))});
beforeEach(()=>{recoveryDependencies.diagnose=vi.fn(async input=>({action:input.allowed.includes('replace-failed')?'replace-failed' as const:'needs-attention' as const,reason:'Inspect the saved failure; preserve all completed media.'}));f.holds=0;const panels=[1,2,3].map(id=>({id,narration:`Sentence ${id}.`,meaning:'Explain this idea.',scene:'A distinct flat comic object.',hero:'absent' as const,color:'red',title:'',action:'The object moves slowly.',camera:'Slow camera movement.',preserve:'Keep the whole composition.'}));f.state={version:1,id:randomUUID(),title:'Test',script:panels.map(p=>p.narration).join(' '),phase:'board',revision:0,queued:false,progress:'Review',plan:{panels},approvedQuotes:[],operations:{},notes:[],votes:{},approved:{},images:{1:'first.png',2:'second.png',3:'third.png'},clips:{},settings:{music:'normal',captions:true},targets:[]} satisfies ComicState;});
it('locking two notes preserves both and makes no direction/media call',async()=>{const d=deps();for(const n of [1,3])await actComic(state().id,'local',{type:'lock-feedback',id:randomUUID(),text:`Change panel ${n}`,targets:[n],stage:'board'},d);expect(state().notes).toHaveLength(2);expect(d.direct).not.toHaveBeenCalled();expect(state().queued).toBe(false);});
it('one batch scopes two changes, prices once, and leaves original images until approval',async()=>{const d=deps();for(const n of [1,3])await actComic(state().id,'local',{type:'lock-feedback',id:randomUUID(),text:'Change camera only',targets:[n],stage:'board'},d);d.direct=vi.fn(async s=>{const plan=structuredClone(s.plan!);for(const p of plan.panels)if(p.id!==2)p.camera='Slow camera pushes in.';return {plan,deferred:[]};});await actComic(state().id,'local',{type:'apply-feedback'},d);expect(state().targets).toEqual([1,3]);expect(state().plan!.panels[0].camera).toBe('Slow camera movement.');expect(state().notes.every(n=>n.status==='locked')).toBe(true);expect(d.direct).toHaveBeenCalledTimes(1);await actComic(state().id,'local',{type:'apply-feedback'},d);expect(d.direct).toHaveBeenCalledTimes(1);const q=state().quote!;await actComic(state().id,'local',{type:'approve-price',quoteId:q.id},d);await actComic(state().id,'local',{type:'approve-price',quoteId:q.id},d);expect(f.holds).toBe(1);await runComic(state().id,'local',d);expect(state().phase).toBe('board');expect(state().revision).toBe(1);expect(state().images).toEqual({1:'first.png',2:'second.png',3:'third.png'});expect(state().notes.every(n=>n.status==='applied')).toBe(true);expect(state().votes[1]).toBe(false);expect(state().plan!.panels[1].camera).toBe('Slow camera movement.');});
it('defers finishing feedback without requiring withdrawal or blocking visual approval',async()=>{const d=deps(),id=randomUUID();Object.assign(state(),{phase:'visuals',mediaHash:'complete-film'});await actComic(state().id,'local',{type:'lock-feedback',id,text:'Soften the ending transition',targets:[3],stage:'visuals'},d);d.direct=async s=>({plan:s.plan!,deferred:[id]});await actComic(state().id,'local',{type:'apply-feedback'},d);expect(state().notes[0].status).toBe('deferred');await actComic(state().id,'local',{type:'approve-visuals',mediaHash:'complete-film'},d);expect(state().phase).toBe('finishing');expect(state().notes[0].text).toBe('Soften the ending transition');});
it('binds storyboard approval and price to the current images',async()=>{const d=deps(),old=boardHash(state());state().images[2]='replaced.png';await expect(actComic(state().id,'local',{type:'approve-board',boardHash:old,votes:{1:true,2:true,3:true}},d)).rejects.toThrow('current');expect(d.price).not.toHaveBeenCalled();state().quote=quote('prepare');const q=state().quote!;state().plan!.panels[0].scene='Different object on the page.';await expect(actComic(state().id,'local',{type:'approve-price',quoteId:q.id},d)).rejects.toThrow('current price');expect(f.holds).toBe(0);});
it('persists a blocking quality failure and keeps completed clips for local resume',async()=>{const d=deps();Object.assign(state(),{phase:'working',work:'video',queued:true,clips:{1:'a.mp4',2:'b.mp4',3:'c.mp4'}});state().approved.board=boardHash(state());state().approvedQuotes=[quote('video')];d.build=vi.fn(async()=>{throw Error('Quality checks need correction: unsafe text.');});d.gateway={cost:vi.fn(),media:vi.fn()};await runComic(state().id,'local',d);expect(state().phase).toBe('blocked');expect(state().error).toContain('unsafe text');expect(state().clips).toEqual({1:'a.mp4',2:'b.mp4',3:'c.mp4'});expect(d.gateway.media).not.toHaveBeenCalled();await actComic(state().id,'local',{type:'resume'},d);expect(state().queued).toBe(false);await runComic(state().id,'local',d);expect(d.build).toHaveBeenCalledTimes(1);expect(d.gateway.media).not.toHaveBeenCalled();});
it('refuses to resubmit an ambiguous paid operation after restart',async()=>{const d=deps();Object.assign(state(),{phase:'blocked',work:'video',operations:{'clip-1-0':{state:'sending',fingerprint:hash('x'),quotedCredits:4}}});await actComic(state().id,'local',{type:'resume'},d);expect(recoveryDependencies.diagnose).toHaveBeenCalledTimes(1);expect(state().queued).toBe(false);});
it('does not mark unsupported finishing feedback as applied',async()=>{const d=deps(),id=randomUUID();Object.assign(state(),{phase:'finishing',notes:[{id,text:'Replace the narrator with a new voice',targets:[1,2,3],stage:'finishing',status:'deferred'}]});d.finishing=async s=>({settings:s.settings,applied:[],unresolved:[{id,reason:'A new recording needs a separately approved price.'}]});await actComic(state().id,'local',{type:'apply-feedback'},d);expect(state().notes[0].status).toBe('deferred');expect(state().queued).toBe(false);expect(state().unresolved).toHaveLength(1);});
it('isolates a failed clip while completing the other approved requests',async()=>{const d=deps();Object.assign(state(),{phase:'working',work:'video',queued:true,timing:{duration:9,estimated:false,words:[],phrases:[1,2,3].map(phrase=>({phrase,text:`Sentence ${phrase}.`,start:(phrase-1)*3,end:phrase*3}))}});for(const n of [1,2,3])state().operations[`image-${n}-0`]={fingerprint:'saved',state:'complete',requestId:`image-${n}`,file:state().images[n],quotedCredits:1};state().approved.board=boardHash(state());state().approvedQuotes=[{...quote('video'),items:{'clip-1-0':4,'clip-2-0':4,'clip-3-0':4}}];d.gateway={cost:vi.fn(),media:vi.fn(async(s,r,allowance,save)=>{s.operations[r.key]={fingerprint:hash(r),state:r.key==='clip-2-0'?'failed':'complete',requestId:r.key,quotedCredits:allowance,file:`${r.key}.mp4`};await save();if(r.key==='clip-2-0')throw Error('Confirmed failure');return {file:`${r.key}.mp4`,requestId:r.key};})};await runComic(state().id,'local',d);expect(d.gateway.media).toHaveBeenCalledTimes(3);expect(state().operations['clip-1-0'].state).toBe('complete');expect(state().operations['clip-3-0'].state).toBe('complete');expect(state().phase).toBe('blocked');expect(state().approved.final).toBeUndefined();expect(Object.keys(state().clips)).toEqual(['1','3']);await actComic(state().id,'local',{type:'replacement-price'},d);expect(state().phase).toBe('video-price');expect(state().revision).toBe(1);expect(state().clips[1]).toBe('clip-1-0.mp4');expect(state().operations['clip-2-0'].state).toBe('failed');});
it('refreshes an expired offer without re-planning or submitting media',async()=>{const d=deps();state().phase='preparation-price';state().quote={...quote('prepare'),expires:Date.now()-1000};const old=state().quote!.id;await actComic(state().id,'local',{type:'refresh-price'},d);expect(state().quote!.id).not.toBe(old);expect(state().quote!.expires).toBeGreaterThan(Date.now());expect(d.direct).not.toHaveBeenCalled();expect(f.holds).toBe(0);expect(state().queued).toBe(false);});

it('releases the approved final film even when Claude objects, keeping its notes',async()=>{
 f.dir=await mkdtemp(path.join(os.tmpdir(),'comics-release-'));
 try{
  vi.mocked(settleCredits).mockClear();const bytes=Buffer.from('exact final comic film');await writeFile(path.join(f.dir,'final.mp4'),bytes);
  const note={id:randomUUID(),text:'Check the ending',stage:'finishing' as const,status:'deferred' as const,targets:[3]};
  Object.assign(state(),{phase:'finishing',media:'final.mp4',mediaHash:hash(bytes.toString('base64')),approved:{visuals:'previous'},notes:[note]});
  vi.mocked(reviewDelivery).mockRejectedValueOnce(Error('Final review: requested ending correction is unresolved.'));
  await actComic(state().id,'local',{type:'approve-final',mediaHash:state().mediaHash,resolved:[note.id]},deps());
  expect(state().phase).toBe('complete');expect(state().deliveryNotes).toBe('requested ending correction is unresolved.');expect(settleCredits).toHaveBeenCalledTimes(1);
  // A review service outage is not a verdict: the approval stays pending and nothing is settled.
  Object.assign(state(),{phase:'finishing',approved:{visuals:'previous'}});vi.mocked(settleCredits).mockClear();
  vi.mocked(reviewDelivery).mockRejectedValueOnce(Error('Agent connection failed (HTTP 400)'));
  await expect(actComic(state().id,'local',{type:'approve-final',mediaHash:state().mediaHash,resolved:[]},deps())).rejects.toThrow('HTTP 400');expect(settleCredits).not.toHaveBeenCalled();
 }finally{await rm(f.dir,{recursive:true,force:true});f.dir='/tmp/cam-comics-unit-no-media';}
});
it('retries already-approved work after the quote expiry without asking for a new price',async()=>{
 const d=deps();Object.assign(state(),{phase:'blocked',work:'prepare',error:'Offline interruption.'});state().approvedQuotes=[{...quote('prepare'),expires:Date.now()-1000}];
 recoveryDependencies.diagnose=vi.fn(async input=>{expect(input.allowed).toContain('retry-saved');expect(input.allowed).not.toContain('review-budget');return {action:'retry-saved' as const,reason:'Retry the approved preparation from its saved receipts.'};});
 await actComic(state().id,'local',{type:'resume'},d);expect(state().queued).toBe(true);expect(f.holds).toBe(0);
});
it('a changed supplier price stops at a typed price review with no paid diagnosis',async()=>{
 const d=deps();Object.assign(state(),{phase:'working',work:'prepare',queued:true,images:{},plan:state().plan});state().approvedQuotes=[quote('prepare')];
 const {ComicStop}=await import('../src/lib/comics/errors');
 d.gateway={cost:vi.fn(),media:vi.fn(async()=>{throw new ComicStop('review-budget','The media price changed since your approval.');})};
 await runComic(state().id,'local',d);expect(recoveryDependencies.diagnose).not.toHaveBeenCalled();expect(state().phase).toBe('blocked');expect(state().stop?.kind).toBe('review-budget');
 await actComic(state().id,'local',{type:'recovery-price'},d);expect(state().phase).toBe('preparation-price');expect(state().stop).toBeUndefined();expect(f.holds).toBe(0);
});
function prepareRun(d:ComicDependencies,keys:string[]){
 Object.assign(state(),{phase:'working',work:'prepare',queued:true,images:{}});state().approvedQuotes=[quote('prepare')];
 d.gateway={cost:vi.fn(),media:vi.fn(async(s,r,allowance,save)=>{const done=s.operations[r.key];if(done?.state==='complete')return {file:done.file!,requestId:done.requestId!};keys.push(r.key);s.operations[r.key]={fingerprint:hash(r),state:'complete',requestId:r.key,quotedCredits:allowance??0,file:`${r.key}.${r.extension}`};await save();return {file:`${r.key}.${r.extension}`,requestId:r.key};})};
}
const alignedTiming=()=>({duration:9,estimated:false,words:[],phrases:[1,2,3].map(phrase=>({phrase,text:`Sentence ${phrase}.`,start:(phrase-1)*3,end:phrase*3}))});
it('aligns the recording before any image is submitted; a mismatch stops before image spend, with no paid diagnosis',async()=>{
 const d=deps(),keys:string[]=[];prepareRun(d,keys);
 const {ComicStop}=await import('../src/lib/comics/errors');
 d.align=vi.fn(async()=>{throw new ComicStop('needs-attention','The narration recording does not match your script word for word. No image was generated.');});
 await runComic(state().id,'local',d);
 expect(keys).toEqual(['voice-0']);expect(state().phase).toBe('blocked');expect(state().stop?.kind).toBe('needs-attention');expect(recoveryDependencies.diagnose).not.toHaveBeenCalled();
 const {publicComic}=await import('../src/lib/comics/model');expect(publicComic(state()).error).toContain('No image was generated');
});
it('keeps every storyboard image and its timing when the automatic inspection reports issues',async()=>{
 const d=deps(),keys:string[]=[];prepareRun(d,keys);
 d.align=vi.fn(async()=>({voice:'/tmp/cam-comics-unit-no-media/voice/voix.wav',timing:alignedTiming(),audioReview:{endingNeedsListening:true,tailPaddingSeconds:.2}}));
 d.inspect=vi.fn(async(_s,panel)=>({sha:'s',description:'Seen',sampledFrames:1,issues:panel===2?['Generated lettering on the poster.']:[]}));
 await runComic(state().id,'local',d);
 expect(keys[0]).toBe('voice-0');expect(keys.slice(1)).toEqual(['sheet-0','image-1-0','image-2-0','image-3-0']);
 expect(state().phase).toBe('board');expect(Object.keys(state().images)).toEqual(['1','2','3']);expect(state().timing?.phrases).toHaveLength(3);
 const {publicComic}=await import('../src/lib/comics/model');const v=publicComic(state());expect(v.panels![1].reviewNotes).toEqual(['Image: Generated lettering on the poster.']);expect(v.panels![0].reviewNotes).toEqual([]);
 // The inspection is cached by file: a later run does not pay it again.
 expect(d.inspect).toHaveBeenCalledTimes(3);
});
it('a refused clip is reworked by the director and resubmitted under the same quote; the third refusal offers the replacement price (Shimi, 2026-10-22)',async()=>{
 const d=deps();Object.assign(state(),{phase:'working',work:'video',queued:true,timing:alignedTiming()});for(const n of [1,2,3])state().operations[`image-${n}-0`]={fingerprint:'saved',state:'complete',requestId:`image-${n}`,file:state().images[n],quotedCredits:1};state().approved.board=boardHash(state());state().approvedQuotes=[{...quote('video'),items:{'clip-1-0':4,'clip-2-0':4,'clip-3-0':4}}];
 const {MediaFailed}=await import('../src/lib/comics/errors');
 d.inspect=vi.fn(async()=>({sha:'s',description:'Seen',sampledFrames:3,issues:['An extra star appears.']}));
 const reworks:{panel:number;reason:string;kind:string}[]=[];d.rework=vi.fn(async(_s,panel,reason,kind)=>{reworks.push({panel,reason,kind});return {scene:`Calm reworked panel ${panel}`,action:'A slow pan.',preserve:'the table'};});
 const refuse=new Set(['clip-2-0','clip-2-0-rw1','clip-2-0-rw2']);
 d.gateway={cost:vi.fn(),media:vi.fn(async(s,r,allowance,save)=>{if(refuse.has(r.key)){s.operations[r.key]={fingerprint:hash(r),state:'failed',requestId:r.key,quotedCredits:allowance,error:'The media service refused this request: nsfw'};await save();throw new MediaFailed(r.key,'refused');}s.operations[r.key]={fingerprint:hash(r),state:'complete',requestId:r.key,quotedCredits:allowance,file:`${r.key}.mp4`};await save();return {file:`${r.key}.mp4`,requestId:r.key};})};
 await runComic(state().id,'local',d);
 expect(reworks).toEqual([{panel:2,reason:'The media service refused this request: nsfw',kind:'clip'}]);expect(state().queued).toBe(true);expect(state().stop).toBeUndefined();expect(state().reworkedPanels?.[2]?.scene).toContain('Calm reworked');
 await runComic(state().id,'local',d);
 const media=d.gateway.media as ReturnType<typeof vi.fn>;const calls=media.mock.calls.map(c=>(c[1] as {key:string}).key);expect(calls).toContain('clip-2-0-rw1');expect(media.mock.calls.find(c=>(c[1] as {key:string}).key==='clip-2-0-rw1')?.[2]).toBe(4);
 expect(reworks).toHaveLength(2);await runComic(state().id,'local',d);
 expect(recoveryDependencies.diagnose).not.toHaveBeenCalled();expect(state().stop?.kind).toBe('replace-failed');expect(state().clips).toEqual({1:'clip-1-0.mp4',3:'clip-3-0.mp4'});
 const {publicComic}=await import('../src/lib/comics/model');expect(publicComic(state()).canReplace).toBe(true);
 await actComic(state().id,'local',{type:'replacement-price'},d);expect(recoveryDependencies.diagnose).not.toHaveBeenCalled();expect(state().phase).toBe('video-price');expect(state().stop).toBeUndefined();
});
it('waits out a transient service refusal on a timer, then hands repeated ones to the supervisor',async()=>{
 const d=deps();Object.assign(state(),{phase:'working',work:'video',queued:true,clips:{1:'a.mp4',2:'b.mp4',3:'c.mp4'}});state().approved.board=boardHash(state());state().approvedQuotes=[quote('video')];
 const {AIHttpTransient}=await import('../src/lib/agent/transport');
 d.build=vi.fn(async()=>{throw new AIHttpTransient(429,'busy');});d.gateway={cost:vi.fn(),media:vi.fn()};
 await runComic(state().id,'local',d);expect(recoveryDependencies.diagnose).not.toHaveBeenCalled();expect(state().queued).toBe(true);expect(state().transientRetries).toBe(1);expect(state().recovery!.nextAt).toBeGreaterThan(Date.now());
 await runComic(state().id,'local',d);expect(d.build).toHaveBeenCalledTimes(1);// not before its time
 for(let i=0;i<5;i++){state().recovery!.nextAt=0;await runComic(state().id,'local',d);}
 expect(state().transientRetries).toBe(5);expect(recoveryDependencies.diagnose).toHaveBeenCalledTimes(1);
});
