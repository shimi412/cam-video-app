/** Attack single journey (Shimi, 2026-10-23): one estimate, a complete V1 with no intermediate gate,
 * feedback on the complete version, a revision quote by the common grid, approval, download.
 * Store, database, wallet and every paid boundary are injected; no provider is contacted. */
import {recoveryDependencies} from '../src/lib/agent/recovery-supervisor';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {settleCredits} from '../src/lib/customer-wallet';
vi.mock('../src/lib/agent/delivery-review',()=>({reviewDelivery:vi.fn(async()=>({ready:true}))}));
import {beforeEach,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {hash,quoteHash,publicComic,estimatedMinutes,type ComicState} from '../src/lib/comics/model';
const f=vi.hoisted(()=>({state:null as unknown,holds:[] as number[],dir:'',pricing:{mode:'tiers-v2',multiplier:2,higgsfieldCreditUsd:.1}}));
vi.mock('../src/lib/comics/store',()=>({getComic:async()=>structuredClone(f.state),saveComic:async(s:unknown)=>{f.state=structuredClone(s);},lockComic:async(_id:string,work:()=>Promise<unknown>)=>work(),holdComic:async(_s:unknown,q:{totalUsd:number})=>{f.holds.push(q.totalUsd);},comicDirectory:()=>f.dir,createComic:vi.fn(async()=>structuredClone(f.state))}));
vi.mock('../src/lib/agent/observations',()=>({observeVideo:async()=>{}}));
vi.mock('../src/lib/customer-wallet',()=>({settleCredits:vi.fn(),CustomerPricingSchema:{parse:()=>f.pricing}}));
vi.mock('../src/db',()=>({pool:{query:vi.fn(async(sql:string)=>sql.includes('customer_pricing')?{rows:[{value:f.pricing}]}:sql.includes('api_calls')?{rows:[{cost:0.2}]}:{rows:[],rowCount:0})}}));
import {prepareComic,actComic,runComic,comicDependencies,type ComicDependencies} from '../src/lib/comics/service';
import {priceComic,mediaRequests,allowanceFor,estimatedClipSeconds} from '../src/lib/comics/pricing';
import {MediaFailed} from '../src/lib/comics/errors';
const state=()=>f.state as ComicState;
const panels=[1,2,3].map(id=>({id,narration:`Sentence number ${id} of the film.`,meaning:'Explain this idea.',scene:`A distinct flat comic object ${id}.`,hero:'absent' as const,color:'red',title:'',action:'The object moves slowly.',camera:'Slow camera movement.',preserve:'Keep the whole composition.'}));
const timing=()=>({duration:9,estimated:false,words:[],phrases:[1,2,3].map(phrase=>({phrase,text:panels[phrase-1].narration,start:(phrase-1)*3,end:phrase*3}))});
function fresh():ComicState{return {version:1,journey:'single',id:randomUUID(),title:'Single',script:panels.map(p=>p.narration).join(' '),phase:'planning',revision:0,queued:false,progress:'',approvedQuotes:[],operations:{},notes:[],votes:{},approved:{},images:{},clips:{},settings:{music:'normal',captions:true},targets:[]};}
let builds=0;
const deps=():ComicDependencies=>({...comicDependencies,price:priceComic,preflight:vi.fn(async()=>{}),authorize:async<T,>(_id:string,work:()=>Promise<T>)=>work(),
 direct:vi.fn(async s=>({plan:s.plan??{panels},deferred:[]})),finishing:vi.fn(async s=>({settings:s.settings,applied:[],unresolved:[]})),
 rework:vi.fn(async(_s,panel)=>({scene:`Calm reworked panel ${panel}`,action:'A slow pan.',preserve:'the table'})),
 inspect:vi.fn(async(_s,panel)=>({sha:'s',description:'Seen',sampledFrames:1,issues:panel===2?['A clock reads 12:69.']:[]})),
 align:vi.fn(async dir=>({voice:path.join(dir,'voice.wav'),timing:timing(),audioReview:{endingNeedsListening:false,tailPaddingSeconds:0}})),
 gateway:{cost:vi.fn(async r=>r.tool==='generate_video'?4:r.tool==='generate_audio'?1:2),media:vi.fn(async(s,r,allowance,save)=>{const done=s.operations[r.key];if(done?.state==='complete')return {file:done.file!,requestId:done.requestId!};if(!Number.isFinite(allowance))throw Error(`No allowance for ${r.key}`);s.operations[r.key]={fingerprint:hash(r),state:'complete',requestId:`id-${r.key}`,quotedCredits:allowance,file:`${r.key}.${r.extension}`,sentAt:Date.now()};await save();return {file:`${r.key}.${r.extension}`,requestId:`id-${r.key}`};})},
 build:vi.fn(async s=>{builds++;const media=`render-${builds}/final.mp4`;await writeFile(path.join(f.dir,`final-${builds}.mp4`),`film ${builds} music ${s.settings.music} plan ${hash(s.plan)}`);return {media:`final-${builds}.mp4`,checks:{durations:true,safeZones:[],flashCandidates:[],mixLufs:-16,sfxBelowVoiceDb:18,logo:true,duration:9},fallbacks:[],note:media};})});
const keys=(d:ComicDependencies)=>(d.gateway.media as ReturnType<typeof vi.fn>).mock.calls.map(c=>(c[1] as {key:string}).key);
beforeEach(async()=>{f.dir=await mkdtemp(path.join(os.tmpdir(),'comics-single-'));f.state=fresh();f.holds=[];builds=0;vi.mocked(settleCredits).mockClear();recoveryDependencies.diagnose=vi.fn(async()=>({action:'needs-attention' as const,reason:'Unexpected supervisor call in the single journey.'}));});
afterAll(async()=>{await rm(f.dir,{recursive:true,force:true});});

it('estimates the whole first version at Start: delay from the panel count, price by the grid, every clip priced through the gateway',async()=>{
 const d=deps();const v=(await prepareComic('local',{requestId:state().id,title:'Single',script:state().script},d))!;
 expect(d.preflight).toHaveBeenCalledTimes(1);expect(d.direct).toHaveBeenCalledTimes(1);
 expect(v.phase).toBe('estimate');expect(v.journey).toBe('single');expect(v.estimateMinutes).toBe(estimatedMinutes(3));expect(estimatedMinutes(10)).toBe(45);
 const q=state().quote!;expect(q.kind).toBe('film');expect(Object.keys(q.items)).toEqual(['voice-0','sheet-0','image-1-0','image-2-0','image-3-0','clip-1-0','clip-2-0','clip-3-0']);
 // 1 + 2 + 3x2 + 3x4 = 21 credits at $0.10, 6 inspections at $0.25, $0.50 direction allowance: $4.10 estimated, first tier.
 expect(q.credits).toBe(21);expect(q.additionalCostUsd).toBeCloseTo(4.1,6);expect(q.totalUsd).toBe(30);expect(q.additionalUsd).toBe(30);
 expect(estimatedClipSeconds('one two three four five six seven')).toBe(4);
 // The clip estimate never reaches the provider: the worker skips a clip whose image does not exist yet.
 expect(mediaRequests(state(),'film').map(r=>r.key)).toEqual(['voice-0','sheet-0','image-1-0','image-2-0','image-3-0']);
 expect(keys(d)).toEqual([]);expect(f.holds).toEqual([]);
 // Idempotent re-entry returns the saved estimate without a second direction.
 await prepareComic('local',{requestId:state().id,title:'Single',script:state().script},d);expect(d.direct).toHaveBeenCalledTimes(1);
});
it('the grid applies to new Attack films whatever the admin pricing mode; a crossed tier is $40 then $50',async()=>{
 f.pricing={mode:'adaptive-v1',multiplier:2,higgsfieldCreditUsd:.1};const d=deps();await prepareComic('local',{requestId:state().id,title:'Single',script:state().script},d);expect(state().quote!.totalUsd).toBe(30);
 f.pricing={mode:'tiers-v2',multiplier:2,higgsfieldCreditUsd:1};state().quote=undefined;expect((await priceComic(state(),'film',d.gateway)).totalUsd).toBe(40);
 f.pricing={mode:'tiers-v2',multiplier:2,higgsfieldCreditUsd:2};expect((await priceComic(state(),'film',d.gateway)).totalUsd).toBe(50);
 f.pricing={mode:'tiers-v2',multiplier:2,higgsfieldCreditUsd:.1};
});
async function produceV1(d:ComicDependencies){
 await prepareComic('local',{requestId:state().id,title:'Single',script:state().script},d);
 await actComic(state().id,'local',{type:'approve-price',quoteId:state().quote!.id},d);
 expect(state().work).toBe('film');expect(state().queued).toBe(true);expect(f.holds).toEqual([30]);
 await runComic(state().id,'local',d);
}
it('produces the complete first version with no human gate: voice, alignment, sheet, images, inspections, clips, build, review',async()=>{
 const d=deps();await produceV1(d);
 const s=state();expect(s.phase).toBe('review');expect(s.filmVersion).toBe(1);expect(s.queued).toBe(false);expect(s.quote).toBeUndefined();
 expect(keys(d)).toEqual(['voice-0','sheet-0','image-1-0','image-2-0','image-3-0','clip-1-0','clip-2-0','clip-3-0']);
 expect(d.align).toHaveBeenCalledTimes(1);expect(d.inspect).toHaveBeenCalledTimes(6);expect(d.build).toHaveBeenCalledTimes(1);
 expect(s.settings).toEqual({music:'normal',captions:true});expect(s.media).toBe('final-1.mp4');expect(s.mediaHash).toBeDefined();
 expect(recoveryDependencies.diagnose).not.toHaveBeenCalled();
 const v=publicComic(s);expect(v.version).toBe(1);expect(v.preview).toContain('final-1.mp4');expect(v.download).toBeNull();expect(v.panels![1].reviewNotes).toEqual(['Image: A clock reads 12:69.','Scene: A clock reads 12:69.']);
 // Every spend stayed inside the approved estimate, by its own line.
 const q=s.approvedQuotes[0];for(const [key,op] of Object.entries(s.operations))expect(op.quotedCredits).toBeLessThanOrEqual(allowanceFor(s,q,key)!);
});
it('shares the approved estimate as one pool: a clip a little longer than its estimate is still inside the approved total',async()=>{
 const d=deps();await produceV1(d);const s=state(),q=s.approvedQuotes[0];
 expect(allowanceFor(s,q,'clip-1-0')).toBe(4);// nothing left in the pool once every line is spent as quoted
 s.operations['clip-2-0'].quotedCredits=3;expect(allowanceFor(s,q,'clip-1-0')).toBe(5);// one unspent credit flows to another line
 s.operations['clip-3-0'].quotedCredits=6;expect(allowanceFor(s,q,'clip-1-0')).toBe(4);// an overrun consumes it
 expect(allowanceFor(s,q,'clip-1-0-rw1')).toBe(4);// a rework runs under the line it replaces
 expect(allowanceFor({...s,journey:undefined},q,'clip-1-0')).toBe(4);
});
it('a feedback batch on the complete version quotes only the additional price, then produces the next version unattended',async()=>{
 const d=deps();await produceV1(d);const first=state().mediaHash,noteId=randomUUID();
 await actComic(state().id,'local',{type:'lock-feedback',id:noteId,text:'Redraw this panel with a calmer object.',targets:[2],stage:'visuals'},d);
 expect(state().notes[0].status).toBe('locked');expect(d.direct).toHaveBeenCalledTimes(1);
 d.direct=vi.fn(async s=>{const plan=structuredClone(s.plan!);plan.panels[1].scene='A calm flat comic object on a table.';return {plan,deferred:[]};});
 await actComic(state().id,'local',{type:'apply-feedback'},d);
 let s=state();expect(s.targets).toEqual([2]);expect(s.proposal!.panels[1].scene).toContain('calm');expect(s.plan!.panels[1].scene).toBe('A distinct flat comic object 2.');
 const q=s.quote!;expect(q.kind).toBe('revision');expect(Object.keys(q.items).map(k=>k.replace(/-[0-9a-f]{8}$/,''))).toEqual(['image-2-1','clip-2-1']);
 // 2 + 4 credits at $0.10, two inspections, $0.50 direction: $1.60 x 2 = $3.20 -> $4 additional; total $34.
 expect(q.additionalCostUsd).toBeCloseTo(1.6,6);expect(q.additionalUsd).toBe(4);expect(q.totalUsd).toBe(34);
 expect(keys(d)).toHaveLength(8);// nothing generated before approval
 await actComic(state().id,'local',{type:'approve-price',quoteId:q.id},d);expect(f.holds).toEqual([30,34]);expect(state().work).toBe('revision');
 await runComic(state().id,'local',d);
 s=state();expect(s.phase).toBe('review');expect(s.filmVersion).toBe(2);expect(s.revision).toBe(1);expect(s.proposal).toBeUndefined();expect(s.plan!.panels[1].scene).toContain('calm');
 const added=keys(d).slice(8);expect(added.map(k=>k.replace(/-[0-9a-f]{8}$/,''))).toEqual(['image-2-1','clip-2-1']);
 expect(s.images[2]).toMatch(/^image-2-1-/);expect(s.clips).toMatchObject({1:'clip-1-0.mp4',3:'clip-3-0.mp4'});expect(s.clips[2]).toBe('clip-2-1.mp4');
 expect(s.notes[0].status).toBe('applied');expect(s.mediaHash).not.toBe(first);expect(d.build).toHaveBeenCalledTimes(2);expect(recoveryDependencies.diagnose).not.toHaveBeenCalled();
 expect(publicComic(s).version).toBe(2);
});
it('finishing instructions go through the feedback box and the finishing director: no media, cost x2, rebuilt with the new settings',async()=>{
 const d=deps();await produceV1(d);const noteId=randomUUID();
 await actComic(state().id,'local',{type:'lock-feedback',id:noteId,text:'No music please.',targets:[1,2,3],stage:'visuals'},d);
 d.direct=vi.fn(async s=>({plan:s.plan!,deferred:[noteId]}));d.finishing=vi.fn(async s=>({settings:{...s.settings,music:'off' as const},applied:[noteId],unresolved:[]}));
 await actComic(state().id,'local',{type:'apply-feedback'},d);
 let s=state();expect(d.finishing).toHaveBeenCalledTimes(1);expect(s.pendingSettings).toEqual({music:'off',captions:true});expect(s.targets).toEqual([]);expect(s.proposal).toBeUndefined();
 expect(s.quote!.items).toEqual({});expect(s.quote!.additionalCostUsd).toBeCloseTo(.75,6);expect(s.quote!.additionalUsd).toBe(2);
 await actComic(state().id,'local',{type:'approve-price',quoteId:s.quote!.id},d);await runComic(state().id,'local',d);
 s=state();expect(s.phase).toBe('review');expect(s.filmVersion).toBe(2);expect(s.revision).toBe(0);expect(s.settings.music).toBe('off');expect(keys(d)).toHaveLength(8);expect(s.notes[0].status).toBe('applied');expect(d.build).toHaveBeenCalledTimes(2);
});
it('a note the software cannot act on gets no quote: the reason is shown and the note stays editable',async()=>{
 const d=deps();await produceV1(d);const noteId=randomUUID();
 await actComic(state().id,'local',{type:'lock-feedback',id:noteId,text:'Replace the narrator by a child voice.',targets:[1,2,3],stage:'visuals'},d);
 d.direct=vi.fn(async s=>({plan:s.plan!,deferred:[noteId]}));d.finishing=vi.fn(async s=>({settings:s.settings,applied:[],unresolved:[{id:noteId,reason:'A new recording needs its own approved price.'}]}));
 await actComic(state().id,'local',{type:'apply-feedback'},d);
 const s=state();expect(s.quote).toBeUndefined();expect(s.unresolved).toEqual([{id:noteId,reason:'A new recording needs its own approved price.'}]);expect(s.notes[0].status).toBe('locked');expect(s.phase).toBe('review');expect(keys(d)).toHaveLength(8);
 await expect(actComic(s.id,'local',{type:'approve-version',mediaHash:s.mediaHash,resolved:[]},d)).rejects.toThrow('locked notes');
 await actComic(s.id,'local',{type:'remove-feedback',id:noteId},d);expect(state().notes).toEqual([]);
});
it('approving a version settles the wallet and unlocks the download; a stale hash is refused',async()=>{
 const d=deps();await produceV1(d);const s=state();
 await expect(actComic(s.id,'local',{type:'approve-version',mediaHash:'other',resolved:[]},d)).rejects.toThrow('Watch and approve');
 await actComic(s.id,'local',{type:'approve-version',mediaHash:s.mediaHash,resolved:[]},d);
 expect(state().phase).toBe('complete');expect(settleCredits).toHaveBeenCalledWith(s.id,true);expect(state().approved).toEqual({visuals:s.mediaHash,final:s.mediaHash});
 const v=publicComic(state());expect(v.download).toContain('download');expect(publicComic(fresh()).download).toBeNull();
});
it('a clip refused three times is reworked twice internally, then stops calmly; the replacement stays inside the V1 price',async()=>{
 const d=deps();const refuse=new Set(['clip-2-0','clip-2-0-rw1','clip-2-0-rw2']);
 const media=d.gateway.media;d.gateway.media=vi.fn(async(s,r,allowance,save)=>{if(refuse.has(r.key)){s.operations[r.key]={fingerprint:hash(r),state:'failed',requestId:r.key,quotedCredits:allowance,error:'The media service refused this request: nsfw',sentAt:Date.now()};await save();throw new MediaFailed(r.key,'refused');}return media(s,r,allowance,save);});
 await produceV1(d);
 expect(state().queued).toBe(true);expect(d.rework).toHaveBeenCalledTimes(1);await runComic(state().id,'local',d);expect(d.rework).toHaveBeenCalledTimes(2);await runComic(state().id,'local',d);
 let s=state();expect(s.phase).toBe('blocked');expect(s.stop?.kind).toBe('replace-failed');expect(recoveryDependencies.diagnose).not.toHaveBeenCalled();
 const v=publicComic(s);expect(v.error).toBe('Scene 2 could not be animated after several attempts. Your other scenes are saved; review the updated price to finish this version.');expect(v.error).not.toMatch(/nsfw|refused/);expect(v.canReplace).toBe(true);expect(s.error).toContain('nsfw');// the admin keeps the detail
 expect(s.clips).toEqual({1:'clip-1-0.mp4',3:'clip-3-0.mp4'});
 await actComic(s.id,'local',{type:'replacement-price'},d);
 s=state();expect(s.phase).toBe('estimate');expect(s.revision).toBe(1);expect(s.quote!.kind).toBe('film');expect(Object.keys(s.quote!.items)).toEqual(['clip-2-1']);expect(s.quote!.additionalUsd).toBe(0);expect(s.quote!.totalUsd).toBe(30);
 await actComic(s.id,'local',{type:'approve-price',quoteId:s.quote!.id},d);expect(f.holds).toEqual([30,30]);await runComic(s.id,'local',d);
 s=state();expect(s.phase).toBe('review');expect(s.filmVersion).toBe(1);expect(s.clips[2]).toBe('clip-2-1.mp4');expect(keys(d).at(-1)).toBe('clip-2-1');
});
it('a local build interruption is retried from the saved receipts without re-sending any media',async()=>{
 const d=deps();const build=d.build;d.build=vi.fn(async s=>{if(builds===0){builds++;throw Error('Offline local render interruption');}return build(s);});
 recoveryDependencies.diagnose=vi.fn(async input=>{expect(input.allowed).toContain('retry-saved');return {action:'retry-saved' as const,reason:'Retry the local assembly using the completed saved clips.'};});
 await produceV1(d);
 let s=state();expect(s.phase).toBe('working');expect(s.queued).toBe(true);expect(keys(d)).toHaveLength(8);
 s.recovery!.nextAt=0;f.state=s;await runComic(s.id,'local',d);
 s=state();expect(s.phase).toBe('review');expect(s.filmVersion).toBe(1);expect(keys(d)).toHaveLength(8);expect(recoveryDependencies.diagnose).toHaveBeenCalledTimes(1);
});
it('a saved legacy film keeps its gated flow: no journey field, prepare quote and board phase untouched',async()=>{
 f.state={...fresh(),journey:undefined};const d=deps();
 const v=(await prepareComic('local',{requestId:state().id,title:'Single',script:state().script},d))!;
 expect(v.journey).toBe('legacy');expect(v.phase).toBe('preparation-price');expect(state().quote!.kind).toBe('prepare');expect(Object.keys(state().quote!.items)).toEqual(['voice-0','sheet-0','image-1-0','image-2-0','image-3-0']);
 expect(quoteHash(state(),'prepare')).toBe(state().quote!.inputHash);
});
