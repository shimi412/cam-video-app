import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {z} from 'zod';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {higgsfieldAccessToken} from '../providers/higgsfield-auth';
import {assertCamConfigured,assertAuthorizedExecution} from '../providers/live-policy';
import {providerFetch} from '../providers/network';
import {mcpData,providerOutputUrl} from '../concept/provider-transports';
import {hash,type ComicState,type Operation} from './model';
import {comicDirectory} from './store';
import {comicsBudgets} from './budgets';
import {ComicStop,MediaFailed,ProviderToolError} from './errors';
export type MediaRequest={key:string;tool:'generate_image'|'generate_video'|'generate_audio';params:Record<string,unknown>;extension:'png'|'mp4'|'audio'};
export type ComicGateway={cost:(r:MediaRequest)=>Promise<number>;media:(s:ComicState,r:MediaRequest,allowance:number,save:()=>Promise<void>)=>Promise<{file:string;requestId:string}|null>};
type Call=(name:string,args:Record<string,unknown>)=>Promise<unknown>;
async function connection<T>(work:(call:Call)=>Promise<T>){
 assertCamConfigured();const token=await higgsfieldAccessToken();if(!token)throw Error('The media connection is not configured.');
 const client=new Client({name:'cam-comics',version:'1'}),transport=new StreamableHTTPClientTransport(new URL('https://mcp.higgsfield.ai/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}},reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1000,maxReconnectionDelay:1000,reconnectionDelayGrowFactor:1}});
 try{await client.connect(transport);return await work(async(name,args)=>{const raw=await client.callTool({name,arguments:args},undefined,{timeout:comicsBudgets().mcpTimeoutMs});return providerData(raw);});}finally{await client.close();}
}
/** isError is the provider's definitive refusal; anything else goes through Clay's parser. */
export function providerData(raw:unknown){
 const envelope=z.object({isError:z.boolean().optional(),content:z.array(z.object({type:z.string(),text:z.string().optional()})).optional()}).passthrough().safeParse(raw);
 if(envelope.success&&envelope.data.isError)throw new ProviderToolError((envelope.data.content??[]).map(c=>c.text??'').join(' ').replace(/\s+/g,' ').slice(0,300)||'The media service refused the request.');
 return mcpData(raw);
}
const PENDING=['pending','waiting','queued','dna','script','visuals','vision','flow','in_progress','ip_detect'],FAILED=['failed','canceled','nsfw','ip_detected'];
const Cost=z.object({adjustments:z.record(z.string(),z.unknown()).optional(),cost:z.object({credits:z.number().finite().nonnegative(),credits_exact:z.number().finite().nonnegative().optional()})});
/** Exact price, mirroring Clay's live-proven transport: a keyword match can return a preset
 * offer instead of a price; decline it literally with the documented identifier and price
 * again. A provider that adjusts the requested settings is refused before any submission. */
export async function exactCost(call:Call,r:MediaRequest){
 let params:Record<string,unknown>={...r.params,use_unlim:false},quoted=await call(r.tool,{params:{...params,get_cost:true}}),declinedPresetId:string|undefined;
 const offer=z.object({notice:z.object({type:z.literal('preset_recommendation'),data:z.object({preset:z.object({id:z.uuid()}),retry_literal_with:z.object({declined_preset_id:z.uuid()}).strict()})})}).safeParse(quoted);
 if(offer.success){const d=offer.data.notice.data;if(d.preset.id!==d.retry_literal_with.declined_preset_id)throw new ComicStop('needs-attention','Scene pricing returned a conflicting suggestion. Nothing was generated; your work is saved.');declinedPresetId=d.preset.id;params={...params,declined_preset_id:declinedPresetId};quoted=await call(r.tool,{params:{...params,get_cost:true}});}
 const c=Cost.safeParse(quoted);if(!c.success)throw Error('The media price could not be read. Nothing was generated.');
 if(Object.keys(c.data.adjustments??{}).length)throw new ComicStop('needs-attention','The media service changed the requested settings. Nothing was generated; your work is saved.',`Provider adjustments: ${JSON.stringify(c.data.adjustments).slice(0,300)}`);
 return {credits:c.data.cost.credits_exact??c.data.cost.credits,params,declinedPresetId};
}
/** The first array of objects with an id in a listing answer (field name not contractually fixed). */
function listed(value:unknown):{id:string;params?:Record<string,unknown>;created_at?:unknown}[]{
 if(Array.isArray(value))return value.filter(v=>v&&typeof v==='object'&&typeof (v as {id?:unknown}).id==='string') as {id:string}[];
 if(value&&typeof value==='object')for(const v of Object.values(value)){const found=listed(v);if(found.length)return found;}
 return [];
}
/** A submission whose answer never arrived (timeout, dropped connection) is reconciled by
 * listing recent jobs of the same type: exactly one unclaimed job with the same prompt is
 * adopted; several are ambiguous (supervisor); none after the bounded window is a confirmed
 * failure, which leads to the separately priced replacement. Never a blind resubmission. */
export async function reconcileSubmission(call:Call,s:ComicState,r:MediaRequest,op:Operation,now=Date.now()){
 const b=comicsBudgets(),attempts=op.reconcileAttempts??0,sentAt=op.sentAt??0;
 if(now<sentAt+attempts*60_000)return false;
 const type=r.tool==='generate_video'?'video':r.tool==='generate_audio'?'audio':'image';
 const claimed=new Set(Object.values(s.operations).map(o=>o.requestId).filter(Boolean));
 const matches=listed(await call('show_generations',{only_completed:false,size:50,type})).filter(g=>!claimed.has(g.id)&&g.params?.prompt===r.params.prompt);
 if(matches.length>1)throw Error('Several provider jobs match an unanswered submission. Reconciliation needs review; nothing was resubmitted.');
 if(matches.length===1){op.requestId=matches[0].id;op.state='accepted';op.error=undefined;return true;}
 op.reconcileAttempts=attempts+1;
 if(op.reconcileAttempts>=b.reconcileAttempts&&now-sentAt>=b.reconcileAfterMs){op.state='failed';op.error='The submission was not found at the provider after reconciliation.';throw new MediaFailed(r.key,op.error);}
 return false;
}
export const comicsGateway:ComicGateway={
 async cost(r){return connection(async call=>(await exactCost(call,r)).credits);},
 async media(s,r,allowance,save){
  assertAuthorizedExecution();const fingerprint=hash(r);let op=s.operations[r.key];
  if(op&&op.fingerprint!==fingerprint)throw Error('A saved request has different inputs. No generation was started.');
  if(op?.state==='failed')throw new MediaFailed(r.key,op.error??'This panel failed. A new priced revision is required.');
  if(op?.state==='complete'&&op.file){const bytes=await readFile(path.join(comicDirectory(s.id),op.file));if(createHash('sha256').update(bytes).digest('hex')!==op.sha)throw Error('A completed media file changed.');return {file:op.file,requestId:op.requestId!};}
  return connection(async call=>{
   if(!op){
    const priced=await exactCost(call,r);
    if(!Number.isFinite(allowance)||priced.credits>allowance+1e-8)throw new ComicStop('review-budget','The media price changed since your approval. Review the updated price; nothing new was generated and your work is saved.');
    op={fingerprint,state:'sending',quotedCredits:priced.credits,sentAt:Date.now(),...(priced.declinedPresetId?{declinedPresetId:priced.declinedPresetId}:{})};s.operations[r.key]=op;await save();
    assertAuthorizedExecution();
    let answer:unknown;
    try{answer=await call(r.tool,{params:priced.params});}
    catch(e){
     if(e instanceof ProviderToolError){op.state='failed';op.error=`The media service refused this request: ${e.message}`;await save();throw new MediaFailed(r.key,op.error);}
     op.error=`Submission outcome unknown: ${e instanceof Error?e.message.slice(0,200):'no answer'}`;await save();return null;
    }
    const result=z.object({adjustments:z.record(z.string(),z.unknown()).optional(),results:z.array(z.object({id:z.string().min(1)})).length(1)}).safeParse(answer);
    if(!result.success){op.error='Submission answer could not be read; reconciling.';await save();return null;}
    op.state='accepted';op.requestId=result.data.results[0].id;if(Object.keys(result.data.adjustments??{}).length)op.adjustments=result.data.adjustments;await save();
   }
   if(op.state==='sending'){if(!await reconcileSubmission(call,s,r,op)){await save();return null;}await save();}
   const result=z.object({jobs:z.array(z.object({job_id:z.string(),status:z.string(),result_url:z.string().optional()})).length(1)}).parse(await call('jobs_wait',{jobs:[{job_id:op.requestId,index:0}],timeout_seconds:0}));
   const job=result.jobs[0];if(job.job_id!==op.requestId)throw Error('Media identity mismatch.');
   if(FAILED.includes(job.status)){op.state='failed';op.error=`The media service ended this request (${job.status}).`;await save();throw new MediaFailed(r.key,op.error);}
   if(PENDING.includes(job.status))return null;
   if(job.status!=='completed')throw Error('Cannot determine the media job status. Resume polling the saved request ID.');
   const url=providerOutputUrl(job.result_url,'higgsfield','live');op.url=url;await save();
   const response=await providerFetch(url,{redirect:'error'});if(!response.ok||!response.body)throw Error('The completed file could not be retrieved.');
   const limit=comicsBudgets().downloadMaxBytes,reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('Media exceeds the download limit.');}chunks.push(value);}}finally{reader.releaseLock();}
   const bytes=Buffer.concat(chunks),sha=createHash('sha256').update(bytes).digest('hex'),file=`${r.key}-${sha.slice(0,16)}.${r.extension}`;
   if(!/^[a-z0-9-]+\.(png|mp4|audio)$/.test(file))throw Error('Invalid media name.');await mkdir(comicDirectory(s.id),{recursive:true});await writeFile(path.join(comicDirectory(s.id),file),bytes);
   op.state='complete';op.file=file;op.sha=sha;await save();return {file,requestId:op.requestId!};
  });
 }
};
