import {supervisedStep} from '../agent/recovery-step';
import {planPipelineRecovery,recoveryDiagnostic} from '../agent/recovery-supervisor';
import {freshPipelineRecovery,recoveryCapabilities,recoveryView,consumeRecovery} from '../agent/recovery-policy';
import {createHash} from 'node:crypto';
import {reviewDelivery} from '../agent/delivery-review';
import {z} from 'zod';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pool} from '@/db';
import {withCamExecution} from '../providers/live-policy';
import {settleCredits} from '../customer-wallet';
import {observeVideo} from '../agent/observations';
import {AIHttpTransient} from '../agent/transport';
import {ComicStop,MediaFailed} from './errors';
import {comicsBudgets} from './budgets';
import {directComic,directComicFinishing,comicsReady,reworkComicPanel} from './director';
import {comicsGateway,type ComicGateway} from './provider';
import {mediaRequests,priceComic,needsClip,adoptReusableClips,allowanceFor,reworked} from './pricing';
import {alignComicVoice} from './voice';
import {inspectComicMedia} from './inspection';
import {frameCheck,clipMotion,localClip,FROZEN_CLIP_ENERGY} from './controls';
import {buildComic} from './render';
import {createComic,getComic,saveComic,lockComic,holdComic,comicDirectory} from './store';
import {hash,boardHash,quoteHash,publicComic,assertChecks,panelNotes,singleJourney,panelMotion,IMAGE_REDRAW_FLAGS,CLIP_REWORK_FLAGS,type ComicState,type Note,type Quote,type Inspection} from './model';
import type {MediaRequest} from './provider';
export const comicDependencies={direct:directComic,finishing:directComicFinishing,gateway:comicsGateway,price:priceComic,align:alignComicVoice,inspect:inspectComicMedia,build:buildComic,authorize:withCamExecution,preflight:comicsReady,rework:reworkComicPanel,
 /** 2026-10-25: deterministic still check (sandboxed Python), clip motion energy (ffmpeg) and the free local clip of a still. */
 frameCheck,clipMotion,localClip};
