import {recoveryView,type PipelineRecovery} from '../agent/recovery-policy';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import type {MotionTiming} from '../motion/model';
import {ComicStop,type StopKind} from './errors';
function canonical(v:unknown):unknown {if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([,value])=>value!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,canonical(value)]));return v;}
export const hash=(v:unknown)=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(canonical(v))).digest('hex');
export const normalize=(s:string)=>s.replace(/\s+/g,' ').trim();
export const Panel=z.object({id:z.number().int().positive(),narration:z.string().min(1).max(1600),meaning:z.string().min(5).max(600),scene:z.string().min(10).max(1200),hero:z.enum(['absent','partial','full']).default('absent'),color:z.string().min(3).max(50),title:z.string().max(70),action:z.string().min(5).max(600),camera:z.string().min(5).max(200),preserve:z.string().min(5).max(400)}).strict();
export const Plan=z.object({panels:z.array(Panel).min(3).max(24)}).strict();
export type ComicPlan=z.infer<typeof Plan>;
/** The narration excerpt a title quotes: exact (case-insensitive) match first, else the same
 * words in order ignoring punctuation (Sonnet wrote "Zero rocket attacks" for "zero rocket attacks.",
 * live Attack Start 2026-10-22); the title becomes the narration's own spelling. Null when absent. */
export function exactExcerpt(narration:string,title:string):string|null{
 const n=normalize(narration),t=normalize(title);if(!t)return null;
 const i=n.toLowerCase().indexOf(t.toLowerCase());if(i>=0)return n.slice(i,i+t.length);
 const words=(x:string)=>x.toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu,' ').split(/\s+/).filter(Boolean);
 const tw=words(t);if(!tw.length)return null;
 const tokens=[...n.matchAll(/\S+/g)];
 for(let k=0;k+tw.length<=tokens.length;k++){
  if(tw.every((w,j)=>words(tokens[k+j][0]).join(' ')===w)){const first=tokens[k],last=tokens[k+tw.length-1];return n.slice(first.index!,last.index!+last[0].length).replace(/[.,;:!?]+$/,'');}
 }
 return null;
}
export function validatePlan(script:string,value:unknown,previous?:ComicPlan,targets?:number[]){
 const plan=Plan.parse(value),p=plan.panels;
 if(normalize(p.map(s=>s.narration).join(' '))!==normalize(script))throw Error('Preserve every word of the original narration, in order.');
 if(p.some((s,i)=>s.id!==i+1))throw Error('Panel numbers must be sequential.');
 // Shimi, 2026-10-22: no superhero in Attack any more. The comic universe (places, objects, symbolic props, anonymous silhouettes) tells the story. Saved films that already had the hero keep him for their own revisions.
 const heroAllowed=Boolean(previous?.panels.some(s=>s.hero!=='absent'));
 if(!heroAllowed){const withHero=p.filter(s=>s.hero!=='absent').map(s=>s.id);if(withHero.length)throw Error(`Panel${withHero.length>1?'s':''} ${withHero.join(', ')}: no hero, superhero or recurring character in Attack films; set hero to "absent" and let the comic universe (places, objects, symbolic props, anonymous silhouettes) tell the story.`);}
 else if(p.filter(s=>s.hero!=='absent').length>Math.floor(p.length/3)||p.filter(s=>s.hero==='full').length>1)throw Error('The hero may appear in at most a third of the panels and in full body only once.');
 for(const s of p){if(!s.title)continue;const exact=exactExcerpt(s.narration,s.title);if(exact===null)throw Error(`Panel ${s.id}: the title "${s.title}" does not quote its narration exactly ("${s.narration}"). On-screen titles must quote the narration exactly (a short excerpt, same words in order) or stay empty, never feedback or invented copy.`);s.title=exact;}
 if(previous&&(p.length!==previous.panels.length||p.some((s,i)=>s.narration!==previous.panels[i].narration||!targets?.includes(s.id)&&hash(s)!==hash(previous.panels[i]))))throw Error('Keep the narration and all untargeted panels unchanged.');
 return plan;
}
export function panelTiming(plan:ComicPlan,t:MotionTiming){
 const words=t.words;let cursor=0;
 const phrases=plan.panels.map(p=>{const count=p.narration.trim().split(/\s+/).length,group=words.slice(cursor,cursor+count);cursor+=count;if(!group.length||normalize(group.map(w=>w.word).join(' '))!==normalize(p.narration))throw Error('Word timing does not match this panel.');return {phrase:p.id,text:p.narration,start:group[0].start,end:group.at(-1)!.end};});
 if(cursor!==words.length)throw Error('Incomplete panel timing.');return {...t,phrases};
}
export type Note={id:string;text:string;targets:number[];stage:'board'|'visuals'|'finishing';status:'locked'|'applied'|'deferred';};
export type Operation={fingerprint:string;state:'sending'|'accepted'|'complete'|'failed';requestId?:string;url?:string;file?:string;sha?:string;quotedCredits:number;actualCredits?:number;error?:string;sentAt?:number;reconcileAttempts?:number;declinedPresetId?:string;adjustments?:Record<string,unknown>;};
export type Quote={id:string;kind:'prepare'|'video'|'revision';items:Record<string,number>;credits:number;analysisUsd:number;costUsd:number;totalUsd:number;additionalUsd:number;expires:number;inputHash:string;};
/** Build results. Durations, safe zones, loudness, sound balance and the logo block review;
 * flash candidates, title carries/drops and still fallbacks are disclosed notes for the human
 * visual approval (senior review 2026-10-21: consultative, as in Motion). */
