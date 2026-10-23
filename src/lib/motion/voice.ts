import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {z} from 'zod';
import {higgsfieldAccessToken} from '../providers/higgsfield-auth';
import {motionBudgets} from './budgets';
import {assertAuthorizedExecution} from '../providers/live-policy';
import {providerFetch} from '../providers/network';
import {mcpData,providerOutputUrl} from '../concept/provider-transports';
import {decodeAudio,paceRecording,writeWave} from '../concept/editorial-audio';
import {digest,validateTiming,type MotionTiming,type Receipt} from './model';
import type {MotionState} from './state';
const exec=promisify(execFile);
// Whisper writes small numbers as digits ("top 5") where a script says "five".
// Both sides are canonicalized to the same spelling before comparison, so a
// number is a known spelling variant, never a missing word. Timings are untouched.
const NUMBER_WORDS=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const TENS=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
export function numberWord(n:number){return n<20?NUMBER_WORDS[n]:TENS[Math.floor(n/10)]+(n%10?NUMBER_WORDS[n%10]:'');}
export const norm=(s:string)=>s.toLowerCase().replace(/\b(\d{1,2})\b/g,(m,d)=>numberWord(Number(d))).replace(/[^a-z0-9]/g,'');
export async function motionVoice(directory:string,script:string,state:MotionState,save:()=>Promise<void>):Promise<{voice:string;timing:MotionTiming;receipt:Receipt}>{
 assertAuthorizedExecution();
 const model=process.env.CAM_MOTION_WHISPER_MODEL??path.join(os.homedir(),'.cache/hyperframes/whisper/models/ggml-medium.bin');
 await access(model);await exec('whisper-cli',['--help'],{timeout:10000});
 await mkdir(directory,{recursive:true});
 if(state.operations.voice?.state==='complete'&&await access(path.join(directory,'raw-audio')).then(()=>true).catch(()=>false))return prepareSavedMotionVoice(directory,script,state,model);
 const token=await higgsfieldAccessToken();if(!token)throw Error('The recording service is not configured.');
 const client=new Client({name:'cam-motion',version:'1.0'});
 const transport=new StreamableHTTPClientTransport(new URL('https://mcp.higgsfield.ai/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}},reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1000,maxReconnectionDelay:1000,reconnectionDelayGrowFactor:1}});
 await client.connect(transport);
 const call=async(name:string,args:Record<string,unknown>)=>{assertAuthorizedExecution();return mcpData(await client.callTool({name,arguments:args},undefined,{timeout:20000}));};
 let credits:number|undefined;
 try{
  // Bram (Higgsfield preset 549ff70a…) since Shimi's decision of 2026-10-21; Dylan (b847bc29…) before.
  const params={model:'text2speech_v2',variant:'elevenlabs',prompt:script,voice_type:'preset',voice_id:process.env.CAM_MOTION_VOICE_ID??'549ff70a-3ee7-4f04-a4d9-89a24fab7709',count:1,use_unlim:false};
  let op=state.operations.voice;
  if(!op){
   const quote=z.object({cost:z.object({credits:z.number().nonnegative(),credits_exact:z.number().nonnegative().optional()})}).parse(await call('generate_audio',{params:{...params,get_cost:true}}));
   credits=quote.cost.credits_exact??quote.cost.credits;
   const ceiling=motionBudgets().voiceCredits;if(credits>ceiling)throw Error('Recording exceeds the configured supplier budget. No recording was submitted.');
   state.operations.voice={state:'sending',result:{quotedCredits:credits}};await save();
   const result=z.object({results:z.array(z.object({id:z.string().min(1)})).length(1)}).parse(await call('generate_audio',{params}));
   state.operations.voice={state:'accepted',id:result.results[0].id,result:{quotedCredits:credits}};await save();op=state.operations.voice;
  }
  if(op.state==='sending'||!op.id)throw Error('Recording submission needs reconciliation. No automatic retry was made.');
  let url=op.state==='complete'?String((op.result as {url:string}).url):undefined;
  for(let attempt=0;!url&&attempt<180;attempt++){
   const result=z.object({jobs:z.array(z.object({job_id:z.string(),status:z.string(),result_url:z.string().optional()})).length(1)}).parse(await call('jobs_wait',{jobs:[{job_id:op.id,index:0}],timeout_seconds:0}));
   const job=result.jobs[0];if(job.job_id!==op.id)throw Error('Recording identity mismatch.');
   if(job.status==='completed')url=providerOutputUrl(job.result_url,'higgsfield','live');
   else if(['failed','canceled','nsfw'].includes(job.status))throw Error('Recording failed. No automatic retry was made.');
   else await new Promise(resolve=>setTimeout(resolve,2000));
  }
  if(!url)throw Error('The recording is still processing. Its saved request can be resumed.');
  state.operations.voice={...op,state:'complete',result:{...(op.result as object),url}};await save();
  const response=await providerFetch(url,{redirect:'error'});if(!response.ok)throw Error('Could not retrieve the completed recording.');
  if(!response.body)throw Error('The recording response is empty.');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>50*1024*1024){await reader.cancel();throw Error('Recording exceeds the local size limit.');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=Buffer.concat(chunks);
  await writeFile(path.join(directory,'raw-audio'),bytes);
  return prepareSavedMotionVoice(directory,script,state,model);
 }finally{await client.close();}
}

/** Whisper quantises token offsets to 10 ms and may extend the last token past
 * the end of the audio, or overlap neighbours by a few milliseconds. Those are
 * measurement artefacts, not speech: clamp them so the strict validator judges
 * real alignment problems only (live stop on 2026-10-21: last word 54.34 s in a
 * 54.08 s recording). Large anomalies are left for the validator to refuse. */
export function clampWordTimings(words:{word:string;start:number;end:number}[],duration:number,tolerance=.5){
 for(const [i,w] of words.entries()){
  if(w.end>duration&&w.end-duration<=tolerance)w.end=duration;
  if(w.start>duration&&w.start-duration<=tolerance)w.start=duration;
  const prev=words[i-1];
  if(prev&&w.start<prev.end&&prev.end-w.start<=.05)w.start=prev.end;
  if(w.end<w.start&&w.start-w.end<=.05)w.end=w.start;
 }
 return words;
}
/** Merge consecutive tokens with the same normalised text into one token spanning both. */
export function collapseRepeatedTokens<T extends {text:string;offsets:{from:number;to:number}}>(tokens:T[]):T[]{
 const out:T[]=[];
 for(const t of tokens){const prev=out.at(-1);if(prev&&norm(prev.text)===norm(t.text)&&norm(t.text))out[out.length-1]={...prev,offsets:{from:prev.offsets.from,to:Math.max(prev.offsets.to,t.offsets.to)}};else out.push(t);}
 return out;
}
/** Local-only preparation: no provider connection, no narration regeneration. */
export async function prepareSavedMotionVoice(directory:string,script:string,state:MotionState,model=process.env.CAM_MOTION_WHISPER_MODEL??path.join(os.homedir(),'.cache/hyperframes/whisper/models/ggml-medium.bin')):Promise<{voice:string;timing:MotionTiming;receipt:Receipt}>{
 const op=state.operations.voice;if(op?.state!=='complete'||!op.id)throw Error('A completed saved recording is required.');
  const raw=path.join(directory,'raw-audio'),wav=path.join(directory,'voice-16k.wav'),output=path.join(directory,'alignment');
  const sourceHash=digest(await readFile(raw));
  const cache=path.join(directory,'alignment-source.json');
  const identity=digest(JSON.stringify({sourceHash,script,model}));
  const valid=await readFile(cache,'utf8').then(v=>JSON.parse(v).identity===identity).catch(()=>false);
  if(!valid){
  await exec('ffmpeg',['-y','-loglevel','error','-i',raw,'-ac','1','-ar','16000',wav]);
  await exec('whisper-cli',['-m',model,'-l','en','-f',wav,'-ml','1','-sow','-oj','-of',output,'-np'],{timeout:10*60000,maxBuffer:4*1024*1024});
  await writeFile(cache,JSON.stringify({identity,sourceHash}));
  }
  const result=z.object({transcription:z.array(z.object({text:z.string(),offsets:z.object({from:z.number(),to:z.number()})}))}).parse(JSON.parse(await readFile(output+'.json','utf8')));
  let tokens=result.transcription.filter(t=>norm(t.text)),stream=tokens.map(t=>norm(t.text)).join('');
  if(stream!==norm(script)){
   // Whisper sometimes emits a word twice ("victim of of propaganda", live stop 2026-10-21). When the collapsed transcript is the script, keep the merged token and its full span.
   const collapsed=collapseRepeatedTokens(tokens);const collapsedStream=collapsed.map(t=>norm(t.text)).join('');
   if(collapsedStream===norm(script)){tokens=collapsed;stream=collapsedStream;}
   else throw Error('The recording transcript differs from the script. Review is required before animation.');
  }
  let cursor=0;const spans=tokens.map(t=>{const start=cursor;cursor+=norm(t.text).length;return {start,end:cursor,t};});cursor=0;
  const originals=script.trim().split(/\s+/),words=originals.map(word=>{const end=cursor+norm(word).length,group=spans.filter(s=>s.end>cursor&&s.start<end);cursor=end;if(!group.length)throw Error('Incomplete word timing.');return {word,start:group[0].t.offsets.from/1000,end:group.at(-1)!.t.offsets.to/1000};});
  const sentences=[...new Intl.Segmenter('en',{granularity:'sentence'}).segment(script)].map(s=>s.segment.trim()).filter(Boolean);let offset=0;
  const phrases=sentences.map((text,i)=>{const count=text.split(/\s+/).length,group=words.slice(offset,offset+count);offset+=count;return {phrase:i+1,text,start:group[0].start,end:group.at(-1)!.end};});
  const pcm=await decodeAudio(raw);const duration=pcm.length/48000;clampWordTimings(words,duration);for(const p of phrases){p.start=Math.min(p.start,duration);p.end=Math.min(p.end,duration);}
  const timing={duration,estimated:false,words,phrases};validateTiming(timing,script);
  const paced=paceRecording(pcm,timing,{shots:phrases.map(()=>({breathBefore:.6}))},{sourceTailPolicy:'preserve-for-review'});
  const voice=path.join(directory,'voix.wav');await writeWave(voice,paced.pcm);await writeFile(path.join(directory,'timing.json'),JSON.stringify(paced.timing));
  state.audioReview={endingNeedsListening:paced.sourceTailNeedsListening,tailPaddingSeconds:paced.tailPaddingSeconds};
  await writeFile(path.join(directory,'audio-preparation.json'),JSON.stringify({sourceHash,sourceTailDb:paced.sourceTailDb,tailPaddingSeconds:paced.tailPaddingSeconds,originalSamplesPreserved:true,endingNeedsListening:paced.sourceTailNeedsListening}));
  return {voice,timing:paced.timing,receipt:{kind:'voice',requestId:op.id,actualUsd:null,quotedCredits:(op.result as {quotedCredits?:number})?.quotedCredits,model:'text2speech_v2'}};
}
