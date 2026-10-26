import {recoveryView,type PipelineRecovery} from '../agent/recovery-policy';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import type {MotionTiming} from '../motion/model';
import {ComicStop,type StopKind} from './errors';
function canonical(v:unknown):unknown {if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([,value])=>value!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,canonical(value)]));return v;}
export const hash=(v:unknown)=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(canonical(v))).digest('hex');
export const normalize=(s:string)=>s.replace(/\s+/g,' ').trim();
/** Local camera move applied by the montage on a still panel (Shimi, 2026-10-25). */
export const CameraMove=z.object({kind:z.enum(['hold','push','pull','pan-left','pan-right','tilt-up','tilt-down']),amount:z.enum(['subtle','medium'])}).strict();
export type CameraMove=z.infer<typeof CameraMove>;
/** Since 2026-10-25 (Shimi, after the film 2399f947): a camera-only idea is executed locally on the
 * approved still (`motion: local`, `cameraMove`); Kling is used only for a real visible action
 * (`motion: generated`, `videoPrompt` written by the director with the packaged method, sent
 * verbatim, `lockEndFrame` = the same still as end image). `title` is kept for saved plans and is
 * ignored by the build: captions only, no narration titles. Saved plans without the new fields
 * still parse (defaults) and keep behaving as before (`panelMotion` reads them as `legacy`). */
export const Panel=z.object({id:z.number().int().positive(),narration:z.string().min(1).max(1600),meaning:z.string().min(5).max(600),scene:z.string().min(10).max(1200),hero:z.enum(['absent','partial','full']).default('absent'),color:z.string().min(3).max(50),title:z.string().max(70).default(''),action:z.string().min(5).max(600),camera:z.string().min(5).max(200),preserve:z.string().min(5).max(400),
 motion:z.enum(['local','generated']).default('local'),cameraMove:CameraMove.default({kind:'hold',amount:'subtle'}),videoPrompt:z.string().max(1200).default(''),lockEndFrame:z.boolean().default(false)}).strict();
export const Plan=z.object({panels:z.array(Panel).min(3).max(24)}).strict();
/** Saved plans may predate the 2026-10-25 fields (and the 2026-10-22 hero default): the state type is the schema's input shape; `validatePlan` returns the parsed shape with defaults applied. */
export type ComicPlan=z.input<typeof Plan>;
export type ComicPanel=ComicPlan['panels'][number];
export type ParsedPanel=z.output<typeof Panel>;
/** `legacy`: a panel saved before 2026-10-25, animated by the template its clip was paid with. */
export const panelMotion=(p:{motion?:string}):'local'|'generated'|'legacy'=>p.motion==='local'?'local':p.motion==='generated'?'generated':'legacy';
export const panelCamera=(p:{cameraMove?:CameraMove}):CameraMove=>p.cameraMove??{kind:'hold',amount:'subtle'};
/** Panel identity with the 2026-10-25 defaults applied, so a saved panel without the new fields equals its unchanged copy returned by the director. */
export const panelKey=(p:unknown)=>{const parsed=Panel.safeParse(p);return hash(parsed.success?parsed.data:p);};
const TEXT_WORDS=/\b(text|titles?|captions?|lettering)\b/i;
/** The director's clip prompt follows comics/skills/attack-prompting.md: complete, 200 to 900
 * characters, never a request for text (the words are allowed only negated or in the Avoid line),
 * names what stays exactly as drawn, ends with an Avoid line. */