export type ComicDependencies=typeof comicDependencies;
function supervisedComicDependencies(deps:ComicDependencies):ComicDependencies{
 const step=<T>(s:ComicState,stage:string,inputs:unknown,execute:()=>Promise<T>)=>supervisedStep({jobId:s.id,category:'comics',stage,inputs,directory:comicDirectory(s.id),assertOwned:async()=>{},execute});
 return {...deps,direct:(s,notes)=>step(s,'direction',{script:s.script,revision:s.revision,plan:s.plan,notes},()=>deps.direct(s,notes)),finishing:(s,notes)=>step(s,'finishing-feedback',{revision:s.revision,notes,settings:s.settings},()=>deps.finishing(s,notes)),price:(s,kind,gateway)=>step(s,'price',{kind,input:quoteHash(s,kind),operations:s.operations},()=>deps.price(s,kind,gateway))};
}
const Start=z.object({requestId:z.uuid(),title:z.string().trim().min(1).max(80),script:z.string().trim().min(20).max(12000)}).strict();
export async function prepareComic(actor:string,input:unknown,deps:ComicDependencies=comicDependencies){
 deps=supervisedComicDependencies(deps);const p=Start.parse(input);await createComic(actor,p.requestId,p.title,p.script);
 return lockComic(p.requestId,async()=>{const s=await getComic(p.requestId,actor);if(s.plan&&s.quote)return publicComic(s);if(!s.plan){await deps.preflight();const directed=await deps.direct(s);s.plan=directed.plan;await saveComic(s);}
  // Single journey (Shimi, 2026-10-23): one estimate for the complete first version (delay from the panel count, price by the common grid on the whole estimated supplier cost), then V1 without any intermediate gate.
  if(singleJourney(s)){s.quote=await deps.price(s,'film',deps.gateway);s.phase='estimate';s.progress='Your estimate is ready';}
  else{s.quote=await deps.price(s,'prepare',deps.gateway);s.phase='preparation-price';s.progress='Your storyboard preparation price is ready';}
  await saveComic(s);return publicComic(s);});
}
const Action=z.discriminatedUnion('type',[
 z.object({type:z.literal('approve-price'),quoteId:z.string()}),z.object({type:z.literal('refresh-price')}),
 z.object({type:z.literal('lock-feedback'),id:z.uuid(),text:z.string().trim().min(3).max(2000),targets:z.array(z.number().int().positive()).min(1).max(24),stage:z.enum(['board','visuals','finishing'])}),
 z.object({type:z.literal('remove-feedback'),id:z.uuid()}),
 z.object({type:z.literal('apply-feedback')}),
 z.object({type:z.literal('approve-board'),boardHash:z.string(),votes:z.record(z.string(),z.boolean())}),
 z.object({type:z.literal('approve-visuals'),mediaHash:z.string()}),
 z.object({type:z.literal('finishing'),music:z.enum(['normal','quiet','off']),captions:z.boolean()}),
 z.object({type:z.literal('approve-final'),mediaHash:z.string(),resolved:z.array(z.uuid())}),
 /** Single journey: the client approves the complete version they watched; settlement and download follow. */
 z.object({type:z.literal('approve-version'),mediaHash:z.string(),resolved:z.array(z.uuid())}),
 z.object({type:z.literal('recovery-price')}),z.object({type:z.literal('replacement-price')}),z.object({type:z.literal('resume')}),z.object({type:z.literal('save')})
]);
export async function actComic(id:string,actor:string,input:unknown,deps:ComicDependencies=comicDependencies){
 const a=Action.parse(input);deps=supervisedComicDependencies(deps);
 return lockComic(id,async()=>{
  const s=await getComic(id,actor),plan=s.plan,single=singleJourney(s);
  if(a.type==='save'){await pool.query('UPDATE jobs SET saved_to_library=true WHERE id=$1',[id]);s.saved=true;}
  else if(a.type==='lock-feedback'||a.type==='remove-feedback'){
   if(s.queued||!['board','visuals','finishing','blocked','review'].includes(s.phase))throw Error('Wait for the current change to finish before editing feedback.');
   if(a.type==='lock-feedback'){
    if(a.targets.some(n=>!plan?.panels.some(p=>p.id===n)))throw Error('Choose valid panels.');
    const note:Note={id:a.id,text:a.text,targets:[...new Set(a.targets)],stage:a.stage,status:a.stage==='finishing'?'deferred':'locked'};
    const previous=s.notes.find(n=>n.id===a.id);if(previous?.status==='applied')throw Error('Add a new note for another correction.');
    s.notes=s.notes.filter(n=>n.id!==a.id).concat(note);
   }else s.notes=s.notes.filter(n=>n.id!==a.id||n.status==='applied');
   if(s.quote?.kind==='revision'){s.quote=undefined;s.proposal=undefined;if(single){s.pendingSettings=undefined;s.pendingResolved=undefined;s.unresolved=undefined;s.targets=[];}}s.error=undefined;
  }else if(a.type==='apply-feedback'&&single){
   // One batch over the complete version: the director interprets every locked note (visual notes
   // change panels, finishing notes go to the finishing director), then one revision quote shows
   // only the additional price. Nothing is generated before that price is approved.
   if(s.queued||!['review','blocked'].includes(s.phase))throw Error('Feedback can be applied once the current version is ready.');
   const notes=s.notes.filter(n=>n.status==='locked');if(!notes.length)throw Error('Lock at least one note first.');
   if(s.quote?.kind==='revision'&&s.quote.inputHash===quoteHash(s,'revision'))return publicComic(s);
   const directed=await deps.direct(s,notes),deferred=notes.filter(n=>directed.deferred.includes(n.id));
   s.targets=directed.plan.panels.filter((p,i)=>hash(p)!==hash(plan!.panels[i])).map(p=>p.id);
   s.proposal=s.targets.length?directed.plan:undefined;s.pendingSettings=undefined;s.pendingResolved=undefined;s.unresolved=undefined;s.quote=undefined;
   // A redrawn panel starts with a fresh rework budget and no overlay from an earlier refusal: the new composition is the director's.
   for(const t of s.targets){if(s.reworkedPanels)delete s.reworkedPanels[t];if(s.reworks)delete s.reworks[t];}
   if(deferred.length){const result=await deps.finishing(s,deferred);if(result.applied.length){s.pendingSettings=result.settings;s.pendingResolved=result.applied;}s.unresolved=result.unresolved;}
   if(!s.targets.length&&!s.pendingSettings){
    if(!s.unresolved?.length)s.unresolved=notes.map(n=>({id:n.id,reason:'This note did not lead to a change we can make. Please say what should change, and in which panel.'}));
    s.progress='Your notes need a more precise request';
   }else{s.quote=await deps.price(s,'revision',deps.gateway);s.progress='Review the price of your next version';}
  }else if(a.type==='apply-feedback'){
   if(s.phase==='finishing'||s.phase==='blocked'&&s.work==='finish'){
    const notes=s.notes.filter(n=>n.status==='deferred'||n.status==='locked');if(!notes.length)throw Error('Lock at least one note first.');
    const result=await deps.finishing(s,notes);s.settings=result.settings;s.pendingResolved=result.applied;s.unresolved=result.unresolved;
    if(result.applied.length){s.recovery=freshPipelineRecovery();s.work='finish';s.phase='working';s.queued=true;s.progress='Applying your finishing feedback';}
    await saveComic(s);return publicComic(s);
   }
   if(s.queued||!['board','visuals','blocked'].includes(s.phase))throw Error('Feedback cannot be applied at this step.');
   const notes=s.notes.filter(n=>n.status==='locked');if(!notes.length)throw Error('Lock at least one note first.');
   if(s.quote?.kind==='revision'&&s.quote.inputHash===quoteHash(s,'revision'))return publicComic(s);
   const directed=await deps.direct(s,notes);for(const note of s.notes)if(directed.deferred.includes(note.id))note.status='deferred';
   s.targets=directed.plan.panels.filter((p,i)=>hash(p)!==hash(plan!.panels[i])).map(p=>p.id);
   if(!s.targets.length){if(s.notes.some(n=>n.status==='locked'))throw Error('The requested visual change has not been resolved. Your notes are still locked.');s.progress='Your finishing notes are saved for the next step';}
   else{s.proposal=directed.plan;s.quote=await deps.price(s,'revision',deps.gateway);s.progress='Review the additional price before applying your changes';}
  }else if(a.type==='refresh-price'){
   if(s.queued||!s.quote||s.phase==='blocked')throw Error('Review the saved work before refreshing its price.');
   s.quote=await deps.price(s,s.quote.kind,deps.gateway);s.progress='Your updated price is ready';
  }else if(a.type==='approve-price'){
   const q=s.quote;if(!q||q.id!==a.quoteId||q.expires<Date.now()||q.inputHash!==quoteHash(s,q.kind))throw Error('Review the current price before continuing.');
   if(s.approvedQuotes.some(old=>old.id===q.id))return publicComic(s);
   if(s.queued)throw Error('Work is already running.');
   if(q.kind==='video'&&!single&&s.approved.board!==boardHash(s))throw Error('Approve the current storyboard first.');
   await holdComic(s,q);s.recovery=freshPipelineRecovery();s.stop=undefined;s.transientRetries=0;s.approvedQuotes.push(q);s.work=q.kind==='prepare'?'prepare':q.kind==='video'?'video':q.kind==='film'?'film':'revision';s.workQuote=q.id;s.queued=true;s.phase='working';s.error=undefined;
   s.progress=single?q.kind==='film'?'Recording your narration':q.kind==='video'?'Animating the remaining scenes':'Preparing your next version':q.kind==='video'?'Preparing all video scenes':'Preparing your storyboard images';
  }else if(a.type==='approve-version'){
   if(!single||s.phase!=='review'||!s.mediaHash||s.mediaHash!==a.mediaHash)throw Error('Watch and approve the current version first.');
   if(s.notes.some(n=>n.status==='locked'))throw Error('Review your locked notes: apply or remove them before approving this version.');
   if(s.notes.some(n=>n.status==='deferred'&&!a.resolved.includes(n.id)))throw Error('Review your saved notes before approving.');
   for(const n of s.notes)if(n.status==='deferred')n.status='applied';
   const bytes=await readFile(path.join(comicDirectory(id),s.media!));if(hash(bytes.toString('base64'))!==s.mediaHash)throw Error('The reviewed file changed.');
   // As for the legacy final approval: the client's explicit approval releases the download; the delivery review is consultative.
   try{await reviewDelivery({jobId:id,category:'comics',mediaHash:createHash('sha256').update(bytes).digest('hex'),file:path.join(comicDirectory(id),s.media!),script:s.script,facts:{humanApproval:`This approval of version ${s.filmVersion??1}`,version:s.filmVersion,checks:s.checks,settings:s.settings,notes:s.notes,unresolved:s.unresolved,stillFallbacks:s.fallbacks,consultativeNotes:Object.fromEntries((s.plan?.panels??[]).map(p=>[p.id,panelNotes(s,p.id)])),audioReview:s.audioReview}});s.deliveryNotes=undefined;}
   catch(error){const message=error instanceof Error?error.message:String(error);if(!message.startsWith('Final review:'))throw error;s.deliveryNotes=message.slice('Final review:'.length).trim();}
   s.approved={visuals:s.mediaHash,final:s.mediaHash};s.phase='complete';s.progress='Your approved film is ready';await settleCredits(id,true);
  }else if(a.type==='approve-board'){
   if(s.phase!=='board'||a.boardHash!==boardHash(s)||s.notes.some(n=>n.status==='locked')||!plan||plan.panels.some(p=>!s.images[p.id]||a.votes[p.id]!==true))throw Error('Review and approve every current storyboard panel first.');
   s.votes=a.votes;s.approved.board=boardHash(s);s.quote=await deps.price(s,'video',deps.gateway);s.phase='video-price';s.progress='Your video price is ready';
  }else if(a.type==='approve-visuals'){
   if(s.phase!=='visuals'||!s.mediaHash||a.mediaHash!==s.mediaHash||s.notes.some(n=>n.status==='locked'))throw Error('Review the complete current film and apply its visual feedback first.');
   s.approved.visuals=s.mediaHash;s.phase='finishing';s.progress='Review sound, editing and subtitles';
  }else if(a.type==='finishing'){
   if(s.phase!=='finishing')throw Error('Finishing is available after visual approval.');
   s.settings={music:a.music,captions:a.captions};s.approved.final=undefined;s.work='finish';s.queued=true;s.phase='working';s.progress='Updating sound and subtitles';
  }else if(a.type==='approve-final'){
   if(s.phase!=='finishing'||!s.mediaHash||s.mediaHash!==a.mediaHash||!s.approved.visuals)throw Error('Watch and approve the current finished film first.');
   if(s.notes.some(n=>n.status==='deferred'&&!a.resolved.includes(n.id)))throw Error('Review your saved finishing notes before approving.');
   for(const n of s.notes)if(n.status==='deferred')n.status='applied';
   const bytes=await readFile(path.join(comicDirectory(id),s.media!));if(hash(bytes.toString('base64'))!==s.mediaHash)throw Error('The reviewed file changed.');
   // Senior review 2026-10-21, as in Motion: the client's explicit approval is the release gate.
   // Claude's delivery review is kept as recorded notes; it no longer locks a paid download.
   try{await reviewDelivery({jobId:id,category:'comics',mediaHash:createHash('sha256').update(bytes).digest('hex'),file:path.join(comicDirectory(id),s.media!),script:s.script,facts:{humanApproval:'This final approval action',approved:s.approved,checks:s.checks,settings:s.settings,notes:s.notes,unresolved:s.unresolved,stillFallbacks:s.fallbacks,consultativeNotes:Object.fromEntries((s.plan?.panels??[]).map(p=>[p.id,panelNotes(s,p.id)])),audioReview:s.audioReview}});s.deliveryNotes=undefined;}
   catch(error){const message=error instanceof Error?error.message:String(error);if(!message.startsWith('Final review:'))throw error;s.deliveryNotes=message.slice('Final review:'.length).trim();}
   s.approved.final=s.mediaHash;s.phase='complete';s.progress='Your approved film is ready';await settleCredits(id,true);
  }else if(a.type==='recovery-price'){
   if(s.phase!=='blocked'||(s.stop?s.stop.kind!=='review-budget':s.recovery?.current?.decision?.action!=='review-budget')||!s.work||s.work==='finish')throw Error('The current recovery decision does not request a new price.');
   const kind=workKind(s);s.quote=await deps.price(s,kind,deps.gateway);s.phase=single?kind==='film'?'estimate':'review':s.work==='video'?'video-price':'preparation-price';s.error=undefined;s.stop=undefined;if(single)s.progress='Review the updated price to continue';
  }else if(a.type==='replacement-price'){
   if(s.phase!=='blocked'||!(s.work==='video'||single&&s.work==='film'))throw Error('A replacement price is not available at this step.');
   // A confirmed provider failure is deterministic: no paid diagnosis before offering its replacement price.
   if(s.stop?.kind!=='replace-failed'){await superviseComicFailure(s,()=>saveComic(s));if(s.recovery?.current?.decision?.action!=='replace-failed')throw Error('The saved recovery analysis does not request a replacement.');}
   const kind=workKind(s),missing=mediaRequests(s,kind).filter(r=>r.key.startsWith('clip-'));if(!missing.length||missing.some(r=>s.operations[r.key]?.state!=='failed'))throw Error('The saved requests need reconciliation before replacement pricing.');
   // The replacement is a new request identity with its own bounded reworks; the failed attempts and their receipts stay in the journal.
   if(single)for(const r of missing){const panel=panelOf(r.key);if(s.reworks)delete s.reworks[panel];}
   s.revision++;s.quote=await deps.price(s,kind,deps.gateway);s.phase=single?kind==='film'?'estimate':'review':'video-price';s.error=undefined;s.stop=undefined;s.progress=single?'Review the updated price to finish this version; completed scenes are preserved':'Review the replacement price; completed scenes are preserved';
  }else if(a.type==='resume'){
   if(s.phase!=='blocked'||!s.work)throw Error('There is no interrupted work to resume.');
   s.recovery??=freshPipelineRecovery();s.error??='Interrupted saved work requires analysis.';s.stop=undefined;s.transientRetries=0;s.resumeRequested=true;await superviseComicFailure(s,()=>saveComic(s));
   if(s.recovery.current?.decision?.action==='retry-saved'&&!s.recovery.exhausted){s.queued=true;s.phase='working';}

  }
  await saveComic(s);await observeVideo(id,async()=>({category:'comics',action:a.type,phase:s.phase,revision:s.revision,notes:s.notes,approved:s.approved}));return publicComic(s);
 });
}
/** The quote kind a work item is priced and executed under. */
const workKind=(s:ComicState):Quote['kind']=>s.work==='prepare'?'prepare':s.work==='revision'?'revision':s.work==='film'?'film':'video';
const mismatch=()=>new ComicStop('needs-attention','The saved work no longer matches its approved price. Your work is saved; review the current price before continuing.','The saved work no longer matches its approved price.');
function approvedWork(s:ComicState){
 const q=s.approvedQuotes.at(-1);if(s.work==='finish')return q;
 if(singleJourney(s)){
  // The running work item is bound to the identity of the quote the client approved (`workQuote`). Until a revision's plan
  // swap, the priced inputs must also be the saved ones; after it the same approved quote carries the clips and the build.
  if(!q||q.id!==s.workQuote)throw mismatch();
  if((s.work==='film'||s.work==='revision')&&q.kind===workKind(s)&&q.inputHash!==quoteHash(s,q.kind))throw mismatch();
  return q;
 }
 const kind=workKind(s);if(!q||q.kind!==kind||q.inputHash!==quoteHash(s,kind))throw mismatch();return q;
}
type Obtained={ready:boolean;failed:string[];errors:unknown[]};
/** Submits or polls every approved request. A confirmed failure or an error on one request
 * never stops the others; the caller decides once nothing is pending. */
