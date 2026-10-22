/** Read saved local evidence only. Never connects to a generation provider. */
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pool} from '../src/db';
import {planConcept} from '../src/lib/concept/storyboard';
import {getActiveRecipe} from '../src/lib/recipes';
import {alignVoice,whisperAlignment,scriptHash} from '../src/lib/concept/voice-alignment';
import {CAM_VOICE} from '../src/lib/concept/cam-voice';
import {captionGroups} from '../src/lib/concept/montage';
import {validateTiming} from '../src/lib/concept/controls';
import {recoverLocalVoiceAlignment} from '../src/lib/concept/local-voice-alignment';
async function main(){
 const id=process.argv[2];if(!/^[0-9a-f-]{36}$/.test(id??''))throw Error('Job ID required');
 const job=(await pool.query('SELECT script,params FROM jobs WHERE id=$1',[id])).rows[0];
 const board=planConcept(job.script,getActiveRecipe(job.params.templateSlug)!,job.params.aspectRatio,job.params.sceneDirections,job.params.sceneNarrations);
 const root=`storage/concepts/${id}/live`;
 type SavedRequest={output:string;fingerprint:string;requestId:string};
 let transcript:SavedRequest|undefined,voice:SavedRequest|undefined;
 const preserved=async()=>{
  const files=['production.json','state.json','storyboard-review.json',...(await readdir(`${root}/requests`)).map(n=>`requests/${n}`)];
  return Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(`${root}/${f}`)).digest('hex')])));
 };
 const before=await preserved();
 for(const name of await readdir(`${root}/requests`)){const r=JSON.parse(await readFile(`${root}/requests/${name}`,'utf8'));if(r.state!=='complete')continue;if(r.binding?.operation==='voice-alignment')transcript=r;else if(r.binding?.operation==='voice')voice=r;}
 if(!transcript||!voice)throw Error("Saved narration and transcript required");
 const file=`${root}/transfers/downloads/${voice.fingerprint}/narration.wav`;
 const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file],{encoding:'utf8'}));
 const hash=createHash('sha256').update(await readFile(file)).digest('hex');
 const phrases=board.shots.map(s=>s.narration);
 let alignment=whisperAlignment(JSON.parse(transcript.output),{audioSha256:hash,scriptSha256:scriptHash(phrases),voiceId:CAM_VOICE.voiceId,requestId:transcript.requestId,source:'fal-whisper'});
 const audio={kind:'audio' as const,file:'narration.wav' as const,duration,sha256:hash,sourceSha256:hash};
 if(process.argv.includes('--recover-local')){
  const client=await pool.connect(),key=`cam-job:${id}`;
  try{
   const acquired=(await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[key])).rows[0].locked;
   if(!acquired)throw Error('Production is active; leave the user test untouched.');
   try{alignment=await recoverLocalVoiceAlignment({phrases,audio,original:alignment,file:path.resolve(file),directory:path.resolve(root),assertOwned:async()=>{await client.query('SELECT 1');}});}
   finally{await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[key]);}
  }finally{client.release();}
 }
 const timing=alignVoice(phrases,audio,alignment,'live');
 validateTiming(timing,captionGroups(timing));
 const report={jobId:id,source:alignment.source,words:timing.words.length,scenes:timing.phrases.length,duration,originalTimestampsPreserved:JSON.stringify(timing.words.map(w=>[w.start,w.end]))===JSON.stringify(alignment.words.map(w=>[w.start,w.end])),productionAndReceiptsUnchanged:JSON.stringify(before)===JSON.stringify(await preserved()),paidCalls:0};
 await mkdir('storage/qa',{recursive:true});await writeFile(`storage/qa/saved-reading-${id}.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>pool.end());
