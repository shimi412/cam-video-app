import {z} from 'zod';
import {Film,digest,type MotionFilm} from './model';
export const CompositionAnswer=z.object({
 film:Film.optional(),
 patch:z.object({baseSha256:z.string().regex(/^[a-f0-9]{64}$/),edits:z.array(z.object({before:z.string().min(1).max(30000),after:z.string().max(30000)}).strict()).min(1).max(30),scenes:Film.shape.scenes.nullish(),removedWords:Film.shape.removedWords.nullish()}).strict().optional(),
}).strict();
export type CompositionAnswer=z.infer<typeof CompositionAnswer>;
export function applyCompositionAnswer(answer:CompositionAnswer,previous?:MotionFilm){
 if(Boolean(answer.film)===Boolean(answer.patch))throw Error('Return exactly one film or patch.');
 if(answer.film)return answer.film;
 const patch=answer.patch!;
 if(!previous||digest(previous.source)!==patch.baseSha256)throw Error('Patch source changed. Use the exact last candidate hash.');
 let source=previous.source;
 for(const [index,edit] of patch.edits.entries()){
  const at=source.indexOf(edit.before);
  if(at<0||source.indexOf(edit.before,at+edit.before.length)>=0){
   const excerpt=JSON.stringify(edit.before.slice(0,90)+(edit.before.length>90?'…':''));
   if(at<0&&/"?(removedWords|scenes)"?\s*:/.test(edit.before))throw Error(`Edit ${index+1} of ${patch.edits.length} targets film metadata, which is not source text: set patch.removedWords or patch.scenes (fields of the patch object next to edits) instead. No edit of this patch was applied.`);
   const nearest=at<0?closestLine(source,edit.before):'';
   throw Error(`Edit ${index+1} of ${patch.edits.length} ${at<0?'matches nothing in the current source':'matches more than once'}: before ${excerpt}. ${at<0?`Copy the exact current text (earlier edits in this patch are not applied when one fails; whitespace and quotes must match; your previous accepted patches may have changed this line).${nearest?` Closest current line: ${JSON.stringify(nearest)}`:''}`:'Include enough surrounding lines to make it unique.'} No edit of this patch was applied.`);
  }
  source=source.slice(0,at)+edit.after+source.slice(at+edit.before.length);
 }
 // Application-owned boundary lines must survive every patch exactly once.
 for(const [name,marker] of [['scene boundary','# ============================================================ A'],['subtitle boundary','# ------------------------------------------------------------ sous-titres']] as const){
  const had=previous.source.indexOf(marker)>=0,has=source.indexOf(marker)>=0;
  if(had&&!has)throw Error(`The patch removes the protected ${name} line "${marker}". Keep that line byte-identical and place your change around it (SUBS, VIS and MARKS stay after the subtitle boundary). No edit of this patch was applied.`);
 }
 return Film.parse({...previous,source,...(patch.scenes?{scenes:patch.scenes}:{}),...(patch.removedWords?{removedWords:patch.removedWords}:{})});
}

/** The current line sharing the longest common prefix with the failed edit's first line. */
export function closestLine(source:string,before:string){
 const target=before.split('\n')[0].trim();if(!target)return '';
 let best='',score=0;
 for(const raw of source.split('\n')){const line=raw.trim();let i=0;while(i<line.length&&i<target.length&&line[i]===target[i])i++;const common=i+(line.includes(target.slice(0,12))?6:0);if(common>score){score=common;best=line;}}
 return score>=8?best.slice(0,200):'';
}