async function obtain(s:ComicState,kind:Quote['kind'],gateway:ComicGateway,only:(r:MediaRequest)=>boolean=()=>true):Promise<Obtained>{
 const q=approvedWork(s)!;const keys=mediaRequests(s,kind).filter(only).map(r=>r.key);let pending=false;const failed:string[]=[],errors:unknown[]=[];
 for(const key of keys){
  const r=mediaRequests(s,kind).find(r=>r.key===key);if(!r)continue;
  // The sheet is a real generated reference for the key images, never a placeholder.
  if(r.key.startsWith('image-')&&!s.sheet&&(kind==='prepare'||kind==='film')){if(s.operations['sheet-0']?.state!=='failed'&&!failed.includes('sheet-0'))pending=true;continue;}
  // A reworked request (suffix -rwN) runs under the allowance of the request it replaces: the approved quote already covers that panel.
  // Single-journey films share the approved estimate as one pool (`allowanceFor`); the total never exceeds it.
  try{const result=await gateway.media(s,r,allowanceFor(s,q,r.key) as number,()=>saveComic(s));if(!result){pending=true;continue;}
   if(r.key.startsWith('sheet-'))s.sheet=result.file;await saveComic(s);
  }catch(e){if(e instanceof MediaFailed)failed.push(r.key);else errors.push(e);}
 }
 if(failed.length||errors.length){s.progress='Preserving completed work while the remaining accepted requests finish';await saveComic(s);}
 return {ready:!pending,failed,errors};
}
/** Consultative review of one file, cached by file name: issues become notes, never a stop. The
 * inspected panel is the one actually generated (a rework overlay included). */