export function validateVideoPrompt(prompt:string,panel:number){
 const t=prompt.trim();
 if(t.length<200||t.length>900)throw Error(`Panel ${panel}: videoPrompt must be the complete clip prompt, 200 to 900 characters (got ${t.length}). Follow the attack-prompting skill: header, style, no on-screen text, reference (what stays as drawn, what moves), camera, timed beats, locks, Avoid line.`);
 if(!/\bAvoid:/.test(t))throw Error(`Panel ${panel}: videoPrompt must end with an "Avoid:" line.`);
 if(!/\b(stays?|remains?|keeps?|kept|fixed|unchanged|as drawn|identical)\b/i.test(t))throw Error(`Panel ${panel}: videoPrompt must name what stays exactly as drawn (objects, colours, position) and what is allowed to move.`);
 const body=t.replace(/\bAvoid:[\s\S]*$/,'').replace(/\b(no|never|without|not|nothing|zero)\b[^.;\n]*?\b(text|titles?|captions?|lettering)\b/gi,'');
 const asked=body.match(TEXT_WORDS);
 if(asked)throw Error(`Panel ${panel}: videoPrompt asks the generator for "${asked[0]}". All lettering is composed in code; a prompt never requests text, a title, a caption or lettering (the words may only appear negated or in the Avoid line).`);
 return t;
}
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
 // Shimi, 2026-10-25: a local panel carries no clip prompt; a generated panel carries the complete prompt of the packaged method.
 for(const s of p){if(s.motion==='generated')s.videoPrompt=validateVideoPrompt(s.videoPrompt,s.id);else s.videoPrompt='';}
 if(previous&&(p.length!==previous.panels.length||p.some((s,i)=>s.narration!==previous.panels[i].narration||!targets?.includes(s.id)&&panelKey(s)!==panelKey(previous.panels[i]))))throw Error('Keep the narration and all untargeted panels unchanged.');
 return plan;
}
export function panelTiming(plan:ComicPlan,t:MotionTiming){
 const words=t.words;let cursor=0;
 const phrases=plan.panels.map(p=>{const count=p.narration.trim().split(/\s+/).length,group=words.slice(cursor,cursor+count);cursor+=count;if(!group.length||normalize(group.map(w=>w.word).join(' '))!==normalize(p.narration))throw Error('Word timing does not match this panel.');return {phrase:p.id,text:p.narration,start:group[0].start,end:group.at(-1)!.end};});
 if(cursor!==words.length)throw Error('Incomplete panel timing.');return {...t,phrases};
}
export type Note={id:string;text:string;targets:number[];stage:'board'|'visuals'|'finishing';status:'locked'|'applied'|'deferred';};
export type Operation={fingerprint:string;state:'sending'|'accepted'|'complete'|'failed';requestId?:string;url?:string;file?:string;sha?:string;quotedCredits:number;actualCredits?:number;error?:string;sentAt?:number;reconcileAttempts?:number;declinedPresetId?:string;adjustments?:Record<string,unknown>;};
/** `film` is the single-journey V1 quote (Shimi, 2026-10-23): every supplier cost of the complete
 * first version, priced by the common grid. `additionalCostUsd` is the estimated supplier cost
 * this quote adds (the base of a revision price); `costUsd` stays cumulative as before. */
export type Quote={id:string;kind:'prepare'|'video'|'revision'|'film';items:Record<string,number>;credits:number;analysisUsd:number;costUsd:number;totalUsd:number;additionalUsd:number;expires:number;inputHash:string;additionalCostUsd?:number;};
/** Build results. Durations, safe zones, loudness, sound balance and the logo block review;
 * flash candidates, title carries/drops and still fallbacks are disclosed notes for the human
 * visual approval (senior review 2026-10-21: consultative, as in Motion). */
export type Checks={durations:boolean;safeZones:string[];flashCandidates:number[];mixLufs:number;sfxBelowVoiceDb:number;logo:boolean;duration:number;titleRepairs?:{panel:number;action:'carried'|'dropped';visible:number}[];briefItems?:string[];flashNotes?:{time:number;evidence:string[]}[];stillFallbacks?:number[]};
export function assertChecks(c:Checks){if(!c.durations||c.safeZones.length||!Number.isFinite(c.mixLufs)||Math.abs(c.mixLufs+16)>1||!Number.isFinite(c.sfxBelowVoiceDb)||c.sfxBelowVoiceDb<15||!c.logo)throw new ComicStop('needs-attention','Quality checks need correction. The film has not been submitted for approval. Your approved images and scenes are saved.',`Quality checks need correction: ${JSON.stringify({durations:c.durations,briefItems:c.briefItems,safeZones:c.safeZones,mixLufs:c.mixLufs,sfxBelowVoiceDb:c.sfxBelowVoiceDb,logo:c.logo})}`);}
/** Structured verdicts of the consultative inspection (2026-10-25). The worker acts on them:
 * an image flagged lettering, padded-frame, hero or added-figure is redrawn; a clip flagged
 * lettering, added-figure, added-symbol or hero is reworked once then replaced by the local camera path. */
