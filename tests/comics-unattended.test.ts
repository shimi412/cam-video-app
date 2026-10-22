import {it,expect,vi,afterEach} from 'vitest';
import {readFile} from 'node:fs/promises';
vi.mock('../src/db',()=>({pool:{query:vi.fn(async(sql:string)=>sql.includes('customer_pricing')?{rows:[{value:{}}]}:{rows:[{cost:0}]})}}));
vi.mock('../src/lib/customer-wallet',()=>({CustomerPricingSchema:{parse:()=>({mode:'adaptive-v1',multiplier:2,higgsfieldCreditUsd:.1})}}));
import {alignTokens} from '../src/lib/comics/voice';
import {ComicStop,MediaFailed,ProviderToolError} from '../src/lib/comics/errors';
import {comicsBudgets} from '../src/lib/comics/budgets';
import {providerData,exactCost,reconcileSubmission,type MediaRequest} from '../src/lib/comics/provider';
import {priceComic,mediaRequests,adoptReusableClips} from '../src/lib/comics/pricing';
import {flashCandidatesOutsideEntrances} from '../src/lib/comics/render';
import {hash,publicComic,type ComicState,type ComicPlan,type Operation} from '../src/lib/comics/model';
afterEach(()=>{vi.unstubAllEnvs();});
const plan:ComicPlan={panels:[{id:1,narration:'Victim of propaganda.',meaning:'Explain this idea.',scene:'A distinct flat comic object.',hero:'absent',color:'red',title:'',action:'The object moves slowly.',camera:'Slow camera movement.',preserve:'Keep the whole composition.'},{id:2,narration:'Expose it.',meaning:'Explain this idea.',scene:'A distinct flat comic object.',hero:'absent',color:'blue',title:'',action:'The object moves slowly.',camera:'Slow camera movement.',preserve:'Keep the whole composition.'}]};
const script='Victim of propaganda. Expose it.';
const tok=(text:string,from:number,to:number)=>({text,offsets:{from,to}});

