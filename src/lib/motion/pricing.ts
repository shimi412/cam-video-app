import {motionBudgets} from './budgets';
import {readFile} from 'node:fs/promises';
import {getSetting} from '../settings';
import {openrouterPrice,type ModelPrice} from '../providers/openrouter';
import {firstVersionPriceCents,revisionPriceCents} from '../customer-price';
import {CustomerPricingSchema} from '../customer-wallet';
import {ClientMessage} from './client-message';
import {digest,legacyMotionPrice,type MotionFilm} from './model';
import type {MotionState} from './state';

export type RevisionEstimate={model:string;inputTokens:number;outputTokens:number;inputRate:number;outputRate:number;requestRate:number;supplierUsd:number};
export type RevisionQuote={id:string;revision:number;sourceHash:string;targets:string[];feedback:string;originalFeedback?:string;summary?:string;expiresAt:number;estimate:RevisionEstimate;additionalUsd:number;totalUsd:number};
export const acceptedMotionPrice=(s:MotionState)=>s.acceptedPriceUsd??legacyMotionPrice(s.revision);

/** Delay announced on the creation screen: measured complete V1 runs of 2026-10-21/22 (recording,
 * alignment, writer turn with its builds, review, render) land around a quarter of an hour. */
export const MOTION_V1_ESTIMATED_MINUTES=15;
/** The narration is aligned by the local Whisper model (voice.ts): no supplier charge. The line stays
 * explicit so the estimate lists every V1 step; raise it only if alignment ever moves to a paid service. */
export const LOCAL_ALIGNMENT_ALLOWANCE_USD=0;
export type FirstVersionEstimate={writingUsd:number;reviewUsd:number;narrationCredits:number;higgsfieldCreditUsd:number;narrationUsd:number;alignmentUsd:number;supplierUsd:number};
export type FirstVersionOffer={estimate:FirstVersionEstimate;priceUsd:number;estimatedMinutes:number;grid:'tiers-2026-10-23'};
/** Estimated supplier cost of a complete first version: the writing and review allowances of
 * `motionBudgets()` (the feedback cap belongs to revisions), the narration credits at the admin
 * credit price and the local alignment. Allowances, not measured spend: every paid step runs inside them. */
export function estimateFirstVersionCost(higgsfieldCreditUsd:number,budgets=motionBudgets()):FirstVersionEstimate{
 if(!Number.isFinite(higgsfieldCreditUsd)||higgsfieldCreditUsd<=0)throw Error('The film price is unavailable: the supplier credit price is not configured.');
 const narrationUsd=Number((budgets.voiceCredits*higgsfieldCreditUsd).toFixed(8));
 const supplierUsd=Number((budgets.writingUsd+budgets.reviewUsd+narrationUsd+LOCAL_ALIGNMENT_ALLOWANCE_USD).toFixed(8));
 return {writingUsd:budgets.writingUsd,reviewUsd:budgets.reviewUsd,narrationCredits:budgets.voiceCredits,higgsfieldCreditUsd,narrationUsd,alignmentUsd:LOCAL_ALIGNMENT_ALLOWANCE_USD,supplierUsd};
}
/** Shimi's grid of 2026-10-23: a first complete version is priced by tiers of its estimated cost
 * (up to $20 -> $30, $20 to $30 -> $40, above -> $50). Replaces the fixed $10 creation price. */
export function firstVersionOffer(higgsfieldCreditUsd:number,budgets=motionBudgets()):FirstVersionOffer{
 const estimate=estimateFirstVersionCost(higgsfieldCreditUsd,budgets);
 return {estimate,priceUsd:firstVersionPriceCents(estimate.supplierUsd)/100,estimatedMinutes:MOTION_V1_ESTIMATED_MINUTES,grid:'tiers-2026-10-23'};
}
/** The offer shown before Start and checked again at creation. The credit price is the admin
 * `customer_pricing.higgsfieldCreditUsd` (the same setting Clay and Attack use). */
export async function motionFirstVersionOffer():Promise<FirstVersionOffer>{
 const config=CustomerPricingSchema.safeParse(await getSetting('customer_pricing'));
 if(!config.success)throw new ClientMessage('The film price is not configured yet. Contact support before starting a film.');
 return firstVersionOffer(config.data.higgsfieldCreditUsd);
}
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
/** Shimi's grid of 2026-10-23: every revision is its estimated supplier cost x2, rounded up to a whole
 * dollar, added to the accepted film price. Replaces the x12 formula and the cumulative ceiling
 * (`CAM_MOTION_PRICE_CEILING_USD`, $20 then $30) of 2026-10-19/21; the three-version limit is unchanged. */
export function revisionAmounts(estimatedSupplierUsd:number,currentPriceUsd:number){
 if(!Number.isFinite(estimatedSupplierUsd)||estimatedSupplierUsd<=0)throw Error('The correction price is unavailable. Please try again later.');
 if(!Number.isFinite(currentPriceUsd)||currentPriceUsd<0)throw Error('The correction price is unavailable. Please try again later.');
 const additionalUsd=revisionPriceCents(estimatedSupplierUsd)/100,totalUsd=currentPriceUsd+additionalUsd;
 return {additionalUsd,totalUsd};
}
export function assertRevisionQuote(s:MotionState,action:{quoteId:string;targets:string[];feedback:string;acceptedPriceUsd:number}){
 const q=s.revisionQuote;
 if(!q||q.id!==action.quoteId||q.revision!==s.revision||q.expiresAt<=Date.now()||q.sourceHash!==digest(s.film!.source)||JSON.stringify(q.targets)!==JSON.stringify(revisionTargets(action.targets))||q.feedback!==action.feedback||q.additionalUsd!==action.acceptedPriceUsd||q.totalUsd!==acceptedMotionPrice(s)+q.additionalUsd)throw Error('Review the current correction price before applying this change.');
 return q;
}
