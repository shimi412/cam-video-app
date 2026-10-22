import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {z} from 'zod';
import {decodeAudio,paceRecording,writeWave} from '../concept/editorial-audio';
import {validateTiming} from '../motion/model';
import {norm,clampWordTimings,collapseRepeatedTokens} from '../motion/voice';
import type {ComicPlan} from './model';
import {ComicStop} from './errors';
const exec=promisify(execFile);
export type Token={text:string;offsets:{from:number;to:number}};
const mismatch=()=>new ComicStop('needs-attention','The narration recording does not match your script word for word. Your script, recording and price are saved; no image was generated.','The recording transcript differs from the script. Review is required before animation.');
/** Pure alignment of Whisper tokens to the exact script and the panel partition.
 * Same tolerances as Motion (2026-10-21): a word emitted twice is merged only when
 * the collapsed transcript equals the script; a last token a few hundred ms past
 * the audio end and millisecond overlaps are clamped. Anything else stops. */
export function alignTokens(raw:Token[],script:string,plan:ComicPlan,duration:number){
 let tokens=raw.filter(t=>norm(t.text));
 if(tokens.map(t=>norm(t.text)).join('')!==norm(script)){
  const collapsed=collapseRepeatedTokens(tokens);
  if(collapsed.map(t=>norm(t.text)).join('')!==norm(script))throw mismatch();
  tokens=collapsed;
 }
 let cursor=0;const spans=tokens.map(t=>{const start=cursor;cursor+=norm(t.text).length;return {start,end:cursor,t};});cursor=0;
 const words=script.trim().split(/\s+/).map(word=>{const end=cursor+norm(word).length,group=spans.filter(s=>s.end>cursor&&s.start<end);cursor=end;if(!group.length)throw mismatch();return {word,start:group[0].t.offsets.from/1000,end:group.at(-1)!.t.offsets.to/1000};});
 clampWordTimings(words,duration);
 let offset=0;
 const phrases=plan.panels.map((p,i)=>{const count=p.narration.trim().split(/\s+/).length,group=words.slice(offset,offset+count);offset+=count;if(!group.length)throw mismatch();return {phrase:i+1,text:p.narration,start:Math.min(group[0].start,duration),end:Math.min(group.at(-1)!.end,duration)};});
 if(offset!==words.length)throw mismatch();
 const timing={duration,estimated:false,words,phrases};
 try{validateTiming(timing,script);}catch(e){throw new ComicStop('needs-attention','The narration timing could not be verified word by word. Your script, recording and price are saved; no image was generated.',e instanceof Error?e.message:String(e));}
 return timing;
}
const digest=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
/** Local only, no provider call. Runs right after the paid recording and BEFORE any
 * image is submitted, so a mismatch costs the voice alone. */
export async function alignComicVoice(directory:string,source:string,script:string,plan:ComicPlan){
 const model=process.env.CAM_MOTION_WHISPER_MODEL??path.join(os.homedir(),'.cache/hyperframes/whisper/models/ggml-medium.bin');await access(model);await mkdir(directory,{recursive:true});
 const bytes=await readFile(source);
 const raw=path.join(directory,'raw-audio'),wav=path.join(directory,'voice-16k.wav'),output=path.join(directory,'alignment'),cache=path.join(directory,'alignment-source.json');await writeFile(raw,bytes);
 const identity=digest(JSON.stringify({source:digest(bytes),script,model}));
 const valid=await readFile(cache,'utf8').then(v=>JSON.parse(v).identity===identity).catch(()=>false);
 if(!valid){
  await exec('ffmpeg',['-y','-loglevel','error','-i',raw,'-ac','1','-ar','16000',wav]);
  await exec('whisper-cli',['-m',model,'-l','en','-f',wav,'-ml','1','-sow','-oj','-of',output,'-np'],{timeout:10*60000,maxBuffer:4*1024*1024});
  await writeFile(cache,JSON.stringify({identity}));
 }
 const result=z.object({transcription:z.array(z.object({text:z.string(),offsets:z.object({from:z.number(),to:z.number()})}))}).parse(JSON.parse(await readFile(output+'.json','utf8')));
 const pcm=await decodeAudio(raw),timing=alignTokens(result.transcription,script,plan,pcm.length/48000);
 // An energetic last word is kept with a silent derived tail and disclosed for listening at finishing, never a paid voice retry.
 const paced=paceRecording(pcm,timing,{shots:timing.phrases.map(()=>({breathBefore:.6}))},{sourceTailPolicy:'preserve-for-review'});
 const voice=path.join(directory,'voix.wav');await writeWave(voice,paced.pcm);await writeFile(path.join(directory,'timing.json'),JSON.stringify(paced.timing));
 const audioReview={endingNeedsListening:paced.sourceTailNeedsListening,tailPaddingSeconds:paced.tailPaddingSeconds};
 await writeFile(path.join(directory,'audio-preparation.json'),JSON.stringify({identity,sourceTailDb:paced.sourceTailDb,...audioReview,originalSamplesPreserved:true}));
 return {voice,timing:paced.timing,audioReview};
}
