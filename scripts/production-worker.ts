/** Durable media worker. No HTTP/browser callbacks and no implicit legacy resume. */
import {backgroundCycle} from "../src/lib/concept/background-worker";
import {runLiveProduction} from "../src/lib/concept/live-production";
import {runQueuedExports} from "../src/lib/format-exports";
import {runQueuedMotions} from '../src/lib/motion/service';
import {runQueuedComics} from "../src/lib/comics/service";
let stopping=false;
for(const signal of ["SIGTERM","SIGINT","SIGHUP"] as const)process.on(signal,()=>{stopping=true;});
async function main(){
 // Preview installations never connect a media provider.
 if(process.env.CAM_LIVE_ENABLED!=="1"||process.env.PROVIDER_MODE!=="fal")return;
 while(!stopping){
  try{await backgroundCycle(id=>runLiveProduction(id,undefined,{background:true}),(id)=>console.error(`Production worker: ${id} needs checking; saved work is preserved.`));
   if(!stopping)await runQueuedExports();
   if(!stopping)await runQueuedComics();
   if(!stopping)await runQueuedMotions();
  }
  catch{console.error("Production worker: storage/database unavailable; retrying discovery.");}
  if(!stopping)await new Promise(resolve=>setTimeout(resolve,2000));
 }
}
main().then(()=>process.exit(0)).catch(()=>process.exit(1));
