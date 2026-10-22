import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {runAgent} from './runtime';
import {digest} from './store';
import {getSetting} from '../settings';
import {createHash} from 'node:crypto';
export type DeliveryReviewInput={jobId:string;category:'clay'|'motion'|'comics';mediaHash:string;file:string;script:string;facts:unknown;evidence?:string[]};
const Decision=z.object({mediaHash:z.string(),ready:z.boolean(),reason:z.string().min(10).max(1000),corrections:z.array(z.string().min(5).max(500)).max(12)}).strict();
/** A final release is a Claude decision bound to the client's exact reviewed bytes.
 * The application still enforces ownership, approval and wallet invariants. */
async function inspectDelivery(input:DeliveryReviewInput){
 const actual=createHash('sha256').update(await readFile(input.file)).digest('hex');
 if(actual!==input.mediaHash)throw Error('The reviewed file changed. Review its latest version.');
 const images:Uint8Array[]=[];
 for(const file of(input.evidence??[]).slice(0,3)){const bytes=await readFile(file);if(bytes.length>8*1024*1024)throw Error('Final review evidence is too large.');images.push(bytes);}
 const model=await getSetting<string>('ai_deep_model')??'anthropic/claude-sonnet-5';
 if(!model.startsWith('anthropic/claude-'))throw Error('Configure Claude supervision before continuing.');
 const prompt=JSON.stringify({category:input.category,mediaHash:actual,script:input.script,production:input.facts,evidence:images.length,samplingNotice:'These are sampled frames and measured audio results, not video playback or listening. The client has explicitly approved this exact final version.'});
 const result=await runAgent({session:input.jobId,jobId:input.jobId,turn:`delivery-${digest({prompt,model,images:images.map(i=>createHash('sha256').update(i).digest('hex'))})}`,model,skill:'cam-finishing',contextReads:0,system:'Supervise release of the exact completed film after the client’s final approval. Review current evidence, execution results, unresolved feedback and prior approvals. ready=true only if no known requested correction remains unresolved and the facts support delivery. Do not invent another aesthetic request or overrule a deliberate client choice. Return concrete corrections for actual unresolved issues; do not claim listening or complete motion inspection from frames. Never infer human approval, waive a failed technical check, change the price, or generate media. The application executes your release decision and records it in the same session.',prompt,images,schema:Decision,maximumUsd:.25,maxOutputTokens:1500,minimumOutputTokens:400,validate:r=>{if(r.mediaHash!==actual||r.ready&&r.corrections.length||!r.ready&&!r.corrections.length)throw Error('Bind a consistent release decision to the exact reviewed file.');return r;}});
 if(!result.ready)throw Error(`Final review: ${result.corrections.join(' ')}`);
 return result;
}
export const deliveryReviewDependencies={review:inspectDelivery};
export const reviewDelivery=(input:DeliveryReviewInput)=>deliveryReviewDependencies.review(input);
