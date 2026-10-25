import {randomUUID} from 'node:crypto';
import {pool} from '@/db';
import {CustomerPricingSchema} from '../customer-wallet';
import {customerPriceCents,firstVersionPriceCents,revisionPriceCents} from '../customer-price';
import {sheetParams,imageParams,clipParams,voiceParams,STYLE} from './prompts';
import {hash,quoteHash,singleJourney,panelMotion,type ComicState,type Quote} from './model';
import {comicsGateway,type ComicGateway,type MediaRequest} from './provider';
import {comicsBudgets} from './budgets';
export const needsImage=(a:ComicState['plan'],b:ComicState['plan'],id:number)=>{const keys=['scene','hero','color'] as const;return keys.some(k=>a?.panels[id-1]?.[k]!==b?.panels[id-1]?.[k]);};
/** A changed panel needs a new clip when its image changes, when its motion kind changes, or (generated and legacy panels) when its animation direction changes. A local panel's clip is a free loop of its still: only a new image needs a new one; a camera move change costs nothing (the build applies it). */
export const needsClip=(a:ComicState['plan'],b:ComicState['plan'],id:number)=>{const pa=a?.panels[id-1],pb=b?.panels[id-1];if(needsImage(a,b,id))return true;if(panelMotion(pa??{})!==panelMotion(pb??{}))return true;if(panelMotion(pb??{})==='local')return false;return (['action','camera','preserve','videoPrompt','lockEndFrame'] as const).some(k=>pa?.[k]!==pb?.[k]);};
/** A panel whose generation request was refused carries a director overlay for the next attempt;
 * the approved plan, its hashes and the storyboard text are unchanged (Shimi, 2026-10-22). */
export const reworked=(s:ComicState,panel:NonNullable<ComicState['plan']>['panels'][number])=>{const o=s.reworkedPanels?.[panel.id];return o?{...panel,scene:o.scene,action:o.action,preserve:o.preserve,...(o.videoPrompt?{videoPrompt:o.videoPrompt}:{})}:panel;};
export const reworkSuffix=(s:ComicState,panel:number)=>{const n=s.reworks?.[panel]?.length??0;return n?`-rw${n}`:'';};
/** Clip length estimated from the narration before the recording exists (single-journey V1
 * estimate): about 2.2 words per second plus a short settle, within Kling's 3 to 8 s. The real
 * request uses the aligned phrase; the quote's pooled allowance absorbs the difference. */
