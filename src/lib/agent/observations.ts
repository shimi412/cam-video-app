import {postgresAgentStore,digest} from './store';
import {brainMode} from '../providers/mode';
/** Controllers own execution. An observation never initiates work or grants approval.
 * If journal storage fails, keep the authoritative production checkpoint intact;
 * the next reasoning request always supplies its current authoritative snapshot. */
export async function observeVideo(session:string,read:()=>Promise<unknown>){
 if(brainMode()!=='api'||process.env.CAM_LIVE_ENABLED!=='1')return;
 try{
  const content=await read();
  await postgresAgentStore.event(session,`execution:${digest(content)}`,'execution',content);
 }catch{console.error('CAM agent observation could not be saved; production checkpoints remain authoritative.',session);}
}
