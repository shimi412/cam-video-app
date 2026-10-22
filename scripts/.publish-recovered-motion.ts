import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,rename} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {pool} from '../src/db';import {lockMotion,saveMotion,motionDirectory} from '../src/lib/motion/store';
import {Film,assertChecks,digest,validateTiming} from '../src/lib/motion/model';import {publicMotion,type MotionState} from '../src/lib/motion/state';
import {postgresAgentStore} from '../src/lib/agent/store';
const exec=promisify(execFile),id='ae7b8699-8e43-40a0-a4ef-c272f59c6ae2',dir=path.resolve('storage/qa/motion-repair-2026-10-19');
globalThis.fetch=async()=>{throw Error('External requests forbidden during saved-work repair');};
async function main(){
 const film=Film.parse(JSON.parse(await readFile(path.join(dir,'assembled-film.json'),'utf8'))),audit=JSON.parse(await readFile(path.join(dir,'build-audit.json'),'utf8')),visual=JSON.parse(await readFile(path.join(dir,'browser-audit.json'),'utf8'));
 const {motionSound,verifyRenderedMotion}=await import('../src/lib/motion/worker');const sound=await motionSound(dir);const checks={holds:audit.holds,offsets:audit.offsets,...visual,...sound};assertChecks(checks);await verifyRenderedMotion(dir);
 await writeFile(path.join(dir,'checks.json'),JSON.stringify(checks,null,2));
 for(const scene of film.scenes){const row=audit.scenes.find((s:{id:string})=>s.id===scene.id);assert(row);await exec('ffmpeg',['-y','-loglevel','error','-ss',String(row.start),'-i',path.join(dir,'preview.mp4'),'-t',String((row.end??audit.duration)-row.start),'-c:v','libx264','-preset','fast','-c:a','aac','-movflags','+faststart',path.join(dir,`${scene.id}.mp4`)]);await exec('ffmpeg',['-y','-loglevel','error','-ss',String(Math.min(1,((row.end??audit.duration)-row.start)/2)),'-i',path.join(dir,`${scene.id}.mp4`),'-frames:v','1','-q:v','3',path.join(dir,`${scene.id}.jpg`)]);}
 await lockMotion(id,async()=>{
  const row=(await pool.query('SELECT state FROM motion_runs WHERE job_id=$1',[id])).rows[0];const s=row.state as MotionState;
  assert.equal(s.phase,'blocked');assert.equal(s.revision,0);assert.deepEqual(s.approved,{});assert(s.voice&&s.timing);validateTiming(s.timing,s.script);
  const originalVoice=digest(await readFile(s.voice));const finances=async()=>({calls:(await pool.query('SELECT * FROM api_calls WHERE job_id=$1 ORDER BY id',[id])).rows,wallet:(await pool.query('SELECT * FROM credit_ledger WHERE job_id=$1 ORDER BY id',[id])).rows,quotes:(await pool.query('SELECT * FROM customer_quotes WHERE job_id=$1 ORDER BY id',[id])).rows});const before=await finances();
  await writeFile(path.join(dir,'state-before.json'),JSON.stringify(s));
  const dest=motionDirectory(id,0),backup=dest+'-before-local-repair-20261019';
  const staging=dest+'-verified-repair';await mkdir(staging,{recursive:true});
  for(const name of ['assets','evidence','build.py','film.json','index.html','render.html','reference.py','audit-build.py','optional-helpers.py','browser-audit.mjs','compose-audio.py','timing.json','build-audit.json','build.log','browser-audit.json','marks.json','checks.json','render-samples.json','render-comparison.json','render.log','silent.mp4','mix.wav','final.mp4','preview.mp4',...film.scenes.flatMap(sc=>[sc.id+'.mp4',sc.id+'.jpg'])])await cp(path.join(dir,name),path.join(staging,name),{recursive:true});
  await rename(dest,backup);await rename(staging,dest);
  s.film=film;s.checks=checks;s.mediaHash=digest(await readFile(path.join(dest,'preview.mp4')));s.htmlHash=digest(await readFile(path.join(dest,'index.html')));s.phase='board';s.progress='Your animated storyboard is ready';s.error=undefined;
  // This old operation stopped before another request at the recorded budget
  // guard. Preserve its input, paid turn and failure; never fabricate a receipt.
  const stopped=s.operations['writing-0-repair-2'];assert.equal(stopped.state,'sending');stopped.state='failed';stopped.result={diagnostic:'Saved answer rejected, then stopped at remaining request budget; recovered locally from that saved answer.',turn:'c7d4deda6c60d504d23aa7bc048bd439c99eb7af11c374fd8b61e46112db2829'};
  s.operations['local-repair-20261019']={state:'complete',id:digest(film.source),result:{sourceBackup:backup,checks,mediaHash:s.mediaHash}};
  await saveMotion(id,s);
  await postgresAgentStore.event(id,'local-composition-repair-20261019','execution',{kind:'local-code-repair',sourceSha256:digest(film.source),sourceBackup:backup,phase:s.phase,checks,humanApproved:false,newPaidRequests:0});
  assert.equal(digest(await readFile(s.voice)),originalVoice);assert.deepEqual(await finances(),before);const view=publicMotion(id,s);assert.equal(view.scenes?.length,11);assert(view.preview);assert.equal(view.download,null);
  await writeFile(path.join(dir,'recovery-proof.json'),JSON.stringify({id,phase:s.phase,scenes:view.scenes?.length,duration:audit.duration,checks,mediaHash:s.mediaHash,voiceSha256:originalVoice,voiceUnchanged:true,paidReceiptsUnchanged:true,walletUnchanged:true,quotesUnchanged:true,newPaidRequests:0,humanApproved:false,preview:view.preview},null,2));
  console.log(JSON.stringify({phase:s.phase,scenes:view.scenes?.length,preview:view.preview,newPaidRequests:0}));
 });
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());