export function estimatedClipSeconds(narration:string){const words=narration.trim().split(/\s+/).filter(Boolean).length;return Math.max(3,Math.min(8,Math.ceil(words/2.2+.3)));}
type RequestOptions={/** Pricing only: a clip whose image or timing does not exist yet is estimated with a placeholder reference and a narration-based duration, never submitted. */estimate?:boolean};
export function mediaRequests(s:ComicState,kind:Quote['kind'],options:RequestOptions={}):MediaRequest[]{
 const p=s.proposal??s.plan;if(!p)throw Error('Plan missing.');const revision=kind==='revision'?s.revision+1:s.revision;
 const sheets=Object.entries(s.operations).filter(([key,o])=>key.startsWith('sheet-')&&o.state==='complete');const sheet=sheets.at(-1)?.[1].requestId??STYLE;
 const image=(panel:NonNullable<ComicState['plan']>['panels'][number],key:string):MediaRequest=>({key,tool:'generate_image',params:imageParams(reworked(s,panel),sheet),extension:'png'});
 if(kind==='prepare')return [{key:'voice-0',tool:'generate_audio',params:voiceParams(s.script),extension:'audio'},{key:'sheet-0',tool:'generate_image',params:sheetParams(p),extension:'png'},...p.panels.map(panel=>image(panel,`image-${panel.id}-${revision}${reworkSuffix(s,panel.id)}`))];
 if(kind==='film'){
  // Single-journey V1: the whole first version. Images are always the version-0 images; clips use the
  // current revision (a replacement after a confirmed failure bumps it, images keep their identity).
  const clips=p.panels.filter(panel=>!s.clips[panel.id]).flatMap(panel=>{const r=clipRequest(s,panel,s.revision,options.estimate?'estimate':'skip');return r&&!reusableClip(s,r)?[r]:[];});
  return [{key:'voice-0',tool:'generate_audio',params:voiceParams(s.script),extension:'audio'},{key:'sheet-0',tool:'generate_image',params:sheetParams(p),extension:'png'},...p.panels.map(panel=>image(panel,`image-${panel.id}-0${reworkSuffix(s,panel.id)}`)),...clips];
 }
 if(kind==='revision'){
  const images=p.panels.filter(panel=>s.targets.includes(panel.id)&&needsImage(s.plan,p,panel.id)).map(panel=>image(panel,`image-${panel.id}-${revision}-${hash({p,notes:s.notes.filter(n=>n.status==='locked')}).slice(0,8)}${reworkSuffix(s,panel.id)}`));
  // Single journey: the revision quote also covers the clips of the changed panels. They are only
  // estimated here (the new image does not exist yet); the worker requests them after the plan swap
  // under the same keys (`clip-N-<new revision>`) as the `video` stage of the same approved work.
  if(!singleJourney(s)||!options.estimate)return images;
  return [...images,...p.panels.filter(panel=>s.targets.includes(panel.id)&&needsClip(s.plan,p,panel.id)).flatMap(panel=>{const r=clipRequest(s,panel,revision,'estimate');return r?[r]:[];})];
 }
 return p.panels.filter(panel=>!s.clips[panel.id]).flatMap(panel=>{const r=clipRequest(s,panel,revision,'throw');return r&&!reusableClip(s,r)?[r]:[];});
}
function clipRequest(s:ComicState,panel:NonNullable<ComicState['plan']>['panels'][number],revision:number,missing:'throw'|'skip'|'estimate'):MediaRequest|null{
 // A local panel (Shimi, 2026-10-25) never reaches the provider: its clip is a free loop of the approved still, no line in any estimate or quote.
 if(panelMotion(panel)==='local')return null;
 let image=Object.values(s.operations).find(o=>o.file===s.images[panel.id])?.requestId;const t=s.timing?.phrases.find(t=>t.phrase===panel.id);let seconds=t?t.end-t.start:undefined;
 if(!image||seconds===undefined){
  if(missing==='throw')throw Error(image?'Panel timing missing.':'An approved panel has no saved media identity.');
  if(missing==='skip')return null;
  image??=STYLE;seconds??=estimatedClipSeconds(panel.narration);
 }
 return {key:`clip-${panel.id}-${revision}${reworkSuffix(s,panel.id)}`,tool:'generate_video',params:clipParams(reworked(s,panel),image,seconds),extension:'mp4'};
}
/** A completed clip of an earlier revision whose exact request (same image, prompt, duration)
 * equals the current one is reused by its panel key, never re-paid. A clip the automatic controls
 * rejected (frozen, flagged) is never reused: its rework must produce a different request. */
export function reusableClip(s:ComicState,r:MediaRequest){
 const panel=r.key.split('-')[1];
 return Object.entries(s.operations).find(([key,o])=>key.startsWith(`clip-${panel}-`)&&key!==r.key&&o.state==='complete'&&!!o.file&&o.fingerprint===hash({...r,key})&&s.controls?.[o.file]?.pass!==false)?.[1];
}
export function adoptReusableClips(s:ComicState){
 const p=s.plan;if(!p)return [];const adopted:number[]=[];
 for(const panel of p.panels){if(s.clips[panel.id])continue;let r:MediaRequest|null;try{r=clipRequest(s,panel,s.revision,'throw');}catch{continue;}const op=r?reusableClip(s,r):undefined;if(op?.file){s.clips[panel.id]=op.file;adopted.push(panel.id);}}
 return adopted;
}
/** Credits one request may cost under an approved quote. Legacy films bind each key to its own
 * line. Single-journey films share the quote's pool: a line plus whatever the other lines did not
 * need, so a clip a second longer than its estimate never stops the film while the total of the
 * approved estimate is never exceeded. A reworked request (`-rwK`) runs under the line it replaces. */