async function review(deps:ComicDependencies,s:ComicState,plan:NonNullable<ComicState['plan']>,panel:number,file:string,kind:Inspection['kind']){
 if(s.inspections?.[file])return;
 let note:Inspection;
 try{const r=await deps.inspect({...s,plan:{panels:plan.panels.map(p=>reworked(s,p))}},panel,file);note={panel,kind,issues:r.issues??[],description:r.description,flags:r.flags??[]};}
 catch(e){if(e instanceof AIHttpTransient)throw e;note={panel,kind,issues:[],unavailable:true};}
 s.inspections={...s.inspections,[file]:note};await saveComic(s);
}
/** Director rework queued by an automatic control (image redraw or clip rework), under the allowance of the request it replaces. */
async function queueRework(s:ComicState,deps:ComicDependencies,panel:number,key:string,reason:string,kind:'image'|'clip'){
 const overlay=await deps.rework(s,panel,reason,kind);
 s.reworkedPanels={...s.reworkedPanels,[panel]:overlay};s.reworks={...s.reworks,[panel]:[...(s.reworks?.[panel]??[]),{key,reason,at:Date.now()}]};
}
const CONTROL_PREFIX={image:'Automatic image control',clip:'Automatic clip control'} as const;
/** Among the candidates of one request line (the base key and its `-rwK` reworks), the latest
 * passing file, else the file with the fewest control issues (latest on a tie). */
