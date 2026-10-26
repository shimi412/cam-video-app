/** Attack in studio mode (Shimi, 2026-10-26: the software is a screen between Claude Code and the
 * client). The client journey is the single journey; the versions come from `studio_missions`
 * delivered by the local executor. No director, no provider, no engine worker is called at any
 * step. Store, database, wallet, missions and every paid boundary are injected. */
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {settleCredits} from '../src/lib/customer-wallet';
import {reviewDelivery} from '../src/lib/agent/delivery-review';
vi.mock('../src/lib/agent/delivery-review',()=>({reviewDelivery:vi.fn(async()=>({ready:true}))}));
import {beforeEach,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {hash,publicComic,estimatedMinutes,type ComicState} from '../src/lib/comics/model';
import type {StudioMission} from '../src/lib/studio/missions';
const f=vi.hoisted(()=>({state:null as unknown,holds:[] as number[],dir:'',pricing:{mode:'tiers-v2',multiplier:2,higgsfieldCreditUsd:.1},sql:[] as string[]}));
vi.mock('../src/lib/comics/store',()=>({getComic:async()=>structuredClone(f.state),saveComic:async(s:unknown)=>{f.state=structuredClone(s);},lockComic:async(_id:string,work:()=>Promise<unknown>)=>work(),holdComic:async(_s:unknown,q:{totalUsd:number})=>{f.holds.push(q.totalUsd);},comicDirectory:()=>f.dir,comicFile:(_id:string,file:string)=>path.join(f.dir,file),comicActor:async()=>'local',createComic:vi.fn(async()=>structuredClone(f.state))}));
vi.mock('../src/lib/agent/observations',()=>({observeVideo:async()=>{}}));
vi.mock('../src/lib/customer-wallet',()=>({settleCredits:vi.fn(),CustomerPricingSchema:{parse:()=>f.pricing}}));
vi.mock('../src/db',()=>({pool:{query:vi.fn(async(sql:string)=>{f.sql.push(sql);return sql.includes('customer_pricing')?{rows:[{value:f.pricing}]}:{rows:[],rowCount:0};})}}));
vi.mock('../src/lib/access',()=>({withAccess:(h:unknown)=>h,actorFor:async()=>({id:'local',role:'client'})}));
import {prepareComic,actComic,runComic,runQueuedComics,applyStudioDelivery,comicDependencies,type ComicDependencies} from '../src/lib/comics/service';
import {GET as media} from '../src/app/api/comics/[id]/media/[...file]/route';
import {countPanels,studioFirstVersionCost} from '../src/lib/studio/pricing';
const state=()=>f.state as ComicState;
const script='Sentence number 1 of the film. Sentence number 2 of the film! Sentence number 3 of the film?';
function fresh():ComicState{return {version:1,journey:'single',id:randomUUID(),title:'Studio',script,phase:'planning',revision:0,queued:false,progress:'',approvedQuotes:[],operations:{},notes:[],votes:{},approved:{},images:{},clips:{},settings:{music:'normal',captions:true},targets:[]};}
/** Missions as the executor sees them: created by the approval, delivered by `deliverMission` on his side. */
const missions:StudioMission[]=[];
const deps=():ComicDependencies=>({...comicDependencies,
 preflight:vi.fn(async()=>{}),direct:vi.fn(async()=>{throw Error('The director must not be called in studio mode.');}),finishing:vi.fn(async()=>{throw Error('The finishing director must not be called in studio mode.');}),
 price:vi.fn(async()=>{throw Error('The engine pricing must not be called in studio mode.');}),
 gateway:{cost:vi.fn(async()=>{throw Error('No provider pricing in studio mode.');}),media:vi.fn(async()=>{throw Error('No provider media in studio mode.');})},
 authorize:async<T,>(_id:string,work:()=>Promise<T>)=>work(),build:vi.fn(async()=>{throw Error('No engine build in studio mode.');}),
 fulfilment:vi.fn(async()=>'studio' as const),
 mission:vi.fn(async input=>{const m:StudioMission={id:randomUUID(),jobId:input.jobId,category:input.category,version:input.version,title:input.title,script:input.script,feedback:input.feedback??[],priceCents:input.priceCents,state:'queued',mediaPath:null,mediaSha256:null,notes:null,createdAt:new Date().toISOString(),deliveredAt:null};missions.push(m);return m;}),
 loadMission:vi.fn(async id=>missions.find(m=>m.id===id)??null)});
/** What `deliverMission` does on the executor's side: the file under storage/studio/<job>/, the row delivered with the notes. */
async function deliver(m:StudioMission,content:string,notes:string){
 const name=`v${m.version}-${hash(content).slice(0,16)}.mp4`,rel=path.join('studio',m.jobId,name);
 await mkdir(path.join(f.dir,'studio',m.jobId),{recursive:true});await writeFile(path.join(f.dir,rel),content);
 Object.assign(m,{state:'delivered',mediaPath:rel,notes,deliveredAt:new Date().toISOString()});return rel;
}
beforeEach(async()=>{f.dir=await mkdtemp(path.join(os.tmpdir(),'comics-studio-'));f.state=fresh();f.holds=[];f.sql=[];missions.length=0;vi.mocked(settleCredits).mockClear();vi.mocked(reviewDelivery).mockClear();});
afterAll(async()=>{await rm(f.dir,{recursive:true,force:true});});

it('counts the panels from the script sentences and estimates the first version with documented constants',()=>{
 expect(countPanels(script)).toBe(3);expect(countPanels('One.')).toBe(3);expect(countPanels(Array.from({length:30},(_,i)=>`Sentence ${i}.`).join(' '))).toBe(24);
 // Ten panels, five clips: 3 + 2 + 20 + 40 = 65 credits at $0.10, 15 inspections at $0.25, $0.50 direction: $10.75, first tier.
 const ten=studioFirstVersionCost(10,.1,{directionUsd:.5,inspectionUsd:.25});expect(ten.credits).toBe(65);expect(ten.costUsd).toBeCloseTo(10.75,6);
});
it('estimates without any director or provider call: phase estimate, quote film, $30, delay from the panel count',async()=>{
 const d=deps();const v=(await prepareComic('local',{requestId:state().id,title:'Studio',script},d))!;
 expect(d.fulfilment).toHaveBeenCalledWith('comics');expect(d.preflight).not.toHaveBeenCalled();expect(d.direct).not.toHaveBeenCalled();expect(d.gateway.cost).not.toHaveBeenCalled();expect(d.price).not.toHaveBeenCalled();
 const s=state();expect(s.fulfilment).toBe('studio');expect(s.panelCount).toBe(3);expect(s.plan).toBeUndefined();
 expect(v.phase).toBe('estimate');expect(v.journey).toBe('single');expect(v.studio).toBe(true);expect(v.panelCount).toBe(3);expect(v.estimateMinutes).toBe(estimatedMinutes(3));
 const q=s.quote!;expect(q.kind).toBe('film');expect(q.items).toEqual({});expect(q.totalUsd).toBe(30);expect(q.additionalUsd).toBe(30);expect(q.credits).toBe(3+2+6+16);
 expect(f.holds).toEqual([]);expect(missions).toEqual([]);
 // Idempotent re-entry keeps the saved estimate and reads the setting once: the mode is fixed at creation.
 await prepareComic('local',{requestId:state().id,title:'Studio',script},d);expect(d.fulfilment).toHaveBeenCalledTimes(1);expect(state().quote!.id).toBe(q.id);
});
async function approveV1(d:ComicDependencies){
 await prepareComic('local',{requestId:state().id,title:'Studio',script},d);
 await actComic(state().id,'local',{type:'approve-price',quoteId:state().quote!.id},d);
}
it('approving the estimate reserves the credits and creates mission V1 for the executor; nothing is queued for the engine',async()=>{
 const d=deps();await approveV1(d);
 const s=state();expect(f.holds).toEqual([30]);expect(s.phase).toBe('working');expect(s.queued).toBe(false);expect(s.work).toBe('film');expect(s.progress).toBe('Version 1 in production');expect(s.approvedQuotes).toHaveLength(1);expect(s.workQuote).toBe(s.approvedQuotes[0].id);
 expect(d.mission).toHaveBeenCalledTimes(1);expect(missions[0]).toMatchObject({jobId:s.id,category:'comics',version:1,title:'Studio',script,feedback:[],priceCents:3000,state:'queued'});
 const v=publicComic(s);expect(v.queued).toBe(false);expect(v.quote).toBeNull();expect(v.preview).toBeNull();
 // A second approval of the same quote is idempotent.
 await actComic(s.id,'local',{type:'approve-price',quoteId:s.approvedQuotes[0].id},d);expect(d.mission).toHaveBeenCalledTimes(1);expect(f.holds).toEqual([30]);
 // The engine worker ignores the film even if a queued flag slipped in.
 state().queued=true;await runComic(s.id,'local',d);expect(d.gateway.media).not.toHaveBeenCalled();expect(d.build).not.toHaveBeenCalled();expect(state().phase).toBe('working');expect(state().progress).toBe('Version 1 in production');
 await runQueuedComics();expect(f.sql.at(-1)).toContain("coalesce(state->>'fulfilment','engine')<>'studio'");
});
it('the executor\'s delivery makes V1 reviewable: same file as preview and final, executor notes as review notes',async()=>{
 const d=deps();await approveV1(d);
 await expect(applyStudioDelivery(missions[0].id,d)).rejects.toThrow('Deliver the film first.');
 const rel=await deliver(missions[0],'studio film one','Panel 2 shows the gate closing slowly.');
 const v=(await applyStudioDelivery(missions[0].id,d))!;
 const s=state();expect(s.phase).toBe('review');expect(s.filmVersion).toBe(1);expect(s.media).toBe(rel);expect(s.mediaHash).toBe(hash(Buffer.from('studio film one').toString('base64')));expect(s.work).toBeUndefined();expect(s.workQuote).toBeUndefined();expect(s.quote).toBeUndefined();expect(s.progress).toBe('Version 1 is ready for your review');
 expect(v.version).toBe(1);expect(v.preview).toBe(`/api/comics/${s.id}/media/${encodeURIComponent(rel)}`);expect(v.download).toBeNull();expect(v.deliveryNotes).toBe('Panel 2 shows the gate closing slowly.');expect(v.panels).toBeUndefined();
 // The media route serves the studio file for the review (no download before approval).
 const preview=await media(new Request('http://localhost'),{params:Promise.resolve({id:s.id,file:[rel]})});expect(preview.status).toBe(200);expect(await preview.text()).toBe('studio film one');
 const early=await media(new Request('http://localhost'),{params:Promise.resolve({id:s.id,file:['download']})});expect(early.status).toBe(403);
 expect(d.gateway.media).not.toHaveBeenCalled();expect(d.build).not.toHaveBeenCalled();
});
it('feedback on V1 quotes the documented studio revision price without a director, then V2 is a mission carrying the notes verbatim',async()=>{
 const d=deps();await approveV1(d);await deliver(missions[0],'studio film one','');await applyStudioDelivery(missions[0].id,d);
 const whole=randomUUID(),panel=randomUUID();
 await expect(actComic(state().id,'local',{type:'lock-feedback',id:whole,text:'Warmer colours overall.',targets:[1,2,3,4],stage:'visuals'},d)).rejects.toThrow('Choose valid panels.');
 await actComic(state().id,'local',{type:'lock-feedback',id:whole,text:'Warmer colours overall.',targets:[1,2,3],stage:'visuals'},d);
 await actComic(state().id,'local',{type:'lock-feedback',id:panel,text:'The gate should open, not close.',targets:[2],stage:'visuals'},d);
 await actComic(state().id,'local',{type:'apply-feedback'},d);
 let s=state();expect(d.direct).not.toHaveBeenCalled();expect(d.finishing).not.toHaveBeenCalled();expect(d.price).not.toHaveBeenCalled();
 const q=s.quote!;expect(q.kind).toBe('revision');expect(q.items).toEqual({});expect(q.additionalCostUsd).toBe(1.5);expect(q.additionalUsd).toBe(3);expect(q.totalUsd).toBe(33);expect(s.progress).toBe('Review the price of your next version');expect(s.phase).toBe('review');
 // Editing a note invalidates the quote; the new quote is a fresh identity.
 await actComic(s.id,'local',{type:'lock-feedback',id:panel,text:'The gate should open wide.',targets:[2],stage:'visuals'},d);expect(state().quote).toBeUndefined();
 await actComic(s.id,'local',{type:'apply-feedback'},d);const q2=state().quote!;expect(q2.id).not.toBe(q.id);
 await actComic(s.id,'local',{type:'approve-price',quoteId:q2.id},d);
 s=state();expect(f.holds).toEqual([30,33]);expect(s.phase).toBe('working');expect(s.queued).toBe(false);expect(s.work).toBe('revision');expect(s.progress).toBe('Version 2 in production');expect(s.notes.every(n=>n.status==='locked')).toBe(true);
 expect(missions).toHaveLength(2);expect(missions[1]).toMatchObject({jobId:s.id,version:2,priceCents:300,feedback:[{text:'Warmer colours overall.'},{text:'The gate should open wide.',scene:2}]});
 // V1 stays visible while V2 is in production; no feedback edit meanwhile.
 expect(publicComic(s).preview).toContain('v1-');await expect(actComic(s.id,'local',{type:'lock-feedback',id:randomUUID(),text:'Another note.',targets:[1],stage:'visuals'},d)).rejects.toThrow('Wait for the current change');
 const rel2=await deliver(missions[1],'studio film two','Gate opens wide in panel 2.');await applyStudioDelivery(missions[1].id,d);
 s=state();expect(s.phase).toBe('review');expect(s.filmVersion).toBe(2);expect(s.media).toBe(rel2);expect(s.notes.every(n=>n.status==='applied')).toBe(true);expect(publicComic(s).version).toBe(2);expect(publicComic(s).deliveryNotes).toBe('Gate opens wide in panel 2.');
 expect(d.gateway.media).not.toHaveBeenCalled();expect(d.build).not.toHaveBeenCalled();
});
it('approving a version settles the wallet without a second review and the download serves the delivered file, sha-verified',async()=>{
 const d=deps();await approveV1(d);const rel=await deliver(missions[0],'studio film one','Executor notes.');await applyStudioDelivery(missions[0].id,d);
 let s=state();await expect(actComic(s.id,'local',{type:'approve-version',mediaHash:'other',resolved:[]},d)).rejects.toThrow('Watch and approve');
 await actComic(s.id,'local',{type:'approve-version',mediaHash:s.mediaHash,resolved:[]},d);
 s=state();expect(s.phase).toBe('complete');expect(settleCredits).toHaveBeenCalledWith(s.id,true);expect(reviewDelivery).not.toHaveBeenCalled();expect(s.approved).toEqual({visuals:s.mediaHash,final:s.mediaHash});expect(s.deliveryNotes).toBe('Executor notes.');
 const v=publicComic(s);expect(v.download).toBe(`/api/comics/${s.id}/media/download`);expect(v.deliveryNotes).toBe('Executor notes.');
 const download=await media(new Request('http://localhost'),{params:Promise.resolve({id:s.id,file:['download']})});
 expect(download.status).toBe(200);expect(download.headers.get('Content-Disposition')).toContain('attachment');expect(await download.text()).toBe('studio film one');
 // A changed delivered file is refused, and a late re-delivery cannot replace an approved film.
 await writeFile(path.join(f.dir,rel),'tampered');expect((await media(new Request('http://localhost'),{params:Promise.resolve({id:s.id,file:['download']})})).status).toBe(403);
 await expect(applyStudioDelivery(missions[0].id,d)).rejects.toThrow('already approved');
});
it('an engine film is untouched: the setting says engine, the estimate goes through the director and the engine pricing',async()=>{
 const d=deps();d.fulfilment=vi.fn(async()=>'engine' as const);d.direct=vi.fn(async()=>({plan:{panels:[1,2,3].map(id=>({id,narration:`Sentence number ${id} of the film${id===1?'.':id===2?'!':'?'}`,meaning:'Explain this idea.',scene:`A distinct flat comic object ${id}.`,hero:'absent' as const,color:'red',title:'',action:'The object moves slowly.',camera:'Slow camera movement.',preserve:'Keep the whole composition.',motion:'local' as const,cameraMove:{kind:'hold' as const,amount:'subtle' as const},videoPrompt:'',lockEndFrame:false}))},deferred:[]}));
 d.price=vi.fn(async(s,kind)=>({id:randomUUID(),kind,items:{},credits:0,analysisUsd:0,costUsd:0,totalUsd:30,additionalUsd:30,expires:Date.now()+60000,inputHash:''}));
 await prepareComic('local',{requestId:state().id,title:'Studio',script},d);
 expect(state().fulfilment).toBe('engine');expect(d.direct).toHaveBeenCalledTimes(1);expect(d.price).toHaveBeenCalledWith(expect.anything(),'film',expect.anything());expect(state().panelCount).toBeUndefined();expect(publicComic(state()).studio).toBe(false);
 // A saved film without the field is never asked the setting again once it has a plan.
 f.state={...fresh(),plan:state().plan};const e=deps();await prepareComic('local',{requestId:state().id,title:'Studio',script},{...e,price:d.price});expect(e.fulfilment).not.toHaveBeenCalled();expect(state().fulfilment).toBeUndefined();
});
