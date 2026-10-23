import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {digest} from '../src/lib/motion/model';
vi.mock('../src/lib/agent/delivery-review',()=>({reviewDelivery:vi.fn(async()=>({ready:true}))}));
import {reviewDelivery} from '../src/lib/agent/delivery-review';
import {settleCredits} from '../src/lib/customer-wallet';
import {motionDirectory} from '../src/lib/motion/store';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {estimateRevisionCost,revisionAmounts,estimateFirstVersionCost,firstVersionOffer,MOTION_V1_ESTIMATED_MINUTES,type RevisionEstimate} from '../src/lib/motion/pricing';
import type {MotionState} from '../src/lib/motion/state';
import {publicMotion} from '../src/lib/motion/state';
const store=vi.hoisted(()=>({state:null as unknown}));
vi.mock('../src/db',()=>({pool:{query:vi.fn()}}));
vi.mock('../src/lib/agent/observations',()=>({observeVideo:vi.fn()}));
vi.mock('../src/lib/motion/store',()=>({getMotion:async()=>structuredClone(store.state),saveMotion:async(_id:string,s:unknown)=>{store.state=structuredClone(s);},lockMotion:async(_id:string,fn:()=>unknown)=>fn(),motionQuote:vi.fn(async()=>({quoteId:'id-motion-v1-0',quote:'motion-v1-0'})),motionDirectory:vi.fn(),newMotion:vi.fn(async()=>'id')}));
vi.mock('../src/lib/agent/recovery-step',()=>({supervisedStep:vi.fn(async(input:{execute:()=>unknown})=>input.execute()),RecoveryStepError:class extends Error{}}));
vi.mock('../src/lib/customer-wallet',()=>({reserveCredits:vi.fn(),settleCredits:vi.fn()}));
import {actMotion,startMotion} from '../src/lib/motion/service';
import {motionQuote} from '../src/lib/motion/store';
import {reserveCredits} from '../src/lib/customer-wallet';
const cost:RevisionEstimate={model:'anthropic/claude-test',inputTokens:10000,outputTokens:18000,inputRate:.000002,outputRate:.00001,requestRate:0,supplierUsd:.20};
const direct=async(_id:string,_s:MotionState,_targets:string[],feedback:string)=>({stage:feedback==='Lower the music'?'finishing' as const:'visual' as const,visualFeedback:feedback==='Lower the music'?'':feedback,finishingFeedback:feedback==='Lower the music'?feedback:'',explanation:'Interpreted requested change for the selected scenes.',summary:'What you asked will be applied to the film.',actionable:true});
const state=()=>store.state as MotionState;
let directory="";afterEach(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
beforeEach(async()=>{vi.clearAllMocks();directory=await mkdtemp(path.join(os.tmpdir(),"motion-prices-"));vi.mocked(motionDirectory).mockReturnValue(directory);store.state={version:1,phase:'visuals',revision:0,title:'QA',script:'Original',progress:'Ready',work:'initial',targets:[],feedback:'',deferredFeedback:'',film:{source:'scene("sA", NAVY)\n'+'.'.repeat(1000)+'\nscene("sB", CR)\n'+'.'.repeat(2000)+'\n# ------------------------------------------------------------ sous-titres',scenes:[{id:'sA',phrase:1,movement:'A',meaning:'A'},{id:'sB',phrase:2,movement:'B',meaning:'B'}],referenceChoice:'Reference',removedWords:[]},votes:{},receipts:[{kind:'writing',model:'old',requestId:'initial',actualUsd:50}],operations:{},approved:{},settings:{music:'normal',captions:true},history:[]} satisfies MotionState;});
it('quotes only this correction at its estimated cost x2, rounded up; does not charge or queue at quotation',async()=>{
 const estimate=vi.fn(async()=>cost);
 const result=await actMotion('id','owner',{type:'quote-revision',revision:0,targets:['sA'],feedback:'Integrate the logo with the opening motion'},{estimate,direct});
 expect(result?.revisionQuote?.additionalUsd).toBe(1);expect(result?.revisionQuote?.totalUsd).toBe(11);
 expect(state().revision).toBe(0);expect(state().phase).toBe('visuals');expect(reserveCredits).not.toHaveBeenCalled();
 const q=state().revisionQuote!;
 // Persist/restart before approval, then bind to exactly reviewed request.
 store.state=JSON.parse(JSON.stringify(store.state));
 await actMotion('id','owner',{type:'revise',revision:0,quoteId:q.id,targets:['sA'],feedback:q.feedback,acceptedPriceUsd:1},{estimate,direct});
 expect(state().acceptedPriceUsd).toBe(11);expect(state().phase).toBe('queued');expect(state().revision).toBe(1);expect(reserveCredits).toHaveBeenCalledTimes(1);expect(estimate).toHaveBeenCalledTimes(1);
 await expect(actMotion('id','owner',{type:'revise',revision:0,quoteId:q.id,targets:['sA'],feedback:q.feedback,acceptedPriceUsd:1},{estimate,direct})).rejects.toThrow('changed');
 expect(reserveCredits).toHaveBeenCalledTimes(1);
});
it.each(['price','feedback','targets','source','expired','quote'])('rejects a changed %s before any reservation',async changed=>{
 await actMotion('id','owner',{type:'quote-revision',revision:0,targets:['sA'],feedback:'Make the logo organic'},{estimate:async()=>cost,direct});
 const q=state().revisionQuote!,action={type:'revise',revision:0,quoteId:q.id,targets:['sA'],feedback:q.feedback,acceptedPriceUsd:1};
 if(changed==='price')action.acceptedPriceUsd=3;if(changed==='feedback')action.feedback='Something different';if(changed==='targets')action.targets=['sB'];if(changed==='source')state().film!.source+=' ';if(changed==='expired')q.expiresAt=0;if(changed==='quote')action.quoteId='other';
 await expect(actMotion('id','owner',action)).rejects.toThrow('current correction price');expect(reserveCredits).not.toHaveBeenCalled();
});
it('preserves legacy accepted prices and adds only the new correction',async()=>{state().revision=1;expect(publicMotion('id',state()).priceUsd).toBe(15);const result=await actMotion('id','owner',{type:'quote-revision',revision:1,targets:['sA'],feedback:'Rework the opening'},{estimate:async()=>cost,direct});expect(result?.revisionQuote?.totalUsd).toBe(16);expect(result?.priceUsd).toBe(15);expect(reserveCredits).not.toHaveBeenCalled();});
it('keeps the exact accepted price of a film created under the old grid and adds the new revision on top',async()=>{state().acceptedPriceUsd=10;const result=await actMotion('id','owner',{type:'quote-revision',revision:0,targets:['sA'],feedback:'Rework the opening'},{estimate:async()=>({...cost,supplierUsd:1.36}),direct});expect(result?.priceUsd).toBe(10);expect(result?.revisionQuote?.additionalUsd).toBe(3);expect(result?.revisionQuote?.totalUsd).toBe(13);});
it('does not quote a finishing-only note',async()=>{const estimate=vi.fn(async()=>cost);await actMotion('id','owner',{type:'quote-revision',revision:0,targets:['sA'],feedback:'Lower the music'},{estimate,direct});expect(estimate).not.toHaveBeenCalled();expect(state().deferredFeedback).toBe('Lower the music');});
it('prices every revision at its estimated cost x2 rounded up, with no cumulative ceiling (grid of 2026-10-23)',()=>{
 expect(revisionAmounts(1.36,30)).toEqual({additionalUsd:3,totalUsd:33});
 expect(revisionAmounts(1.5,30)).toEqual({additionalUsd:3,totalUsd:33});
 expect(revisionAmounts(2,10)).toEqual({additionalUsd:4,totalUsd:14});
 expect(revisionAmounts(8.5,50)).toEqual({additionalUsd:17,totalUsd:67});
 expect(revisionAmounts(20,90)).toEqual({additionalUsd:40,totalUsd:130});
 expect(()=>revisionAmounts(NaN,10)).toThrow('unavailable');expect(()=>revisionAmounts(0,10)).toThrow('unavailable');expect(()=>revisionAmounts(1,NaN)).toThrow('unavailable');
});
it('estimates a first version from the Motion allowances and prices it by tiers (grid of 2026-10-23)',()=>{
 const fable={writingUsd:10,repairUsd:8,reviewUsd:1.5,feedbackUsd:.6,voiceCredits:3,ceilingUsd:30};
 const estimate=estimateFirstVersionCost(.1,fable);
 expect(estimate).toEqual({writingUsd:10,reviewUsd:1.5,narrationCredits:3,higgsfieldCreditUsd:.1,narrationUsd:.3,alignmentUsd:0,supplierUsd:11.8});
 expect(firstVersionOffer(.1,fable)).toEqual({estimate,priceUsd:30,estimatedMinutes:15,grid:'tiers-2026-10-23'});
 expect(MOTION_V1_ESTIMATED_MINUTES).toBe(15);
 // The feedback and repair caps are not part of a first version; the tiers follow the estimated cost.
 expect(firstVersionOffer(.1,{...fable,feedbackUsd:12,repairUsd:12}).priceUsd).toBe(30);
 expect(firstVersionOffer(.1,{...fable,writingUsd:12,reviewUsd:12}).priceUsd).toBe(40);
 expect(firstVersionOffer(.1,{...fable,writingUsd:12,reviewUsd:12,voiceCredits:10}).estimate.supplierUsd).toBe(25);
 expect(firstVersionOffer(5,{...fable,writingUsd:12,reviewUsd:12,voiceCredits:10}).priceUsd).toBe(50);
 expect(()=>estimateFirstVersionCost(0,fable)).toThrow('credit price');expect(()=>estimateFirstVersionCost(NaN,fable)).toThrow('credit price');
});
it('binds creation to the first-version price shown on the creation screen and saves it before any paid step',async()=>{
 const offer=async()=>firstVersionOffer(.1,{writingUsd:10,repairUsd:8,reviewUsd:1.5,feedbackUsd:.6,voiceCredits:3,ceilingUsd:30});
 store.state={...state(),phase:'queued',progress:'Waiting to start',film:undefined};
 const input={script:'A script long enough to start.',title:'Grid',requestId:'3f1c2a9e-5b7d-4c1e-9a2b-7d6e5f4c3b2a'};
 await expect(startMotion('owner',{...input,acceptedPriceUsd:10},async()=>{},offer)).rejects.toThrow('The film price is now $30');
 expect(reserveCredits).not.toHaveBeenCalled();expect(motionQuote).not.toHaveBeenCalled();
 await startMotion('owner',{...input,acceptedPriceUsd:30},async()=>{},offer);
 expect(motionQuote).toHaveBeenCalledWith('id',0,{totalUsd:30});expect(reserveCredits).toHaveBeenCalledWith('id','id-motion-v1-0','motion-v1-0');
 expect(state().acceptedPriceUsd).toBe(30);expect(state().firstVersionOffer?.estimate.supplierUsd).toBe(11.8);expect(publicMotion('id',state()).priceUsd).toBe(30);
 await expect(startMotion('owner',{...input,acceptedPriceUsd:30.5},async()=>{},offer)).rejects.toThrow();
});
it('refuses to quote a note that carries no request at all, in the client sentence, without estimating or charging',async()=>{const estimate=vi.fn(async()=>cost);const vague=async()=>({stage:'visual' as const,visualFeedback:'No concrete change was named.',finishingFeedback:'',explanation:'The note names no fault, no scene and no moment.',summary:'Tell us what feels wrong: a scene, a moment, the rhythm or a word.',actionable:false});await expect(actMotion('id','owner',{type:'quote-revision',revision:0,targets:['sA'],feedback:'hello ?'},{estimate,direct:vague})).rejects.toThrow('Tell us what feels wrong');expect(estimate).not.toHaveBeenCalled();expect(state().revisionQuote).toBeUndefined();expect(reserveCredits).not.toHaveBeenCalled();});
it('shows the client sentence with the quote and keeps the full reading behind it',async()=>{const result=await actMotion('id','owner',{type:'quote-revision',revision:0,targets:['sA'],feedback:'Rework the opening'},{estimate:async()=>cost,direct});expect(result?.revisionQuote?.summary).toBe('What you asked will be applied to the film.');expect(result?.revisionQuote?.feedback).toBe('Rework the opening');});
it('estimates from the current code and targeted scope using provider rates',()=>{const rates={id:'anthropic/claude-test',input:.000002,output:.00001,request:0,context:200000,modalities:['text']};const input={film:state().film!,targets:['sA'],feedback:'Integrate the logo',context:'method'};const one=estimateRevisionCost(input,rates),two=estimateRevisionCost({...input,targets:['sA','sB']},rates);expect(two.supplierUsd).toBeGreaterThan(one.supplierUsd);expect(one.supplierUsd).toBeCloseTo(one.inputTokens*rates.input+one.outputTokens*rates.output);expect(revisionAmounts(.20,10)).toEqual({additionalUsd:1,totalUsd:11});});

it('releases the film on the client approval even when Claude objects, keeping its notes, and still refuses a changed file',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'motion-release-'));
 try{
  const bytes=Buffer.from('exact reviewed film');await writeFile(path.join(dir,'final.mp4'),bytes);vi.mocked(motionDirectory).mockReturnValue(dir);
  Object.assign(state(),{phase:'finishing',mediaHash:digest(bytes),approved:{visuals:0}});
  vi.mocked(reviewDelivery).mockRejectedValueOnce(Error('Final review: the requested correction remains unresolved.'));
  await actMotion('id','owner',{type:'approve-finishing',revision:0});
  expect(state().phase).toBe('complete');expect(state().deliveryNotes).toBe('the requested correction remains unresolved.');expect(settleCredits).toHaveBeenCalledTimes(1);
  expect(reviewDelivery).toHaveBeenCalledWith(expect.objectContaining({category:'motion',mediaHash:digest(bytes)}));
  Object.assign(state(),{phase:'finishing',mediaHash:digest(Buffer.from('other bytes')),approved:{visuals:0,finishing:undefined}});
  await expect(actMotion('id','owner',{type:'approve-finishing',revision:0})).rejects.toThrow('changed');expect(settleCredits).toHaveBeenCalledTimes(1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