function bestCandidate(s:ComicState,key:string,fallback:string){
 const base=key.replace(/-rw\d+$/,'');
 const candidates=Object.entries(s.operations).filter(([k,o])=>(k===base||k.startsWith(`${base}-rw`))&&o.state==='complete'&&o.file).sort(([,a],[,b])=>(a.sentAt??0)-(b.sentAt??0)).map(([,o])=>o.file!);
 if(!candidates.length)return fallback;
 const score=(file:string)=>{const c=s.controls?.[file];return c?c.pass?-1:c.issues.length:Number.MAX_SAFE_INTEGER;};
 return candidates.reduce((best,file)=>score(file)<=score(best)?file:best,candidates[0]);
}
/** Shimi, 2026-10-25: controls act. Every new still passes the deterministic frame check (bars,
 * empty block) and the consultative inspection; a still flagged lettering, padded-frame, hero or
 * added-figure is redrawn through the director's rework (at most two per panel, inside the
 * approved allowance), and the best remaining candidate is kept. Returns true when a redraw was queued. */
async function controlImages(s:ComicState,deps:ComicDependencies,plan:NonNullable<ComicState['plan']>,requests:MediaRequest[],save:()=>Promise<unknown>){
 let queued=false;
 for(const r of requests){
  const op=s.operations[r.key];if(!op?.file)throw Error('Panel image missing.');const panel=panelOf(r.key),file=op.file;
  if(!s.controls?.[file]){
   const frame=await deps.frameCheck(s,file);
   await review(deps,s,plan,panel,file,'image');
   const flags=(s.inspections?.[file]?.flags??[]).filter(f=>IMAGE_REDRAW_FLAGS.includes(f));
   const issues=[...frame.issues,...flags.map(f=>`automatic review: ${f}`)];
   s.controls={...s.controls,[file]:{panel,kind:'image',pass:!issues.length,issues}};await save();
  }
  const c=s.controls[file];
  if(!c.pass&&(s.reworks?.[panel]?.length??0)<2){
   await queueRework(s,deps,panel,r.key,`${CONTROL_PREFIX.image}: ${c.issues.join('; ')}. ${(s.inspections?.[file]?.issues??[]).join(' ')}`.trim(),'image');queued=true;await save();continue;
  }
  s.images[panel]=bestCandidate(s,r.key,file);await save();
 }
 if(queued){s.progress=singleJourney(s)?'Drawing your panels':'Preparing your storyboard images';s.queued=true;await save();}
 return queued;
}
/** Shimi, 2026-10-22: a provider's definitive refusal never reaches the client. The director
 * reworks the refused panels (at most twice each) and the worker resubmits them under the same
 * approved quote; only a third refusal falls back to the typed stop. */
async function reworkRefused(s:ComicState,deps:ComicDependencies,failed:string[],kind:'image'|'clip',save:()=>Promise<unknown>){
 let any=false;
 for(const key of failed){
  const panel=panelOf(key),count=s.reworks?.[panel]?.length??0;if(count>=2)return false;
  const reason=s.operations[key]?.error??'The media service refused this request.';
  const overlay=await deps.rework(s,panel,reason,kind);
  s.reworkedPanels={...s.reworkedPanels,[panel]:overlay};s.reworks={...s.reworks,[panel]:[...(s.reworks?.[panel]??[]),{key,reason,at:Date.now()}]};any=true;
 }
 if(any){s.progress=singleJourney(s)?kind==='image'?'Drawing your panels':'Animating your scenes':kind==='image'?'Preparing your storyboard images':'Preparing all video scenes';s.queued=true;await save();}
 return any;
}
const panelOf=(key:string)=>Number(key.split('-')[1]);
const list=(keys:string[])=>keys.map(panelOf).join(', ');
/** The provider's reasons, kept for the admin journal (`s.error`), never for the client text. */
const detail=(s:ComicState,keys:string[])=>keys.map(k=>`${k}: ${s.operations[k]?.error??'failed'}`).join('; ');
/** Single journey (Shimi, 2026-10-23): one approved estimate runs the whole version with no human gate.
 * V1 (`film`): voice -> alignment -> sheet -> images -> consultative inspections -> clips -> build with the
 * default finishing -> `review`. A revision: changed images -> plan swap -> (as `video`) changed clips ->
 * build with the finishing settings decided from the notes -> `review`. Each stage resumes from the
 * saved receipts; refusals are reworked internally; a definitive failure is a calm typed stop. */