export const INSPECTION_FLAGS=['lettering','added-figure','added-symbol','padded-frame','hero','frozen','other'] as const;
export type InspectionFlag=typeof INSPECTION_FLAGS[number];
export const IMAGE_REDRAW_FLAGS:InspectionFlag[]=['lettering','padded-frame','hero','added-figure'];
export const CLIP_REWORK_FLAGS:InspectionFlag[]=['lettering','added-figure','added-symbol','hero'];
/** Consultative automatic review of one generated file (image or clip). Never blocks by itself. */
export type Inspection={panel:number;kind:'image'|'clip';issues:string[];description?:string;unavailable?:boolean;flags?:InspectionFlag[]};
/** Deterministic and consultative controls of one generated file, and what the worker did with it (2026-10-25). */
export type Control={panel:number;kind:'image'|'clip';pass:boolean;issues:string[];energy?:number};
export type ComicState={version:1;recovery?:PipelineRecovery;id:string;title:string;script:string;phase:'planning'|'preparation-price'|'working'|'board'|'video-price'|'visuals'|'finishing'|'complete'|'blocked'|'estimate'|'review';revision:number;work?:'prepare'|'video'|'revision'|'finish'|'film';queued:boolean;progress:string;error?:string;plan?:ComicPlan;proposal?:ComicPlan;quote?:Quote;approvedQuotes:Quote[];operations:Record<string,Operation>;notes:Note[];votes:Record<string,boolean>;approved:{board?:string;visuals?:string;final?:string};timing?:MotionTiming;voice?:string;sheet?:string;images:Record<string,string>;clips:Record<string,string>;media?:string;mediaHash?:string;checks?:Checks;fallbacks?:number[];settings:{music:'normal'|'quiet'|'off';captions:boolean};targets:number[];pendingResolved?:string[];unresolved?:{id:string;reason:string}[];saved?:boolean;
 /* Optional since 2026-10-21; older rows parse without them. */
 inspections?:Record<string,Inspection>;stop?:{kind:StopKind;message:string};transientRetries?:number;resumeRequested?:boolean;/** Shimi 2026-10-22: a provider's refusal is reworked by the director, never shown to the client. Overlays change the generation request only, never the approved plan or its hashes. */reworkedPanels?:Record<string,{scene:string;action:string;preserve:string;videoPrompt?:string}>;reworks?:Record<string,{key:string;reason:string;at:number}[]>;audioReview?:{endingNeedsListening:boolean;tailPaddingSeconds:number};deliveryNotes?:string;
 /** Single journey (Shimi, 2026-10-23): script -> one estimate (delay and price) -> complete V1 with no
  * intermediate human gate -> feedback on the complete version -> revision quote -> V2 ... -> approve
  * -> download. Films created before this field keep the legacy gated flow unchanged. */
 journey?:'single';/** Client-facing version number of the current complete film (1 after V1). `revision` stays the internal request identity counter; `version` is the schema version. */filmVersion?:number;/** The approved quote that the running work item executes under; after the plan swap of a revision the work is bound by this identity, not by a fresh price. */workQuote?:string;/** Finishing settings decided from the client's notes by the finishing director, applied at the next build. */pendingSettings?:{music:'normal'|'quiet'|'off';captions:boolean};
 /** 2026-10-25: panels whose clip is a free local loop of the approved still (the build applies the camera move), the controls of every generated file, and the clips replaced by the local camera path with the reason, disclosed to the client. */
 localClips?:Record<string,true>;controls?:Record<string,Control>;clipFallbacks?:Record<string,'frozen'|'flagged'>;
 /** Shimi, 2026-10-26: `studio` films are produced by the local executor (Claude Code) through `studio_missions`,
  * never by the engine worker; the estimate is local (`panelCount` from the script's sentences, no plan). Saved
  * films without the field, and films created while the category is `engine`, keep every engine path. */
 fulfilment?:'engine'|'studio';panelCount?:number;};
export const studioFulfilment=(s:ComicState)=>s.fulfilment==='studio';
export const boardHash=(s:ComicState)=>hash({plan:s.plan,images:s.images});
export const quoteHash=(s:ComicState,kind:Quote['kind'])=>hash({kind,plan:s.proposal??s.plan,images:kind==='video'?s.images:undefined,notes:kind==='revision'?s.notes.filter(n=>n.status==='locked'):undefined,revision:s.revision});
export const singleJourney=(s:ComicState)=>s.journey==='single';
/** Delay shown with the V1 estimate, from the panel count: live 2026-10-22, ten panels took about
 * 28 minutes of voice, sheet, images and inspections, then about 20 minutes of clips, then the
 * local build. Rounded to five minutes, never below fifteen. */