it('aligns a doubled Whisper word and a last token past the audio end, as Motion does',()=>{
 const t=alignTokens([tok(' Victim',0,400),tok(' of',400,600),tok(' of',600,650),tok(' propaganda.',650,1500),tok(' Expose',1800,2200),tok(' it.',2200,3260)],script,plan,3.08);
 expect(t.words.map(w=>w.word)).toEqual(['Victim','of','propaganda.','Expose','it.']);
 expect(t.words.at(-1)!.end).toBe(3.08);expect(t.phrases.map(p=>p.text)).toEqual(plan.panels.map(p=>p.narration));
});
it('stops with a typed client message on a real transcript difference',()=>{
 let error:unknown;try{alignTokens([tok(' Victim',0,400),tok(' of',400,600),tok(' propaganda.',650,1500),tok(' Ignore',1800,2200),tok(' it.',2200,3000)],script,plan,3.1);}catch(e){error=e;}
 expect(error).toBeInstanceOf(ComicStop);expect((error as ComicStop).clientMessage).toContain('no image was generated');
});
it('reads every Attack cap from one validated place',()=>{
 expect(comicsBudgets()).toMatchObject({directionUsd:.5,inspectionUsd:.25,transientRetries:5,quoteMinutes:15});
 vi.stubEnv('CAM_COMICS_DIRECTION_CAP_USD','abc');expect(()=>comicsBudgets()).toThrow('CAM_COMICS_DIRECTION_CAP_USD');
 vi.stubEnv('CAM_COMICS_DIRECTION_CAP_USD','');vi.stubEnv('CAM_COMICS_TRANSIENT_RETRIES','2.5');expect(()=>comicsBudgets()).toThrow('whole');
});
it('distinguishes a provider refusal from a parsable answer',()=>{
 expect(()=>providerData({isError:true,content:[{type:'text',text:'Insufficient credits'}]})).toThrow(ProviderToolError);
 expect(providerData({structuredContent:{cost:{credits:2}}})).toEqual({cost:{credits:2}});
});
const clip:MediaRequest={key:'clip-1-0',tool:'generate_video',params:{model:'kling3_0',prompt:'Animate panel one.'},extension:'mp4'};
it('declines a preset recommendation literally, refuses adjustments and never uses unlimited mode',async()=>{
 const preset='24bae836-2c4a-48e0-89b6-49fcc0b21612',calls:Record<string,unknown>[]=[];
 const call=async(_n:string,a:Record<string,unknown>)=>{calls.push(a);return calls.length===1?{notice:{type:'preset_recommendation',data:{preset:{id:preset},retry_literal_with:{declined_preset_id:preset}}}}:{cost:{credits:6,credits_exact:5.5}};};
 const priced=await exactCost(call,clip);expect(priced.credits).toBe(5.5);expect(priced.declinedPresetId).toBe(preset);expect(priced.params).toMatchObject({use_unlim:false,declined_preset_id:preset});
 expect(calls.every(c=>(c.params as Record<string,unknown>).use_unlim===false)).toBe(true);
 await expect(exactCost(async()=>({adjustments:{duration:5},cost:{credits:4}}),clip)).rejects.toBeInstanceOf(ComicStop);
});
it('reconciles an unanswered submission by listing recent jobs, never resubmitting',async()=>{
 const s={operations:{'clip-2-0':{fingerprint:'x',state:'complete',requestId:'claimed',quotedCredits:4}}} as unknown as ComicState;
 const op={fingerprint:'y',state:'sending' as const,quotedCredits:4,sentAt:1000};
 const list=async()=>({generations:[{id:'claimed',params:{prompt:'Animate panel one.'}},{id:'found',params:{prompt:'Animate panel one.'}},{id:'other',params:{prompt:'Something else.'}}]});
 expect(await reconcileSubmission(list,s,clip,op,2000)).toBe(true);expect(op).toMatchObject({state:'accepted',requestId:'found'});
 const lost:Operation={fingerprint:'y',state:'sending',quotedCredits:4,sentAt:0},empty=async()=>({generations:[]});
 expect(await reconcileSubmission(empty,s,clip,lost,1000)).toBe(false);expect(lost.reconcileAttempts).toBe(1);
 expect(await reconcileSubmission(empty,s,clip,lost,30_000)).toBe(false);// waits between attempts
 expect(await reconcileSubmission(empty,s,clip,lost,70_000)).toBe(false);
 await expect(reconcileSubmission(empty,s,clip,lost,11*60_000)).rejects.toBeInstanceOf(MediaFailed);expect(lost.state).toBe('failed');
 const two=async()=>({generations:[{id:'a',params:{prompt:'Animate panel one.'}},{id:'b',params:{prompt:'Animate panel one.'}}]});
 await expect(reconcileSubmission(two,s,clip,{fingerprint:'y',state:'sending',quotedCredits:4,sentAt:0},1000)).rejects.toThrow('Several');
});
function videoState():ComicState{
 const timing={duration:6,estimated:false,words:[],phrases:plan.panels.map((p,i)=>({phrase:p.id,text:p.narration,start:i*3,end:i*3+3}))};
 return {version:1,id:'00000000-0000-4000-8000-000000000001',title:'T',script,phase:'board',revision:0,queued:false,progress:'',plan,approvedQuotes:[],operations:{'image-1-0':{fingerprint:'i1',state:'complete',requestId:'img-1',file:'i1.png',quotedCredits:2},'image-2-0':{fingerprint:'i2',state:'complete',requestId:'img-2',file:'i2.png',quotedCredits:2}},notes:[],votes:{},approved:{},timing,images:{1:'i1.png',2:'i2.png'},clips:{},settings:{music:'normal',captions:true},targets:[]};
}
it('prices only requests never sent: in-flight work is counted once',async()=>{
 const s=videoState(),cost=vi.fn(async()=>4);
 const before=await priceComic(s,'video',{cost,media:vi.fn()});expect(Object.keys(before.items)).toEqual(['clip-1-0','clip-2-0']);
 s.operations['clip-1-0']={fingerprint:'c1',state:'accepted',requestId:'c1',quotedCredits:4};
 const after=await priceComic(s,'video',{cost,media:vi.fn()});expect(Object.keys(after.items)).toEqual(['clip-2-0']);expect(after.costUsd).toBeCloseTo(before.costUsd-.25,6);
});
it('reuses an accepted clip of an earlier revision by its exact request, never re-paying it',()=>{
 const s=videoState(),[r1]=mediaRequests(s,'video');
 s.operations['clip-1-0']={fingerprint:hash(r1),state:'complete',requestId:'c1',file:'clip-1-0.mp4',quotedCredits:4};
 s.revision=1;expect(mediaRequests(s,'video').map(r=>r.key)).toEqual(['clip-2-1']);
 expect(adoptReusableClips(s)).toEqual([1]);expect(s.clips[1]).toBe('clip-1-0.mp4');
 // A changed action is a different request: no reuse.
 const changed=videoState();changed.operations['clip-1-0']={fingerprint:hash(r1),state:'complete',requestId:'c1',file:'clip-1-0.mp4',quotedCredits:4};changed.revision=1;changed.plan=structuredClone(plan);changed.plan.panels[0].action='The object spins fast.';
 expect(mediaRequests(changed,'video').map(r=>r.key)).toEqual(['clip-1-1','clip-2-1']);
});
it('shows consultative notes per panel and disclosed film adaptations',()=>{
 const s=videoState();s.inspections={'i1.png':{panel:1,kind:'image',issues:['Kling drew a closed star instead of the emblem.']},'i2.png':{panel:2,kind:'image',issues:[],unavailable:true}};
 s.checks={durations:true,safeZones:[],flashCandidates:[12.4],flashNotes:[{time:12.4,evidence:['render-0/evidence/flash-0-before.jpg']}],titleRepairs:[{panel:2,action:'dropped',visible:.6}],mixLufs:-16,sfxBelowVoiceDb:18,logo:true,duration:9};s.phase='visuals';
 const v=publicComic(s);expect(v.panels![0].reviewNotes).toEqual(['Image: review drew a closed star instead of the emblem.']);expect(v.panels![1].reviewNotes[0]).toContain('unavailable');
 expect(v.filmNotes.map(n=>n.text).join(' ')).toContain('Panel 2');expect(v.filmNotes[1].evidence[0]).toContain('flash-0-before.jpg');
});
it('excludes title entrances from flash candidates by construction',()=>{expect(flashCandidatesOutsideEntrances([1.2,6.7,30],[6.67])).toEqual([1.2,30]);});
it('repairs short titles in the build instead of stopping, without film-specific camera cases',async()=>{
 const build=await readFile('comics/runtime/build.py','utf8');
 expect(build).not.toContain('raise SystemExit');expect(build).not.toContain('if c == 5');expect(build).toContain('TITLE_REPAIRS');expect(build).toContain('CAP_CHARS, CAP_MERGE');
});