async function runSingle(s:ComicState,deps:ComicDependencies,save:()=>Promise<unknown>){
 const id=s.id;
 if(s.work==='film'){
  const plan=s.plan!;
  if(!s.timing){
   s.progress='Recording your narration';await save();
   const voice=await obtain(s,'film',deps.gateway,r=>r.key==='voice-0');if(!voice.ready)return;
   if(voice.failed.length)throw new ComicStop('needs-attention','The narration could not be recorded. Your script and price are saved and our team has the details; nothing else was generated.');
   if(voice.errors.length)throw voice.errors[0];
   const op=s.operations['voice-0'];if(!op?.file)throw Error('Recording missing.');
   s.progress='Checking your narration word by word';await save();
   const aligned=await deps.align(path.join(comicDirectory(id),'voice'),path.join(comicDirectory(id),op.file),s.script,plan);s.voice=path.relative(comicDirectory(id),aligned.voice);s.timing=aligned.timing;s.audioReview=aligned.audioReview;await save();
  }
  if(plan.panels.some(p=>!s.images[p.id])){
   s.progress='Drawing your panels';await save();
   const got=await obtain(s,'film',deps.gateway,r=>r.key.startsWith('sheet-')||r.key.startsWith('image-'));if(!got.ready)return;
   if(got.failed.length){if(await reworkRefused(s,deps,got.failed,'image',save))return;throw new ComicStop('needs-attention',`Panel${got.failed.length>1?'s':''} ${list(got.failed)} could not be drawn after several attempts. Your work is saved and our team has the details.`,detail(s,got.failed));}
   if(got.errors.length)throw got.errors[0];
   if(await controlImages(s,deps,plan,mediaRequests(s,'film').filter(r=>r.key.startsWith('image-')),save))return;
  }
  if(!await clipsStage(s,deps,save,'film'))return;
  await completeVersion(s,deps);return;
 }
 if(s.work==='revision'){
  const plan=s.proposal;
  if(plan){
   s.progress='Redrawing the panels you asked to change';await save();
   const got=await obtain(s,'revision',deps.gateway);if(!got.ready)return;
   if(got.failed.length){if(await reworkRefused(s,deps,got.failed,'image',save))return;throw new ComicStop('needs-attention',`Panel${got.failed.length>1?'s':''} ${list(got.failed)} could not be redrawn after several attempts. Your current version is saved and our team has the details.`,detail(s,got.failed));}
   if(got.errors.length)throw got.errors[0];
   if(await controlImages(s,deps,plan,mediaRequests(s,'revision'),save))return;
   for(const target of s.targets){if(needsClip(s.plan,plan,target)){delete s.clips[target];if(s.localClips)delete s.localClips[target];if(s.clipFallbacks)delete s.clipFallbacks[target];}s.votes[target]=false;}
   s.plan=plan;s.proposal=undefined;s.revision++;
  }
  // The same approved quote carries the clips and the build: the work continues as its `video` stage.
  s.work='video';await save();
 }
 if(s.work==='video'){if(!await clipsStage(s,deps,save,'video'))return;await completeVersion(s,deps);}
}
/** The free local camera path of one panel: a loop of the approved still, the build applies the camera move. */
async function adoptLocalClip(s:ComicState,deps:ComicDependencies,panel:number,why?:'frozen'|'flagged'){
 s.clips[panel]=await deps.localClip(s,panel);s.localClips={...s.localClips,[panel]:true};
 if(why)s.clipFallbacks={...s.clipFallbacks,[panel]:why};else if(s.clipFallbacks)delete s.clipFallbacks[panel];
}
/** Clips of every panel without one. Local panels (Shimi, 2026-10-25) get a free loop of their
 * approved still, no request. Generated clips are reused by fingerprint when identical and
 * controlled as they arrive: a frozen clip (motion energy below the calibrated threshold) goes to
 * the local camera path; a clip flagged lettering, added-figure, added-symbol or hero is reworked
 * once by the director under the same allowance, then replaced by the local camera path when still
 * flagged. Every fallback is disclosed to the client in the film notes. */