export type Checks={durations:boolean;safeZones:string[];flashCandidates:number[];mixLufs:number;sfxBelowVoiceDb:number;logo:boolean;duration:number;titleRepairs?:{panel:number;action:'carried'|'dropped';visible:number}[];briefItems?:string[];flashNotes?:{time:number;evidence:string[]}[];stillFallbacks?:number[]};
export function assertChecks(c:Checks){if(!c.durations||c.safeZones.length||!Number.isFinite(c.mixLufs)||Math.abs(c.mixLufs+16)>1||!Number.isFinite(c.sfxBelowVoiceDb)||c.sfxBelowVoiceDb<15||!c.logo)throw new ComicStop('needs-attention','Quality checks need correction. The film has not been submitted for approval. Your approved images and scenes are saved.',`Quality checks need correction: ${JSON.stringify({durations:c.durations,briefItems:c.briefItems,safeZones:c.safeZones,mixLufs:c.mixLufs,sfxBelowVoiceDb:c.sfxBelowVoiceDb,logo:c.logo})}`);}
/** Consultative automatic review of one generated file (image or clip). Never blocks. */
export type Inspection={panel:number;kind:'image'|'clip';issues:string[];description?:string;unavailable?:boolean};
export type ComicState={version:1;recovery?:PipelineRecovery;id:string;title:string;script:string;phase:'planning'|'preparation-price'|'working'|'board'|'video-price'|'visuals'|'finishing'|'complete'|'blocked';revision:number;work?:'prepare'|'video'|'revision'|'finish';queued:boolean;progress:string;error?:string;plan?:ComicPlan;proposal?:ComicPlan;quote?:Quote;approvedQuotes:Quote[];operations:Record<string,Operation>;notes:Note[];votes:Record<string,boolean>;approved:{board?:string;visuals?:string;final?:string};timing?:MotionTiming;voice?:string;sheet?:string;images:Record<string,string>;clips:Record<string,string>;media?:string;mediaHash?:string;checks?:Checks;fallbacks?:number[];settings:{music:'normal'|'quiet'|'off';captions:boolean};targets:number[];pendingResolved?:string[];unresolved?:{id:string;reason:string}[];saved?:boolean;
 /* Optional since 2026-10-21; older rows parse without them. */
 inspections?:Record<string,Inspection>;stop?:{kind:StopKind;message:string};transientRetries?:number;resumeRequested?:boolean;/** Shimi 2026-10-22: a provider's refusal is reworked by the director, never shown to the client. Overlays change the generation request only, never the approved plan or its hashes. */reworkedPanels?:Record<string,{scene:string;action:string;preserve:string}>;reworks?:Record<string,{key:string;reason:string;at:number}[]>;audioReview?:{endingNeedsListening:boolean;tailPaddingSeconds:number};deliveryNotes?:string;};
