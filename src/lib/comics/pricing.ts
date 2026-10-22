import {randomUUID} from 'node:crypto';
import {pool} from '@/db';
import {CustomerPricingSchema} from '../customer-wallet';
import {customerPriceCents} from '../customer-price';
import {sheetParams,imageParams,clipParams,voiceParams,STYLE} from './prompts';
import {hash,quoteHash,type ComicState,type Quote} from './model';
import {comicsGateway,type ComicGateway,type MediaRequest} from './provider';
import {comicsBudgets} from './budgets';
export const needsImage=(a:ComicState['plan'],b:ComicState['plan'],id:number)=>{const keys=['scene','hero','color'] as const;return keys.some(k=>a?.panels[id-1]?.[k]!==b?.panels[id-1]?.[k]);};
export const needsClip=(a:ComicState['plan'],b:ComicState['plan'],id:number)=>needsImage(a,b,id)||(['action','camera','preserve'] as const).some(k=>a?.panels[id-1]?.[k]!==b?.panels[id-1]?.[k]);
/** A panel whose generation request was refused carries a director overlay for the next attempt;
 * the approved plan, its hashes and the storyboard text are unchanged (Shimi, 2026-10-22). */
export const reworked=(s:ComicState,panel:NonNullable<ComicState['plan']>['panels'][number])=>{const o=s.reworkedPanels?.[panel.id];return o?{...panel,scene:o.scene,action:o.action,preserve:o.preserve}:panel;};
export const reworkSuffix=(s:ComicState,panel:number)=>{const n=s.reworks?.[panel]?.length??0;return n?`-rw${n}`:'';};
export function mediaRequests(s:ComicState,kind:Quote['kind']):MediaRequest[]{
 const p=s.proposal??s.plan;if(!p)throw Error('Plan missing.');const revision=kind==='revision'?s.revision+1:s.revision;
 const sheets=Object.entries(s.operations).filter(([key,o])=>key.startsWith('sheet-')&&o.state==='complete');const sheet=sheets.at(-1)?.[1].requestId??STYLE;
 if(kind==='prepare')return [{key:'voice-0',tool:'generate_audio',params:voiceParams(s.script),extension:'audio'},{key:'sheet-0',tool:'generate_image',params:sheetParams(p),extension:'png'},...p.panels.map(panel=>({key:`image-${panel.id}-${revision}${reworkSuffix(s,panel.id)}`,tool:'generate_image' as const,params:imageParams(reworked(s,panel),sheet),extension:'png' as const}))];
 if(kind==='revision')return p.panels.filter(panel=>s.targets.includes(panel.id)&&needsImage(s.plan,p,panel.id)).map(panel=>({key:`image-${panel.id}-${revision}-${hash({p,notes:s.notes.filter(n=>n.status==='locked')}).slice(0,8)}${reworkSuffix(s,panel.id)}`,tool:'generate_image',params:imageParams(reworked(s,panel),sheet),extension:'png'}));
 return p.panels.filter(panel=>!s.clips[panel.id]).map(panel=>clipRequest(s,panel,revision)).filter(r=>!reusableClip(s,r));
}
function clipRequest(s:ComicState,panel:NonNullable<ComicState['plan']>['panels'][number],revision:number):MediaRequest{
 const image=Object.values(s.operations).find(o=>o.file===s.images[panel.id])?.requestId;if(!image)throw Error('An approved panel has no saved media identity.');const t=s.timing?.phrases.find(t=>t.phrase===panel.id);if(!t)throw Error('Panel timing missing.');
 return {key:`clip-${panel.id}-${revision}${reworkSuffix(s,panel.id)}`,tool:'generate_video',params:clipParams(reworked(s,panel),image,t.end-t.start),extension:'mp4'};
}
/** A completed clip of an earlier revision whose exact request (same image, action,
 * camera, duration) equals the current one is reused by its panel key, never re-paid. */
export function reusableClip(s:ComicState,r:MediaRequest){
 const panel=r.key.split('-')[1];
 return Object.entries(s.operations).find(([key,o])=>key.startsWith(`clip-${panel}-`)&&key!==r.key&&o.state==='complete'&&!!o.file&&o.fingerprint===hash({...r,key}))?.[1];
}
export function adoptReusableClips(s:ComicState){
 const p=s.plan;if(!p)return [];const adopted:number[]=[];
 for(const panel of p.panels){if(s.clips[panel.id])continue;let r:MediaRequest;try{r=clipRequest(s,panel,s.revision);}catch{continue;}const op=reusableClip(s,r);if(op?.file){s.clips[panel.id]=op.file;adopted.push(panel.id);}}
 return adopted;
}
export async function priceComic(s:ComicState,kind:Quote['kind'],gateway:ComicGateway=comicsGateway):Promise<Quote>{
 const config=CustomerPricingSchema.parse((await pool.query("SELECT value FROM settings WHERE key='customer_pricing'")).rows[0]?.value);
 // Only requests never sent are priced: accepted/complete/sending operations are already
 // counted in `spent` by their quoted credits (no double count on a recovery quote).
 const requests=mediaRequests(s,kind).filter(r=>!s.operations[r.key]),items:Record<string,number>={};
 for(const r of requests)items[r.key]=await gateway.cost(r);
 const credits=Object.values(items).reduce((a,b)=>a+b,0),spent=Object.values(s.operations).reduce((a,b)=>a+b.quotedCredits,0);
 const actualAnalysis=Number((await pool.query('SELECT coalesce(sum(real_cost_usd),0) AS cost FROM api_calls WHERE job_id=$1 AND provider=\'openrouter\'',[s.id])).rows[0].cost);
 const remainingInspections=requests.filter(r=>r.tool!=='generate_audio'&&!r.key.startsWith('sheet-')).length;
 const analysisUsd=actualAnalysis+comicsBudgets().inspectionUsd*remainingInspections,costUsd=(spent+credits)*config.higgsfieldCreditUsd+analysisUsd;
 const prior=s.approvedQuotes.at(-1)?.totalUsd??0,totalUsd=Math.max(prior,customerPriceCents(costUsd,config)/100);
 return {id:randomUUID(),kind,items,credits,analysisUsd,costUsd,totalUsd,additionalUsd:totalUsd-prior,expires:Date.now()+comicsBudgets().quoteMinutes*60000,inputHash:quoteHash(s,kind)};
}