async function clipsStage(s:ComicState,deps:ComicDependencies,save:()=>Promise<unknown>,kind:'film'|'video'){
 adoptReusableClips(s);
 const plan=s.plan!;
 for(const p of plan.panels){if(s.clips[p.id]||panelMotion(p)!=='local')continue;await adoptLocalClip(s,deps,p.id);await save();}
 if(plan.panels.some(p=>!s.clips[p.id])){s.progress='Animating your scenes';await save();}
 const got=await obtain(s,kind,deps.gateway,r=>r.key.startsWith('clip-'));
 let queued=false;
 for(const r of mediaRequests(s,kind).filter(r=>r.key.startsWith('clip-'))){const op=s.operations[r.key];if(op?.state!=='complete'||!op.file)continue;const panel=panelOf(r.key),file=op.file;
  if(!s.controls?.[file]){
   const energy=await deps.clipMotion(s,file);let issues:string[]=[];
   if(energy<FROZEN_CLIP_ENERGY)issues=[`frozen clip: motion energy ${energy.toFixed(2)} below ${FROZEN_CLIP_ENERGY}`];
   else{await review(deps,s,plan,panel,file,'clip');issues=(s.inspections?.[file]?.flags??[]).filter(f=>CLIP_REWORK_FLAGS.includes(f)).map(f=>`automatic review: ${f}`);}
   s.controls={...s.controls,[file]:{panel,kind:'clip',pass:!issues.length,issues,energy}};await save();
  }
  const c=s.controls[file];
  if(c.pass){s.clips[panel]=file;if(s.localClips)delete s.localClips[panel];if(s.clipFallbacks)delete s.clipFallbacks[panel];await save();continue;}
  const frozen=c.issues.some(i=>i.startsWith('frozen')),controlReworks=(s.reworks?.[panel]??[]).filter(w=>w.reason.startsWith(CONTROL_PREFIX.clip)).length;
  if(!frozen&&controlReworks<1&&(s.reworks?.[panel]?.length??0)<2){await queueRework(s,deps,panel,r.key,`${CONTROL_PREFIX.clip}: ${c.issues.join('; ')}. ${(s.inspections?.[file]?.issues??[]).join(' ')}`.trim(),'clip');queued=true;await save();continue;}
  await adoptLocalClip(s,deps,panel,frozen?'frozen':'flagged');await save();
 }
 if(queued){s.progress='Animating your scenes';s.queued=true;await save();return false;}
 if(!got.ready)return false;
 if(got.failed.length){if(await reworkRefused(s,deps,got.failed,'clip',save))return false;throw new ComicStop('replace-failed',`Scene${got.failed.length>1?'s':''} ${list(got.failed)} could not be animated after several attempts. Your other scenes are saved; review the updated price to finish this version.`,detail(s,got.failed));}
 if(got.errors.length)throw got.errors[0];
 if(s.plan!.panels.some(p=>!s.clips[p.id]))throw Error('A scene clip is missing after the animation stage.');
 return true;
}
/** Build with the finishing settings (defaults for V1, the notes' decisions for a revision), then hand the complete version to the client. */
async function completeVersion(s:ComicState,deps:ComicDependencies){
 if(s.pendingSettings){s.settings=s.pendingSettings;s.pendingSettings=undefined;}
 await finish(s,deps);
 const unresolved=new Set((s.unresolved??[]).map(u=>u.id));
 for(const n of s.notes)if(n.status==='locked')n.status=unresolved.has(n.id)?'deferred':'applied';
 // The work item is over: the next quote is a new one (nothing of this approval is credited to it).
 s.pendingResolved=undefined;s.targets=[];s.workQuote=undefined;s.filmVersion=(s.filmVersion??0)+1;s.approved={};s.phase='review';s.queued=false;s.quote=undefined;s.transientRetries=0;s.progress=`Version ${s.filmVersion} is ready for your review`;
}
export async function runComic(id:string,actor:string,deps:ComicDependencies=comicDependencies){
 return lockComic(id,async()=>{
  const s=await getComic(id,actor);if(!s.queued||Date.now()<(s.recovery?.nextAt??0))return;const save=()=>saveComic(s);
  if(s.error){await superviseComicFailure(s,save);if(s.recovery?.current?.decision?.action!=='retry-saved'||s.recovery.exhausted)return;consumeRecovery(s.recovery);s.error=undefined;s.resumeRequested=undefined;await save();}
  try{
   approvedWork(s);s.phase='working';await save();
   await deps.authorize(id,async()=>{
    if(singleJourney(s)){await runSingle(s,deps,save);return;}
    if(s.work==='prepare'||s.work==='revision'){
     const kind=s.work==='prepare'?'prepare':'revision',plan=s.proposal??s.plan!;
     // The recording is aligned before any image is submitted: a mismatch costs the voice alone.
     if(kind==='prepare'&&!s.timing){
      const voice=await obtain(s,kind,deps.gateway,r=>r.key==='voice-0');if(!voice.ready)return;
      if(voice.failed.length)throw new ComicStop('needs-attention','The narration recording could not be created. Your script and price are saved; no image was generated.');
      if(voice.errors.length)throw voice.errors[0];
      const op=s.operations['voice-0'];if(!op?.file)throw Error('Recording missing.');
      s.progress='Checking your narration word by word';await save();
      const aligned=await deps.align(path.join(comicDirectory(id),'voice'),path.join(comicDirectory(id),op.file),s.script,plan);s.voice=path.relative(comicDirectory(id),aligned.voice);s.timing=aligned.timing;s.audioReview=aligned.audioReview;await save();
     }
     const got=await obtain(s,kind,deps.gateway);if(!got.ready)return;
     if(got.failed.length){if(await reworkRefused(s,deps,got.failed,'image',save))return;throw new ComicStop('needs-attention',`Storyboard image${got.failed.length>1?'s':''} for panel ${got.failed.map(panelOf).join(', ')} could not be created. Your other images are saved.`);}
     if(got.errors.length)throw got.errors[0];
     for(const r of mediaRequests(s,kind).filter(r=>r.key.startsWith('image-'))){const op=s.operations[r.key];if(!op?.file)throw Error('Panel image missing.');const panel=panelOf(r.key);await review(deps,s,plan,panel,op.file,'image');s.images[panel]=op.file;await save();}
     if(s.work==='revision'){
      for(const target of s.targets){if(needsClip(s.plan,plan,target))delete s.clips[target];s.votes[target]=false;}
      s.plan=plan;s.proposal=undefined;s.revision++;s.approved={};
      for(const n of s.notes)if(n.status==='locked')n.status='applied';
     }
     s.phase='board';s.queued=false;s.quote=undefined;s.transientRetries=0;s.progress='Review your storyboard';
    }else if(s.work==='video'){
     if(s.approved.board!==boardHash(s))throw new ComicStop('needs-attention','The storyboard changed after its approval. Review and approve it again; your scenes are saved.','The storyboard approval changed.');
     adoptReusableClips(s);
     const got=await obtain(s,'video',deps.gateway);
     // Every completed clip is kept, whatever its automatic notes: the human judges the assembled film.
     for(const r of mediaRequests(s,'video')){const op=s.operations[r.key];if(op?.state!=='complete'||!op.file)continue;const panel=panelOf(r.key);await review(deps,s,s.plan!,panel,op.file,'clip');s.clips[panel]=op.file;await save();}
     if(!got.ready)return;
     if(got.failed.length){if(await reworkRefused(s,deps,got.failed,'clip',save))return;throw new ComicStop('replace-failed',`Scene${got.failed.length>1?'s':''} ${got.failed.map(panelOf).join(', ')} could not be animated. Your other scenes are saved. Review the replacement price to finish the film.`);}
     if(got.errors.length)throw got.errors[0];
     await finish(s,deps);s.phase='visuals';s.progress='Review the complete film visuals';s.queued=false;s.quote=undefined;s.transientRetries=0;
    }else if(s.work==='finish'){await finish(s,deps);s.phase='finishing';s.progress='Review sound, editing and subtitles';s.queued=false;s.transientRetries=0;for(const n of s.notes)if(s.pendingResolved?.includes(n.id))n.status='applied';s.pendingResolved=undefined;}
   });await save();
  }catch(e){await failComic(s,e,save);}
  await observeVideo(id,async()=>({category:'comics',phase:s.phase,revision:s.revision,error:s.error,stop:s.stop,operations:Object.fromEntries(Object.entries(s.operations).map(([k,o])=>[k,{state:o.state,requestId:o.requestId}])),checks:s.checks}));
 },true);
}
/** Deterministic stops are typed and shown as written (no paid supervisor); transient
 * service refusals wait on a timer; only ambiguous states reach the supervisor. */
