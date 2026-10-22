import {motionBudgets} from './budgets';
import {readFile} from 'node:fs/promises';
import {getSetting} from '../settings';
import {openrouterPrice,type ModelPrice} from '../providers/openrouter';
import {digest,price,type MotionFilm} from './model';
import type {MotionState} from './state';

export type RevisionEstimate={model:string;inputTokens:number;outputTokens:number;inputRate:number;outputRate:number;requestRate:number;supplierUsd:number};
export type RevisionQuote={id:string;revision:number;sourceHash:string;targets:string[];feedback:string;originalFeedback?:string;summary?:string;expiresAt:number;estimate:RevisionEstimate;additionalUsd:number;totalUsd:number};
export const acceptedMotionPrice=(s:MotionState)=>s.acceptedPriceUsd??price(s.revision);
export const revisionTargets=(targets:string[])=>[...new Set(targets)].sort();

/** One normal code revision; no initial voice/media, previous calls or bug retries.
 * Tokens are an estimate, not measured usage. Existing media is reused. */
export function estimateRevisionCost(input:{film:MotionFilm;targets:string[];feedback:string;context:string},rates:ModelPrice):RevisionEstimate{
 if([rates.input,rates.output,rates.request].some(n=>!Number.isFinite(n)||n<0)||rates.input+rates.output<=0)throw Error('The correction price is unavailable. Please try again later.');
 const source=input.film.source;
 const positions=input.film.scenes.map(s=>({id:s.id,start:source.indexOf(`scene("${s.id}",`)}));
 const selected=positions.filter(p=>input.targets.includes(p.id));
 if(!selected.length||selected.some(p=>p.start<0))throw Error('Select a scene from this film.');
 const targetCharacters=selected.reduce((sum,p)=>sum+source.slice(p.start,positions.find(next=>next.start>p.start)?.start??source.indexOf('# ------------------------------------------------------------ sous-titres',p.start)).length,0);
 // Account for source, worked reference, method, timing and agent context.
 const reviewImages=Math.ceil(input.targets.length/3)*2+1;
 const inputTokens=4000+reviewImages*2500+Math.ceil((JSON.stringify(input.film).length+input.context.length+input.feedback.length)/3)+4000;
 // A targeted patch repeats old/new anchors; creative reasoning is estimated too.
 const outputTokens=1800+Math.max(1500,Math.ceil(targetCharacters*2/3)+1000+Math.ceil(input.feedback.length/3));
 const supplierUsd=Number((inputTokens*rates.input+outputTokens*rates.output+rates.request).toFixed(8));
 return {model:rates.id,inputTokens,outputTokens,inputRate:rates.input,outputRate:rates.output,requestRate:rates.request,supplierUsd};
}
export async function estimateMotionRevision(s:MotionState,targets:string[],feedback:string):Promise<RevisionEstimate>{
 const model=process.env.CAM_MOTION_MODEL??await getSetting<string>('ai_deep_model')??'anthropic/claude-sonnet-5';
 if(!model.startsWith('anthropic/claude-'))throw Error('The correction price is unavailable. Please check the writing service configuration.');
 const [method,template]=await Promise.all([readFile('motion/METHOD-fr.md','utf8'),readFile('motion/reference/plot-hole-v4-safe.py','utf8')]);
 const rates=await openrouterPrice(model).catch(()=>{throw Error('The correction price is unavailable. Please try again later.');});
 return estimateRevisionCost({film:s.film!,targets,feedback,context:method+template+JSON.stringify(s.timing)},rates);
}
/** Cumulative client ceiling per film. Shimi raised it from $20 to $30 on 2026-10-21 when the writer moved to Fable 5.1 (revision quotes keep the x12 formula). */
export const motionPriceCeilingUsd=()=>motionBudgets().ceilingUsd;
export function revisionAmounts(estimatedSupplierUsd:number,currentPriceUsd:number){
 if(!Number.isFinite(estimatedSupplierUsd)||estimatedSupplierUsd<=0)throw Error('The correction price is unavailable. Please try again later.');
 const additionalUsd=Math.ceil(Number((estimatedSupplierUsd*12).toFixed(8))),totalUsd=currentPriceUsd+additionalUsd;
 const ceiling=motionPriceCeilingUsd();if(totalUsd>ceiling)throw Error(`This film has reached its $${ceiling} revision limit. Contact support before continuing.`);
 return {additionalUsd,totalUsd};
}
export function assertRevisionQuote(s:MotionState,action:{quoteId:string;targets:string[];feedback:string;acceptedPriceUsd:number}){
 const q=s.revisionQuote;
 if(!q||q.id!==action.quoteId||q.revision!==s.revision||q.expiresAt<=Date.now()||q.sourceHash!==digest(s.film!.source)||JSON.stringify(q.targets)!==JSON.stringify(revisionTargets(action.targets))||q.feedback!==action.feedback||q.additionalUsd!==action.acceptedPriceUsd||q.totalUsd!==acceptedMotionPrice(s)+q.additionalUsd)throw Error('Review the current correction price before applying this change.');
 return q;
}
