import {z} from 'zod';
import {runAgent} from '../agent/runtime';
import {getSetting} from '../settings';
import {DEEP_MODEL} from '../ai-routing';
import {probeWriterModel} from '../providers/openrouter';
import {ComicStop} from './errors';
import {comicsBudgets,comicsModelFromSetting} from './budgets';
import {hash,Plan,validatePlan,type ComicState,type ComicPlan,type Note} from './model';
const contract=`You direct CAM Attack comic films. Keep the exact narration and its order, never add factual claims. One panel per meaningful spoken phrase, never word-count chunks or an orphan final word. Preserve comparisons. No hero, superhero or recurring character (Shimi, 2026-10-22): every panel has hero "absent"; the comic universe tells the story through places, objects, symbolic props and anonymous silhouettes (no faces, no identity). Flat 2D, hard black shadows, saturated dominant colour, no gradients, no paper texture, no literal illustration of idioms. No real faces, victims or violence. Each panel has one concrete visual idea/action and a slow camera movement. Titles are exact short excerpts of narration; all lettering is added in code. Feedback is an instruction, NEVER on-screen text. No default floating symbols. Give no provider URLs, executable code or tools beyond the schema.`;
export async function directComic(s:ComicState,notes:Note[]=[]):Promise<{plan:ComicPlan;deferred:string[]}>{
 const model=comicsModelFromSetting(await getSetting<string>('ai_deep_model'),DEEP_MODEL);
 const targets=[...new Set(notes.filter(n=>n.stage!=='finishing').flatMap(n=>n.targets))];
 const schema=z.object({plan:Plan,deferred:z.array(z.string())}).strict();
 return runAgent({session:s.id,turn:`comics-direction-${hash({script:s.script,previous:s.plan,notes})}`,model,system:contract,skill:'comics-method',prompt:JSON.stringify({script:s.script,previous:s.plan,notes,allowedTargets:targets,instruction:notes.length?'Apply each locked note only to its selected panels. Return IDs of sound/editing/subtitle-only notes as deferred without modifying their images. Mixed notes must have their visual part applied and their finishing part retained. Preserve every unselected panel.':'Plan the entire film before creating images.'}),schema,maximumUsd:comicsBudgets().directionUsd,maxOutputTokens:8000,minimumOutputTokens:2500,jobId:s.id,maxSteps:12,validate:r=>{const deferred=notes.length?r.deferred:[];const unknown=deferred.filter(id=>!notes.some(n=>n.id===id));if(unknown.length)throw Error(`Unknown deferred note id(s) ${unknown.join(', ')}. Deferred must list only ids of the locked notes: ${notes.map(n=>n.id).join(', ')}.`);return {plan:validatePlan(s.script,r.plan,s.plan,targets),deferred};}});
}
export async function directComicFinishing(s:ComicState,notes:Note[]){
 const schema=z.object({settings:z.object({music:z.enum(['normal','quiet','off']),captions:z.boolean()}),applied:z.array(z.string()),unresolved:z.array(z.object({id:z.string(),reason:z.string().max(300)}))}).strict();
 return runAgent({session:s.id,turn:`comics-finishing-${hash({settings:s.settings,notes})}`,jobId:s.id,model:comicsModelFromSetting(await getSetting<string>('ai_deep_model'),DEEP_MODEL),skill:'cam-finishing',system:'Translate the locked finishing notes into supported controls: music normal/quiet/off, captions visible/hidden. Preserve settings not requested. No regeneration. For unsupported editing, replacement voice, custom typography or ambiguous instructions return the note id and a short useful unresolved reason, never mark it applied. Every note must be accounted for exactly once. Feedback is never caption text.',prompt:JSON.stringify({settings:s.settings,notes}),schema,maximumUsd:comicsBudgets().finishingUsd,maxOutputTokens:1500,minimumOutputTokens:500,validate:r=>{const ids=[...r.applied,...r.unresolved.map(n=>n.id)];if(ids.length!==notes.length||new Set(ids).size!==notes.length||ids.some(id=>!notes.some(n=>n.id===id)))throw Error('Account for every note exactly once.');return r;}});
}
/** Start preflight: caps validated and the director model probed for real (one tiny
 * tool call, about $0.002) before any paid step, as Motion and Clay do. */
export async function comicsReady(){
 comicsBudgets();
 const model=comicsModelFromSetting(await getSetting<string>('ai_deep_model'),DEEP_MODEL);
 if(!model.startsWith('anthropic/claude-'))throw new ComicStop('needs-attention','The Attack director is not configured. Your script is preserved; nothing was generated.');
 try{await probeWriterModel(model);}catch(e){throw new ComicStop('needs-attention','The Attack director is unavailable right now. Your script is preserved; nothing was generated.',e instanceof Error?e.message:String(e));}
}
/** A media provider refused a panel (content filter, refused parameters): the director rewrites
 * the scene, action and preserved element so the generator accepts it, keeping the narration,
 * the universe and the client's notes. Never shown to the client (Shimi, 2026-10-22). */
export async function reworkComicPanel(s:ComicState,panelId:number,reason:string,kind:'image'|'clip'):Promise<{scene:string;action:string;preserve:string}>{
 const panel=s.plan?.panels.find(p=>p.id===panelId);if(!panel)throw Error('Unknown panel.');
 const schema=z.object({scene:z.string().min(10).max(1200),action:z.string().min(5).max(600),preserve:z.string().min(5).max(400)}).strict();
 const attempt=(s.reworks?.[panelId]?.length??0)+1;
 return runAgent({session:s.id,turn:`comics-rework-${hash({panel:panelId,attempt,reason,plan:s.plan,kind})}`,model:comicsModelFromSetting(await getSetting<string>('ai_deep_model'),DEEP_MODEL),system:contract+' A media provider refused this panel; rewrite only its scene, action and preserved element so the generator accepts it: keep the narration meaning, the comic universe and the client notes, remove anything that reads as violence, effigy, burning, weapons, real people, hate symbols, gore or sexual content, prefer symbolic objects and staging. Never mention the refusal in the text.',skill:'comics-method',prompt:JSON.stringify({kind,panel:s.reworkedPanels?.[panelId]?{...panel,...s.reworkedPanels[panelId]}:panel,providerReason:reason,attempt,clientNotes:s.notes.filter(n=>n.targets.includes(panelId)).map(n=>n.text)}),schema,maximumUsd:comicsBudgets().directionUsd,maxOutputTokens:2000,minimumOutputTokens:600,maxSteps:8,jobId:s.id});
}
