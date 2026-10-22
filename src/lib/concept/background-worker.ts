import {readdir} from "node:fs/promises";
import path from "node:path";
import {z} from "zod";
import {readCheckpoint} from "./checkpoints";
import {BackgroundState} from "./background-policy";
/** Only explicit persisted work intents are discovered. Legacy paused jobs are
 * never migrated into this queue. The runner rechecks every gate under its lock. */
export async function backgroundCandidates(root=process.cwd(),onError:(id:string,error:unknown)=>void=()=>{}){
 const directory=path.join(root,"storage/concepts");
 const names=await readdir(directory).catch((e:NodeJS.ErrnoException)=>{if(e.code==="ENOENT")return [];throw e;});
 const ids:string[]=[];
 for(const id of names.filter(n=>z.uuid().safeParse(n).success)){
  try{const state=await readCheckpoint(path.join(directory,id,"live/production.json"),z.object({background:BackgroundState.optional(),finished:z.boolean()}));
  if(state?.background?.enabled&&!state.finished)ids.push(id);
  }catch(error){onError(id,error);}
 }
 return ids;
}
export async function backgroundCycle(run:(id:string)=>Promise<void>,onError:(id:string,error:unknown)=>void,root=process.cwd()){
 for(const id of await backgroundCandidates(root,onError))try{await run(id);}catch(error){onError(id,error);}
}
