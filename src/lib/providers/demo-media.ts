/** R&D-only media generation. Queue IDs are persisted before polling, never blindly resubmitted. */
import { fal } from '@fal-ai/client';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const MODEL='fal-ai/kling-video/v3/pro/image-to-video';
export async function demoClip(root:string,id:string,prompt:string,seconds=5){
  const stateFile=path.join(root,'assets',id+'.video-state.json');
  await mkdir(path.dirname(stateFile),{recursive:true});
  const state:any=existsSync(stateFile)?JSON.parse(await readFile(stateFile,'utf8')):{};
  if(state.output && existsSync(state.output))return state;
  if(!process.env.FAL_KEY)throw new Error('FAL_KEY missing');
  fal.config({credentials:process.env.FAL_KEY});
  if(!state.requestId){
    const bytes=await readFile(path.join(root,'assets',id+'.jpg'));
    const imageUrl=await fal.storage.upload(new File([bytes],id+'.jpg',{type:'image/jpeg'}));
    const input={prompt,start_image_url:imageUrl,duration:String(seconds),generate_audio:false,negative_prompt:'readable text, letters, watermark, people, faces, flicker, distorted machinery, object melting, abrupt cuts',cfg_scale:0.5};
    const r=await fal.queue.submit(MODEL,{input});
    Object.assign(state,{requestId:r.request_id,model:MODEL,input,estimatedCostUsd:seconds*.112,submittedAt:new Date().toISOString(),status:'submitted'});
    await writeFile(stateFile,JSON.stringify(state,null,2));
    console.log('SUBMITTED',id,state.requestId);
  }
  await fal.queue.subscribeToStatus(MODEL,{requestId:state.requestId,pollInterval:5000,logs:false});
  const r=await fal.queue.result(MODEL,{requestId:state.requestId});
  const url=(r.data as any).video?.url;if(!url)throw new Error('No video in result');
  const response=await fetch(url);if(!response.ok)throw new Error('Media download failed '+response.status);
  state.output=path.join(root,'assets',id+'.mp4');await writeFile(state.output,Buffer.from(await response.arrayBuffer()));
  state.status='complete';state.completedAt=new Date().toISOString();state.sourceUrl=url;await writeFile(stateFile,JSON.stringify(state,null,2));
  return state;
}