export async function failComic(s:ComicState,e:unknown,save:()=>Promise<unknown>){
 if(e instanceof MediaFailed)e=new ComicStop(s.work==='video'||s.work==='film'?'replace-failed':'needs-attention','A media request could not be completed. Your other work is saved.',e.message);
 if(e instanceof ComicStop){s.error=e.message;s.stop={kind:e.kind,message:e.clientMessage};s.phase='blocked';s.queued=false;s.progress='Your saved work needs attention';await save();return;}
 const b=comicsBudgets();
 if(e instanceof AIHttpTransient&&(s.transientRetries??0)<b.transientRetries){
  s.transientRetries=(s.transientRetries??0)+1;s.recovery??=freshPipelineRecovery();s.recovery.nextAt=Date.now()+b.transientDelayMs*s.transientRetries;
  s.error=undefined;s.queued=true;s.phase='working';s.progress='Please wait. A service is busy; your work continues shortly.';await save();return;
 }
 s.error=recoveryDiagnostic(e);await save();await superviseComicFailure(s,save);
}
async function finish(s:ComicState,deps:ComicDependencies){s.progress='Assembling and checking your complete film';await saveComic(s);const built=await deps.build(s);assertChecks(built.checks);s.media=built.media;s.checks=built.checks;
 // Still fallbacks disclosed for review: the build's flash corrections and the clips replaced by the local camera path (frozen or flagged, 2026-10-25).
 s.fallbacks=[...new Set([...built.fallbacks,...Object.keys(s.clipFallbacks??{}).map(Number)])].sort((a,b)=>a-b);s.checks.stillFallbacks=s.fallbacks;
 s.mediaHash=hash((await readFile(path.join(comicDirectory(s.id),built.media))).toString('base64'));}
export async function runQueuedComics(){const rows=(await pool.query("SELECT job_id,actor_id FROM comics_runs c JOIN jobs j ON j.id=c.job_id WHERE state->>'queued'='true' AND j.deleted_at IS NULL ORDER BY c.updated_at LIMIT 4")).rows;for(const r of rows)await runComic(r.job_id,r.actor_id);}

async function superviseComicFailure(s:ComicState,save:()=>Promise<unknown>){
 if(!s.error)return;
 s.recovery??=freshPipelineRecovery();
 let keys:string[];try{keys=s.work==='finish'?[]:mediaRequests(s,workKind(s)).map(r=>r.key);}catch{keys=Object.keys(s.operations);}
 const requests=keys.map(operation=>({operation,state:s.operations[operation]?.state??'not-sent',requestId:s.operations[operation]?.requestId??null}));
 // Retrying already-approved work needs no live quote: the approval binds the caps, not price freshness.
 const q=s.approvedQuotes.at(-1),budgetValid=s.work==='finish'||requests.every(r=>r.state==='complete')||(()=>{try{approvedWork(s);return true;}catch{return false;}})();
 s.queued=true;s.phase='working';s.progress='Please wait. Analysing the interruption and preserving your work.';await save();
 const decision=await planPipelineRecovery(s.recovery,{jobId:s.id,category:'comics',workKey:`${s.revision}:${s.work}:${q?.id}`,stage:s.work??'planning',error:s.error,requests,facts:{approved:s.approved,quoteExpires:q?.expires,checks:s.checks,notes:s.notes,settings:s.settings,completedImages:Object.keys(s.images),completedClips:Object.keys(s.clips),localStepOnly:requests.every(r=>r.state==='complete')?'Every paid media request is complete: the failing step is the free local assembly/encode/check. retry-saved reruns that local step only, sends no media and spends nothing; it is the right choice after a code repair or a transient local failure.':undefined,clientResumed:s.resumeRequested?'The client explicitly asked to analyse the saved work and continue.':undefined},allowed:recoveryCapabilities(requests,budgetValid,s.work==='video'||s.work==='film')},save);
 s.queued=decision?.action==='retry-saved';s.phase=s.queued?'working':'blocked';s.progress=recoveryView(s.recovery)?.message??'Your saved work needs review.';await save();
}
