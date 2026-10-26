/** Studio runner (Shimi's decision of 2026-10-26: the software is a screen between Claude Code
 * and the client). Polls the queued studio missions, and for each one runs Claude Code headless in
 * the ALEF workspace with the `cam-attack` skill, then checks the delivery. One mission at a time,
 * under `caffeinate` so the Mac never sleeps mid-production.
 *
 *   npx tsx --env-file=.env scripts/studio-runner.ts            # loop
 *   npx tsx --env-file=.env scripts/studio-runner.ts --once     # one pass
 *   npx tsx --env-file=.env scripts/studio-runner.ts --mission <id>   # one mission
 *
 * Environment: CAM_STUDIO_WORKSPACE (default /Users/shimi/Documents/ALEF), CAM_STUDIO_CLAUDE (claude),
 * CAM_STUDIO_MODEL (default the session's model), CAM_STUDIO_MAX_TURNS (300), CAM_STUDIO_POLL_MS (30000). */
import {spawn} from 'node:child_process';
import {mkdir,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {listMissions,markInProduction,notifyStudio,type StudioMission} from '../src/lib/studio/missions';
import {pool} from '../src/db';
async function main(){
const workspace=process.env.CAM_STUDIO_WORKSPACE??'/Users/shimi/Documents/ALEF';
const repo=process.cwd();
const args=process.argv.slice(2),once=args.includes('--once'),only=args.includes('--mission')?args[args.indexOf('--mission')+1]:null;
const log=(...a:unknown[])=>console.log(new Date().toISOString(),'[studio-runner]',...a);
async function executorPrompt(m:StudioMission,dir:string){
 return `Mission studio CAM ${m.category} V${m.version} « ${m.title} » (id ${m.id}).
Lis d'abord le skill cam-attack (BINA/4 TOOLS/skills/cam-attack/SKILL.md) et applique-le intégralement, sans rien demander à personne.
Le dossier de travail est ${dir} (mission.json y est écrit). Dépôt de l'app : ${repo}.
Produis la version ${m.version}${m.version>1?` en appliquant uniquement les retours client listés dans mission.json`:''}, livre-la avec scripts/studio-deliver.ts, puis rends ton rapport final.`;
}
async function run(m:StudioMission){
 const dir=path.join(repo,'storage','comics',m.id);
 await mkdir(dir,{recursive:true});
 await writeFile(path.join(dir,'mission.json'),JSON.stringify(m,null,1));
 const prompt=await executorPrompt(m,dir);
 const claude=process.env.CAM_STUDIO_CLAUDE??'claude';
 const base=['--output-format','json','--max-turns',process.env.CAM_STUDIO_MAX_TURNS??'300','--dangerously-skip-permissions','--add-dir',repo,...(process.env.CAM_STUDIO_MODEL?['--model',process.env.CAM_STUDIO_MODEL]:[])];
 const invoke=(cli:string[])=>new Promise<{code:number|null;out:string}>(resolve=>{
  const child=spawn('caffeinate',['-i',claude,...cli],{cwd:workspace,env:{...process.env,CLAUDECODE:undefined,CLAUDE_CODE_SESSION_ID:undefined,CLAUDE_CODE_CHILD_SESSION:undefined},stdio:['ignore','pipe','pipe']});
  let out='';child.stdout.on('data',d=>{out+=d;});child.stderr.on('data',d=>{out+=d;});
  child.on('close',code=>resolve({code,out}));
 });
 const delivered=async()=>(await listMissions()).find(x=>x.id===m.id)?.state==='delivered';
 log('executing',m.id,'V'+m.version,m.title);
 const started=Date.now();
 let result=await invoke(['-p',prompt,...base]);
 let session='';try{session=String(JSON.parse(result.out).session_id??'');}catch{/* raw output kept */}
 // A headless session may end its answer while provider jobs are still running ("je reprends dans
 // 4 minutes"): resume the same session until the mission is delivered, bounded (2026-10-26).
 for(let resume=1;resume<=Number(process.env.CAM_STUDIO_RESUMES??6)&&session&&!(await delivered());resume++){
  await writeFile(path.join(dir,`executor-output-${resume}.json`),result.out);
  log('resuming',m.id,'attempt',resume);
  result=await invoke(['-p',`Continue la mission ${m.id} sans t'arrêter avant la livraison : attends les générations en cours avec jobs_wait (répète jusqu'à all_terminal), regarde les clips, refais ceux qui ne vivent pas (2 reprises max, sinon local), puis studio-build.ts, notes.md, studio-deliver.ts et ton rapport final.`,'--resume',session,...base]);
  try{const j=JSON.parse(result.out);session=String(j.session_id??session);}catch{/* keep session */}
 }
 await writeFile(path.join(dir,'executor-output.json'),result.out);
 let summary='';let cost=0;try{const j=JSON.parse(result.out);summary=String(j.result??'').slice(0,1500);cost=Number(j.total_cost_usd??0);}catch{summary=result.out.slice(-1500);}
 const minutes=((Date.now()-started)/60000).toFixed(1);
  const wasDelivered=await delivered();
 log('done',m.id,'delivered:',wasDelivered,'minutes:',minutes,'cost:',cost.toFixed(2));
 await writeFile(path.join(dir,'executor-report.md'),`# Rapport exécuteur\n\nMission ${m.id} V${m.version} « ${m.title} »\nDurée : ${minutes} min · Coût Claude : ${cost.toFixed(2)} $ · Livrée : ${wasDelivered}\n\n${summary}\n`);
 if(!wasDelivered)await notifyStudio({...m,script:`⚠️ Exécuteur terminé sans livraison (${minutes} min, ${cost.toFixed(2)} $). Rapport : storage/comics/${m.id}/executor-report.md\n${summary.slice(0,800)}`,feedback:[]}).catch(()=>{});
}
async function pass(){
 const open=(await listMissions({open:true})).filter(m=>m.category==='comics'&&(only?m.id===only:m.state==='queued'));
 for(const m of open.reverse()){
  const taken=m.state==='queued'?await markInProduction(m.id):m;
  if(!taken)continue;
  await run(taken);
  if(only)break;
 }
}
try{await access(path.join(workspace,'BINA/4 TOOLS/skills/cam-attack/SKILL.md'));}catch{throw Error('cam-attack skill missing in the workspace.');}
if(once||only){await pass();await pool.end();}
else{log('polling every',process.env.CAM_STUDIO_POLL_MS??'30000','ms');for(;;){try{await pass();}catch(e){log('error',e instanceof Error?e.message:String(e));}await new Promise(r=>setTimeout(r,Number(process.env.CAM_STUDIO_POLL_MS??30000)));}}
}
main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:String(e));process.exit(1);});
