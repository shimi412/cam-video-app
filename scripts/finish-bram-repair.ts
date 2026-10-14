/** Free assembly of independently reviewed scene corrections. Network forbidden. */
import { readFile,writeFile,mkdir,cp,copyFile,rename } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { pool,schema } from '../src/db';
import { acquireJobLock } from '../src/lib/job-lock';
import { applyReviewedSceneRepairs,type ReviewedSceneRepair } from '../src/lib/concept/scene-repair';
import { getRecipe } from '../src/lib/recipes';
import { sha256 } from '../src/lib/concept/checkpoints';
import { requestReceipts } from '../src/lib/concept/request-journal';
import { renderProductionFlow,type RenderPacket } from '../src/lib/concept/production-flow';
import { ClipEditSchema } from '../src/lib/concept/finishing';
import { StoryboardSheetSchema, StoryboardDecisionSchema, requireApprovedStoryboardPanel } from '../src/lib/concept/storyboard-review';
const Selection=z.object({trials:z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1).max(3),clips:z.record(z.string(),ClipEditSchema),minimumSceneSeconds:z.record(z.string(),z.number().min(.25).max(15))}).strict();
async function main(){
 globalThis.fetch=async()=>{throw new Error('Network forbidden in local finishing.');};
 const id='2b0df353-688e-4d7c-b5aa-6a31cd4b2f21';
 const lock=await acquireJobLock(id);if(!lock)throw new Error('Production busy.');
 try{
  const base=path.join(process.cwd(),'storage/concepts',id,'live'), repairRoot=path.join(base,'repairs/bram-method-20261014');
  const sheet=StoryboardSheetSchema.parse(JSON.parse(await readFile(path.join(base,'storyboard-review.json'),'utf8')));
  const human=StoryboardDecisionSchema.parse(JSON.parse(await readFile(path.join(base,'storyboard-reviews',`${sheet.target}.json`),'utf8')));
  if(sheet.retrospective||human.target!==sheet.target||human.decision!=='approved')throw new Error('A revised storyboard needs human approval before republishing this film.');
  const session=JSON.parse(await readFile(path.join(repairRoot,'session.json'),'utf8')) as {trials:Record<string,ReviewedSceneRepair>};
  const selection=Selection.parse(JSON.parse(await readFile(path.join(repairRoot,'selection.json'),'utf8')));
  const original=JSON.parse(await readFile(path.join(base,'state.json'),'utf8')).render as RenderPacket;
  const originalReceipts=JSON.stringify(await requestReceipts(path.join(base,'requests')));
  const selected=selection.trials.map(n=>{if(!session.trials[n])throw new Error('Unknown reviewed trial.');return session.trials[n];});
  for(const trial of selected){const scene=trial.plan.repair.scene;requireApprovedStoryboardPanel(sheet,human,{scene,startSha256:trial.media[`scene-${scene}-start`].sha256,endSha256:trial.media[`scene-${scene}-end`]?.sha256,motion:trial.plan.repair.direction.motion});}
  const packet=applyReviewedSceneRepairs(original,selected,getRecipe('cam-clay')!);
  const revision=path.join(base,'finishing/claude-method-v4');await mkdir(revision,{recursive:true});
  await writeFile(path.join(revision,'render-packet.json'),JSON.stringify(packet,null,2));
  await writeFile(path.join(revision,'provenance.json'),JSON.stringify({originalFingerprint:original.fingerprint,selection,recording:packet.audioSha256,at:new Date().toISOString()},null,2));
  let mainResult:Awaited<ReturnType<typeof renderProductionFlow>>|undefined;
  const variants:{name:string;url:string}[]=[];
  for(const ending of ['cream','last-frame'] as const){
   const root=path.join(revision,ending);console.log(`Rendering ${ending} with inspected scene replacements; no network.`);
   const result=await renderProductionFlow(packet,root,path.join(root,'checkpoints'),lock.assertOwned,{
    hideTitles:true,reason:'Inspected physical actions, unchanged Bram recording, measured breaths, complete transformations, audio fades and CAM signature.',
    reviewedBy:'Codex visual frame review and final signal checks; Shimi listening pending',breaths:{2:.6,3:.7},ending,
    clips:selection.clips,minimumSceneSeconds:selection.minimumSceneSeconds,
   });
   variants.push({name:ending==='cream'?'Cream background':'Blurred last scene',url:`/api/media/concepts/${id}/live/finishing/claude-method-v4/${ending}/preview.mp4`});
   if(ending==='cream')mainResult=result;
   console.log(JSON.stringify({ending,duration:result.duration,audio:result.audioReport}));
  }
  if(!mainResult)throw new Error('Missing rendered film.');
  if(sha256(await readFile(original.voiceFile))!==original.audioSha256||JSON.stringify(await requestReceipts(path.join(base,'requests')))!==originalReceipts)throw new Error('Original production changed.');
  await lock.assertOwned();
  await cp(path.join(revision,'cream'),path.join(base,'montage'),{recursive:true});
  const output=path.join(process.cwd(),'storage/outputs',`${id}.mp4`),temp=`${output}.tmp`;
  await copyFile(mainResult.output,temp);await rename(temp,output);
  await copyFile(output,path.join(process.cwd(),'storage/outputs/cam-bram-corrige-v4.mp4'));
  const [job]=await lock.db.select().from(schema.jobs).where(eq(schema.jobs.id,id));
  await lock.db.update(schema.jobs).set({outputPath:output,params:{...job.params as object,finalDurationSeconds:mainResult.duration,formatExports:undefined,finishingRevision:sha256(await readFile(output)),editorialReview:'pending-final-listening',repairedScenes:selection.trials}}).where(eq(schema.jobs.id,id));
  await writeFile(path.join(base,'finishing-review.json'),JSON.stringify({status:'pending-final-listening',variants,scenes:packet.board.shots.map(({index,narration,scene,motion,references,endScene,overlay,strike,metaphor,stateChange,actionSeconds,breathBefore})=>({index,narration,scene,motion,references,endScene,overlay,strike,metaphor,stateChange,actionSeconds,breathBefore})),
   listeningUrl:`/api/media/concepts/${id}/live/finishing/claude-method-v4/cream/controls/transition-listening.wav`,
   waveformUrl:`/api/media/concepts/${id}/live/finishing/claude-method-v4/cream/controls/waveform-ending.png`,
   reportUrl:`/api/media/concepts/${id}/live/finishing/claude-method-v4/cream/controls/audio-report.json`,
   newPaidRequests:0,sourceTailNeedsListening:mainResult.audioReport.sourceTail,
   message:'The revised scenes have been checked frame by frame. The original Bram recording is preserved, with extra room for complete actions, audio fades and a CAM signature. Compare the two endings and check the last spoken word on headphones.'
  },null,2));
  console.log('Revised film published for final listening; original production and raw Bram WAV preserved.');
 }finally{await lock.release();await pool.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