export const estimatedMinutes=(panels:number)=>Math.max(15,Math.round((10+3.5*panels)/5)*5);
/** The latest request of one panel for a key prefix (reworks add `-rwK`, replacements bump the revision). */
export function latestOperation(s:ComicState,prefix:string){
 return Object.entries(s.operations).filter(([key])=>key.startsWith(prefix)).sort(([,a],[,b])=>(a.sentAt??0)-(b.sentAt??0)).at(-1)?.[1];
}
const clean=(t:string)=>t.replace(/Claude|Higgsfield|Kling|Nano Banana|ElevenLabs|OpenRouter/gi,'review');
const decision=(s:ComicState)=>s.recovery?.current?.decision?.action;
/** Consultative notes for one panel: its current image, then its current clip. */
export function panelNotes(s:ComicState,id:number){
 return ([['image',s.images[id]],['clip',s.clips[id]]] as const).flatMap(([kind,file])=>{const n=file?s.inspections?.[file]:undefined;if(!n)return [];return n.unavailable?[`${kind==='image'?'Image':'Scene'}: automatic review unavailable, please check it yourself.`]:n.issues.map(issue=>`${kind==='image'?'Image':'Scene'}: ${clean(issue)}`);});
}
export function publicComic(s:ComicState){const media=(file:string)=>`/api/comics/${s.id}/media/${encodeURIComponent(file)}`;
 const blocked=s.phase==='blocked',stop=blocked?s.stop:undefined;
 const legacyMessage=s.error?(recoveryView(s.recovery)?.message??(/^(Panel \d+ needs visual correction:|Quality checks need correction|The saved work|The storyboard approval)/.test(s.error)?s.error.replace(/Claude|Higgsfield|Kling|Nano Banana|ElevenLabs/gi,"media service"):"This step needs attention. Your completed media and feedback are saved. No new generation was started automatically.")):undefined;
 const failedClips=!!s.plan?.panels.some(p=>!s.clips[p.id])&&!!s.plan?.panels.filter(p=>!s.clips[p.id]).every(p=>(singleJourney(s)?latestOperation(s,`clip-${p.id}-`):s.operations[`clip-${p.id}-${s.revision}`])?.state==='failed');
 const single=singleJourney(s),studio=studioFulfilment(s),panelCount=s.plan?.panels.length??s.panelCount??0;
 return {id:s.id,title:s.title,phase:s.phase,revision:s.revision,progress:s.progress,failureAnalysis:s.error&&!stop?recoveryView(s.recovery):null,
  journey:single?'single' as const:'legacy' as const,version:s.filmVersion??0,estimateMinutes:panelCount?estimatedMinutes(panelCount):null,
  // Studio films (2026-10-26) have no storyboard: the client feedback targets the version's panels by number; the view never says who produces.
  studio,panelCount,
  // A needs-attention decision keeps Resume available (bounded by `exhausted`): the client asks for a fresh analysis after a repair, never for a resubmission (live 2026-10-22, local encode guard corrected while the film was blocked).
  canResume:blocked&&!['review-budget','replace-failed'].includes(stop?.kind??'')&&(!s.recovery?.current||s.recovery.current.status==='unavailable'||['retry-saved','needs-attention'].includes(decision(s)??'')||!!stop)&&!s.recovery?.exhausted,
  canReviewBudget:blocked&&(stop?stop.kind==='review-budget':decision(s)==='review-budget'),
  error:stop?.message??legacyMessage,work:s.work,queued:s.queued,saved:s.saved,
  canReplace:blocked&&(stop?stop.kind==='replace-failed':decision(s)==='replace-failed')&&(s.work==='video'||single&&s.work==='film')&&failedClips,
  quote:s.quote&&s.phase!=='blocked'&&s.phase!=='working'?{id:s.quote.id,totalUsd:s.quote.totalUsd,additionalUsd:s.quote.additionalUsd,kind:s.quote.kind,expires:s.quote.expires,expired:s.quote.expires<Date.now()}:null,
  notes:s.notes,fallbacks:s.fallbacks??[],unresolved:s.unresolved,votes:s.votes,settings:s.settings,
  panels:s.plan?.panels.map(p=>({id:p.id,narration:p.narration,meaning:p.meaning,scene:p.scene,action:p.action,title:p.title,motion:panelMotion(p),image:s.images[p.id]?media(s.images[p.id]):null,reviewNotes:panelNotes(s,p.id)})),
  // Disclosed adaptations of the assembled film, for the human visual and finishing approvals.
  filmNotes:[...(s.checks?.titleRepairs??[]).map(r=>({text:r.action==='dropped'?`Panel ${r.panel}: its title was too short to read and is not shown.`:`Panel ${r.panel}: its title stays on screen into the next panel so it can be read.`,evidence:[] as string[]})),...(s.checks?.flashNotes??[]).map(n=>({text:`A brief visual change around ${n.time.toFixed(1)} s was detected; please check it while watching.`,evidence:n.evidence.map(media)})),...Object.entries(s.clipFallbacks??{}).map(([panel,why])=>({text:`Panel ${panel}: its generated animation ${why==='frozen'?'barely moved':'showed elements that were not asked for'}; the approved drawing is shown with a camera move instead.`,evidence:[] as string[]})),...(s.audioReview?.endingNeedsListening?[{text:'The narration ends right at its last word; please listen to the ending.',evidence:[] as string[]}]:[])],
  // The executor's notes of a studio version are shown with the version itself (consultative, as the delivery review's).
  deliveryNotes:(s.phase==='complete'||studio&&s.phase==='review')&&s.deliveryNotes?clean(s.deliveryNotes):undefined,
  preview:s.media?media(s.phase==='visuals'?s.media.replace(/final\.mp4$/,'preview.mp4'):s.media):null,download:s.phase==='complete'?media('download'):null,boardHash:boardHash(s),mediaHash:s.mediaHash};}
export type ComicView=ReturnType<typeof publicComic>;