export function allowanceFor(s:ComicState,q:Quote,key:string){
 const base=key.replace(/-rw\d+$/,''),line=q.items[key]??q.items[base];
 if(!singleJourney(s)||line===undefined)return line;
 // A line already sent reserves what it actually cost (reworks included); a line never sent reserves its estimate.
 const reserved=Object.entries(q.items).reduce((sum,[k,v])=>{const sent=Object.entries(s.operations).filter(([ok])=>ok===k||ok.startsWith(`${k}-rw`));return sum+(sent.length?sent.reduce((a,[,o])=>a+o.quotedCredits,0):v);},0);
 return line+Math.max(0,q.credits-reserved);
}
export async function priceComic(s:ComicState,kind:Quote['kind'],gateway:ComicGateway=comicsGateway):Promise<Quote>{
 const config=CustomerPricingSchema.parse((await pool.query("SELECT value FROM settings WHERE key='customer_pricing'")).rows[0]?.value);
 const single=singleJourney(s);
 // Only requests never sent are priced: accepted/complete/sending operations are already
 // counted in `spent` by their quoted credits (no double count on a recovery quote).
 const requests=mediaRequests(s,kind,{estimate:single}).filter(r=>!s.operations[r.key]),items:Record<string,number>={};
 for(const r of requests)items[r.key]=await gateway.cost(r);
 const credits=Object.values(items).reduce((a,b)=>a+b,0),spent=Object.values(s.operations).reduce((a,b)=>a+b.quotedCredits,0);
 const actualAnalysis=Number((await pool.query('SELECT coalesce(sum(real_cost_usd),0) AS cost FROM api_calls WHERE job_id=$1 AND provider=\'openrouter\'',[s.id])).rows[0].cost);
 const remainingInspections=requests.filter(r=>r.tool!=='generate_audio'&&!r.key.startsWith('sheet-')).length,b=comicsBudgets();
 const prior=s.approvedQuotes.at(-1),priorUsd=prior?.totalUsd??0,expires=Date.now()+b.quoteMinutes*60000,inputHash=quoteHash(s,kind);
 if(!single){
  const analysisUsd=actualAnalysis+b.inspectionUsd*remainingInspections,costUsd=(spent+credits)*config.higgsfieldCreditUsd+analysisUsd;
  const totalUsd=Math.max(priorUsd,customerPriceCents(costUsd,config)/100);
  return {id:randomUUID(),kind,items,credits,analysisUsd,costUsd,totalUsd,additionalUsd:totalUsd-priorUsd,expires,inputHash};
 }
 // Shimi's grid of 2026-10-23 for every new Attack film, whatever the admin pricing mode: the first
 // complete version is a tier of its whole estimated supplier cost; each later version is the
 // estimated additional cost x2, rounded up. Direction and inspection allowances come from comicsBudgets().
 const direction=kind==='film'||kind==='revision'?b.directionUsd+(kind==='revision'&&s.pendingSettings?b.finishingUsd:0):0;
 const additionalCostUsd=credits*config.higgsfieldCreditUsd+b.inspectionUsd*remainingInspections+direction;
 const analysisUsd=actualAnalysis+b.inspectionUsd*remainingInspections+direction,costUsd=(spent+credits)*config.higgsfieldCreditUsd+analysisUsd;
 if(kind==='film'){
  // The V1 price covers the whole first version, replacements of its own failed requests included: a
  // re-price only charges a crossed tier (never a second V1).
  const totalUsd=Math.max(priorUsd,firstVersionPriceCents(costUsd)/100);
  return {id:randomUUID(),kind,items,credits,analysisUsd,costUsd,totalUsd,additionalUsd:totalUsd-priorUsd,expires,inputHash,additionalCostUsd};
 }
 // A re-price of the work item already approved (price review, replacement inside a revision) credits what that approval paid.
 const credited=prior&&s.workQuote===prior.id?prior.additionalUsd:0;
 const additionalUsd=Math.max(0,revisionPriceCents(additionalCostUsd)/100-credited);
 return {id:randomUUID(),kind,items,credits,analysisUsd,costUsd,totalUsd:priorUsd+additionalUsd,additionalUsd,expires,inputHash,additionalCostUsd};
}