export const boardHash=(s:ComicState)=>hash({plan:s.plan,images:s.images});
export const quoteHash=(s:ComicState,kind:Quote['kind'])=>hash({kind,plan:s.proposal??s.plan,images:kind==='video'?s.images:undefined,notes:kind==='revision'?s.notes.filter(n=>n.status==='locked'):undefined,revision:s.revision});
const clean=(t:string)=>t.replace(/Claude|Higgsfield|Kling|Nano Banana|ElevenLabs|OpenRouter/gi,'review');
const decision=(s:ComicState)=>s.recovery?.current?.decision?.action;
/** Consultative notes for one panel: its current image, then its current clip. */
export function panelNotes(s:ComicState,id:number){
 return ([['image',s.images[id]],['clip',s.clips[id]]] as const).flatMap(([kind,file])=>{const n=file?s.inspections?.[file]:undefined;if(!n)return [];return n.unavailable?[`${kind==='image'?'Image':'Scene'}: automatic review unavailable, please check it yourself.`]:n.issues.map(issue=>`${kind==='image'?'Image':'Scene'}: ${clean(issue)}`);});
}
export function publicComic(s:ComicState){const media=(file:string)=>`/api/comics/${s.id}/media/${encodeURIComponent(file)}`;
 const blocked=s.phase==='blocked',stop=blocked?s.stop:undefined;
 const legacyMessage=s.error?(recoveryView(s.recovery)?.message??(/^(Panel \d+ needs visual correction:|Quality checks need correction|The saved work|The storyboard approval)/.test(s.error)?s.error.replace(/Claude|Higgsfield|Kling|Nano Banana|ElevenLabs/gi,"media service"):"This step needs attention. Your completed media and feedback are saved. No new generation was started automatically.")):undefined;
 const failedClips=!!s.plan?.panels.some(p=>!s.clips[p.id])&&!!s.plan?.panels.filter(p=>!s.clips[p.id]).every(p=>s.operations[`clip-${p.id}-${s.revision}`]?.state==='failed');
 return {id:s.id,title:s.title,phase:s.phase,revision:s.revision,progress:s.progress,failureAnalysis:s.error&&!stop?recoveryView(s.recovery):null,
  // A needs-attention decision keeps Resume available (bounded by `exhausted`): the client asks for a fresh analysis after a repair, never for a resubmission (live 2026-10-22, local encode guard corrected while the film was blocked).
  canResume:blocked&&!['review-budget','replace-failed'].includes(stop?.kind??'')&&(!s.recovery?.current||s.recovery.current.status==='unavailable'||['retry-saved','needs-attention'].includes(decision(s)??'')||!!stop)&&!s.recovery?.exhausted,
  canReviewBudget:blocked&&(stop?stop.kind==='review-budget':decision(s)==='review-budget'),
  error:stop?.message??legacyMessage,work:s.work,queued:s.queued,saved:s.saved,
  canReplace:blocked&&(stop?stop.kind==='replace-failed':decision(s)==='replace-failed')&&s.work==='video'&&failedClips,
  quote:s.quote&&s.phase!=='blocked'&&s.phase!=='working'?{id:s.quote.id,totalUsd:s.quote.totalUsd,additionalUsd:s.quote.additionalUsd,kind:s.quote.kind,expires:s.quote.expires,expired:s.quote.expires<Date.now()}:null,
  notes:s.notes,fallbacks:s.fallbacks??[],unresolved:s.unresolved,votes:s.votes,settings:s.settings,
  panels:s.plan?.panels.map(p=>({id:p.id,narration:p.narration,meaning:p.meaning,scene:p.scene,action:p.action,title:p.title,image:s.images[p.id]?media(s.images[p.id]):null,reviewNotes:panelNotes(s,p.id)})),
  // Disclosed adaptations of the assembled film, for the human visual and finishing approvals.
  filmNotes:[...(s.checks?.titleRepairs??[]).map(r=>({text:r.action==='dropped'?`Panel ${r.panel}: its title was too short to read and is not shown.`:`Panel ${r.panel}: its title stays on screen into the next panel so it can be read.`,evidence:[] as string[]})),...(s.checks?.flashNotes??[]).map(n=>({text:`A brief visual change around ${n.time.toFixed(1)} s was detected; please check it while watching.`,evidence:n.evidence.map(media)})),...(s.audioReview?.endingNeedsListening?[{text:'The narration ends right at its last word; please listen to the ending.',evidence:[] as string[]}]:[])],
  deliveryNotes:s.phase==='complete'&&s.deliveryNotes?clean(s.deliveryNotes):undefined,
  preview:s.media?media(s.phase==='visuals'?s.media.replace(/final\.mp4$/,'preview.mp4'):s.media):null,download:s.phase==='complete'?media('download'):null,boardHash:boardHash(s),mediaHash:s.mediaHash};}
export type ComicView=ReturnType<typeof publicComic>;
