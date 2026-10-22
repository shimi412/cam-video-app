import {sha256} from './checkpoints';
import type {FilmComment} from './film-feedback';
import type {FilmCorrection} from './film-correction';
import type {FeedbackPlan} from './feedback-director';
import type {FinishingSettings} from './finishing-review';

export const filmNoteHash=(note:FilmComment)=>sha256(JSON.stringify({id:note.id,target:note.target,text:note.text,seconds:note.seconds}));
export function selectFilmBatch(comments:FilmComment[],ids:string[]){
 if(!ids.length||ids.length>37||new Set(ids).size!==ids.length)throw Error('Choose between 1 and 37 locked feedback notes.');
 const selected=ids.map(id=>comments.find(c=>c.id===id));
 if(selected.some(c=>!c))throw Error('Your locked feedback changed. Reload before applying the batch.');
 return selected as FilmComment[];
}
/** An exact repeated note does not expand a timestamped request to the whole film.
 * Reuse its semantic decision, preserving both original notes and approval hashes.
 * Several timed matches are ambiguous and must never trigger a whole-film retry.
 */
export function scopeRepeatedFilmNotes(plan:FeedbackPlan,comments:{id:string;text:string;seconds?:number|null;target?:string}[]):FeedbackPlan{
 const next=structuredClone(plan);
 const wording=(text:string)=>text.trim().replace(/\s+/g,' ');
 for(const note of comments.filter(c=>typeof c.seconds!=='number')){
  const matches=comments.filter(c=>typeof c.seconds==='number'&&c.target===note.target&&wording(c.text)===wording(note.text));
  if(!matches.length)continue;
  const index=next.decisions.findIndex(d=>d.id===note.id);
  if(index<0)throw Error('The feedback plan omitted a locked note.');
  if(matches.length!==1)throw Error('This repeated note matches several timestamps. Edit its scope before applying the batch. Your notes are kept.');
  const decision=plan.decisions.find(d=>d.id===matches[0].id);
  if(!decision)throw Error('The feedback plan omitted the timestamped note.');
  next.decisions[index]={...structuredClone(decision),id:note.id,message:`Same correction as your note at ${matches[0].seconds}s. ${decision.message}`};
 }
 return next;
}
export function correctionNoteIds(correction:FilmCorrection){return correction.notes?.map(n=>n.id)??[correction.comment];}
export function correctionNotesMatch(correction:FilmCorrection,comments:FilmComment[]){
 if(correction.notes)return correction.notes.every(n=>comments.some(c=>c.id===n.id&&c.target===correction.source&&filmNoteHash(c)===n.hash));
 return comments.some(c=>c.id===correction.comment&&c.target===correction.source&&sha256(c.text)===correction.commentHash);
}
/** Compile one finishing render; conflicting directives stay pending for clarification. */
export function batchFinishingSettings(base:FinishingSettings,plan:FeedbackPlan):FinishingSettings{
 const next=structuredClone(base),changed=new Map<string,string>();
 for(const decision of plan.decisions){
  if(decision.status!=='planned'||decision.stage!=='finishing'||!decision.finishing)throw Error(decision.message||'Clarify the pending feedback before applying this batch.');
  for(const key of Object.keys(base) as (keyof FinishingSettings)[]){
   const value=decision.finishing[key];if(JSON.stringify(value)===JSON.stringify(base[key]))continue;
   const encoded=JSON.stringify(value);
   if(changed.has(key)&&changed.get(key)!==encoded)throw Error(`The feedback contains conflicting ${key} changes. Edit the notes before applying the batch.`);
   changed.set(key,encoded);Object.assign(next,{[key]:value});
  }
 }
 return next;
}
/** A later note cannot silently overwrite a contradictory local edit in the same batch. */
export function assertCompatibleFilmEdits(plan:FeedbackPlan){
 const fields=new Map<string,string>();
 for(const decision of plan.decisions)for(const change of decision.changes){
  for(const [field,value] of Object.entries(change.edit??{})){
   const key=`${change.scene}:${field}`,encoded=JSON.stringify(value);
   if(fields.has(key)&&fields.get(key)!==encoded)throw Error(`The feedback contains conflicting changes for scene ${change.scene}. Clarify the notes before applying the batch.`);
   fields.set(key,encoded);
  }
 }
}
