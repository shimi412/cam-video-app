import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {digest} from '../src/lib/motion/model';
vi.mock('../src/lib/agent/delivery-review',()=>({reviewDelivery:vi.fn(async()=>({ready:true}))}));
import {reviewDelivery} from '../src/lib/agent/delivery-review';
import {settleCredits} from '../src/lib/customer-wallet';
import {motionDirectory} from '../src/lib/motion/store';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {estimateRevisionCost,revisionAmounts,type RevisionEstimate} from '../src/lib/motion/pricing';
import type {MotionState} from '../src/lib/motion/state';
import {publicMotion} from '../src/lib/motion/state';
const store=vi.hoisted(()=>({state:null as unknown}));
vi.mock('../src/db',()=>({pool:{query:vi.fn()}}));
vi.mock('../src/lib/agent/observations',()=>({observeVideo:vi.fn()}));
vi.mock('../src/lib/motion/store',()=>({getMotion:async()=>structuredClone(store.state),saveMotion:async(_id:string,s:unknown)=>{store.state=structuredClone(s);},lockMotion:async(_id:string,fn:()=>unknown)=>fn(),motionQuote:vi.fn(),motionDirectory:vi.fn(),newMotion:vi.fn()}));
vi.mock('../src/lib/customer-wallet',()=>({reserveCredits:vi.fn(),settleCredits:vi.fn()}));
import {actMotion} from '../src/lib/motion/service';
import {reserveCredits} from '../src/lib/customer-wallet';
const cost:RevisionEstimate={model:'anthropic/claude-test',inputTokens:10000,outputTokens:18000,inputRate:.000002,outputRate:.00001,requestRate:0,supplierUsd:.20};
const direct=async(_id:string,_s:MotionState,_targets:string[],feedback:string)=>({stage:feedback==='Lower the music'?'finishing' as const:'visual' as const,visualFeedback:feedback==='Lower the music'?'':feedback,finishingFeedback:feedback==='Lower the music'?feedback:'',explanation:'Interpreted requested change for the selected scenes.',summary:'What you asked will be applied to the film.',actionable:true});
const state=()=>store.state as MotionState;
let directory="";afterEach(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
beforeEach(async()=>{vi.clearAllMocks();directory=await mkdtemp(path.join(os.tmpdir(),"motion-prices-"));vi.mocked(motionDirectory).mockReturnValue(directory);store.state={version:1,phase:'visuals',revision:0,title:'QA',script:'Original',progress:'Ready',work:'initial',targets:[],feedback:'',deferredFeedback:'',film:{source:'scene("sA", NAVY)\n'+'.'.repeat(1000)+'\nscene("sB", CR)\n'+'.'.repeat(2000)+'\n# ------------------------------------------------------------ sous-titres',scenes:[{id:'sA',phrase:1,movement:'A',meaning:'A'},{id:'sB',phrase:2,movement:'B',meaning:'B'}],referenceChoice:'Reference',removedWords:[]},votes:{},receipts:[{kind:'writing',model:'old',requestId:'initial',actualUsd:50}],operations:{},approved:{},settings:{music:'normal',captions:true},history:[]} satisfies MotionState;});
it('quotes only this correction at x12, rounded up; does not charge or queue at quotation',async()=>{
 const estimate=vi.fn(async()=>cost);
 const result=await actMotion('id','owner',{type:'quote-revision',revision:0,targets:['sA'],feedback:'Integrate the logo with the opening motion'},{estimate,direct});
 expect(result?.revisionQuote?.additionalUsd).toBe(3);expect(result?.revisionQuote?.totalUsd).toBe(13);
 expect(state().revision).toBe(0);expect(state().phase).toBe('visuals');expect(reserveCredits).not.toHaveBeenCalled();
 const q=state().revisionQuote!;
 // Persist/restart before approval, then bind to exactly reviewed request.
 store.state=JSON.parse(JSON.stringify(store.state));
 await actMotion('id','owner',{type:'revise',revision:0,quoteId:q.id,targets:['sA'],feedback:q.feedback,acceptedPriceUsd:3},{estimate,direct});
 expect(state().acceptedPriceUsd).toBe(13);expect(state().phase).toBe('queued');expect(state().revision).toBe(1);expect(reserveCredits).toHaveBeenCalledTimes(1);expect(estimate).toHaveBeenCalledTimes(1);
 await expect(actMotion('id','owner',{type:'revise',revision:0,quoteId:q.id,targets:['sA'],feedback:q.feedback,acceptedPriceUsd:3},{estimate,direct})).rejects.toThrow('changed');
 expect(reserveCredits).toHaveBeenCalledTimes(1);
});
it.each(['price','feedback','targets','source','expired','quote'])('rejects a changed %s before any reservation',async changed=>{
 await actMotion('id','owner',{type:'quote-revision',revision:0,targets:['sA'],feedback:'Make the logo organic'},{estimate:async()=>cost,direct});
 const q=state().revisionQuote!,action={type:'revise',revision:0,quoteId:q.id,targets:['sA'],feedback:q.feedback,acceptedPriceUsd:3};
 if(changed==='price')action.acceptedPriceUsd=1;if(changed==='feedback')action.feedback='Something different';if(changed==='targets')action.targets=['sB'];if(changed==='source')state().film!.source+=' ';if(changed==='expired')q.expiresAt=0;if(changed==='quote')action.quoteId='other';
 await expect(actMotion('id','owner',action)).rejects.toThrow('current correction price');expect(reserveCredits).not.toHaveBeenCalled();
});
it('preserves legacy accepted prices and adds only the new correction',async()=>{state().revision=1;expect(publicMotion('id',state()).priceUsd).toBe(15);const result=await actMotion('id','owner',{type:'quote-revision',revision:1,targets:['sA'],feedback:'Rework the opening'},{estimate:async()=>cost,direct});expect(result?.revisionQuote?.totalUsd).toBe(18);expect(result?.priceUsd).toBe(15);expect(reserveCredits).not.toHaveBeenCalled();});
it('does not quote a finishing-only note or silently override the cumulative ceiling',async()=>{const estimate=vi.fn(async()=>cost);await actMotion('id','owner',{type:'quote-revision',revision:0,targets:['sA'],feedback:'Lower the music'},{estimate,direct});expect(estimate).not.toHaveBeenCalled();expect(state().deferredFeedback).toBe('Lower the music');expect(()=>revisionAmounts(2,10)).toThrow('$30');expect(revisionAmounts(1.36,10)).toEqual({additionalUsd:17,totalUsd:27});expect(()=>revisionAmounts(NaN,10)).toThrow('unavailable');});
it('refuses to quote a note that carries no request at all, in the client sentence, without estimating or charging',async()=>{const estimate=vi.fn(async()=>cost);const vague=async()=>({stage:'visual' as const,visualFeedback:'No concrete change was named.',finishingFeedback:'',explanation:'The note names no fault, no scene and no moment.',summary:'Tell us what feels wrong: a scene, a moment, the rhythm or a word.',actionable:false});await expect(actMotion('id','owner',{type:'quote-revision',revision:0,targets:['sA'],feedback:'hello ?'},{estimate,direct:vague})).rejects.toThrow('Tell us what feels wrong');expect(estimate).not.toHaveBeenCalled();expect(state().revisionQuote).toBeUndefined();expect(reserveCredits).not.toHaveBeenCalled();});
it('shows the client sentence with the quote and keeps the full reading behind it',async()=>{const result=await actMotion('id','owner',{type:'quote-revision',revision:0,targets:['sA'],feedback:'Rework the opening'},{estimate:async()=>cost,direct});expect(result?.revisionQuote?.summary).toBe('What you asked will be applied to the film.');expect(result?.revisionQuote?.feedback).toBe('Rework the opening');});
it('estimates from the current code and targeted scope using provider rates',()=>{const rates={id:'anthropic/claude-test',input:.000002,output:.00001,request:0,context:200000,modalities:['text']};const input={film:state().film!,targets:['sA'],feedback:'Integrate the logo',context:'method'};const one=estimateRevisionCost(input,rates),two=estimateRevisionCost({...input,targets:['sA','sB']},rates);expect(two.supplierUsd).toBeGreaterThan(one.supplierUsd);expect(one.supplierUsd).toBeCloseTo(one.inputTokens*rates.input+one.outputTokens*rates.output);expect(revisionAmounts(.20,10)).toEqual({additionalUsd:3,totalUsd:13});});

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
