import {readFile,writeFile,mkdir,rename,readdir} from 'node:fs/promises';
import path from 'node:path';
import {digest} from '../agent/store';
import {Film,type MotionFilm} from './model';
import {applyCompositionAnswer,type CompositionAnswer} from './patch';
/** Legacy repair inputs pinned source but omitted film metadata. Recover only
 * an exact local candidate match, without changing the paid prompt/turn. */
export async function savedRepairBase(directory:string,source:string){
 const names=(await readdir(directory)).filter(n=>/^writing-candidate-[a-f0-9]{64}\.json$/.test(n));
 let match:MotionFilm|undefined;
 for(const name of names){
  const parsed=Film.safeParse(JSON.parse(await readFile(path.join(directory,name),'utf8')).film);
  if(!parsed.success||parsed.data.source!==source)continue;
  if(match&&digest(match)!==digest(parsed.data))throw Error('Saved repair metadata is ambiguous; reconcile the exact candidate before continuing.');
  match=parsed.data;
 }
 if(!match)throw Error('The saved repair source has no exact candidate receipt. Reconciliation is required before contacting the writer.');
 return match;
}
/** One atomic receipt binds a patch and its resulting source. Replaying after
 * process death validates the same candidate instead of applying edits twice. */
export async function saveCompositionCandidate(file:string,answer:CompositionAnswer,initial?:MotionFilm,validate?:(film:MotionFilm)=>void){
 let saved:{answerHash:string;film:MotionFilm}|undefined;
 try{saved=JSON.parse(await readFile(file,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const answerHash=digest(answer);
 if(saved?.answerHash===answerHash)return Film.parse(saved.film);
 const film=applyCompositionAnswer(answer,saved?.film??initial);
 validate?.(film);
 await mkdir(path.dirname(file),{recursive:true});
 await writeFile(file+'.tmp',JSON.stringify({answerHash,film}));await rename(file+'.tmp',file);
 return film;
}
