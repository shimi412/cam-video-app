import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { demoClip } from '../src/lib/providers/demo-media';
async function main(){
 const root=path.join(process.cwd(),'storage/cam-demo-oct05');
 const jobs=JSON.parse(await readFile(path.join(root,'clip-plan.json'),'utf8'));
 const filter=process.argv[2];
 for(const job of jobs.filter((j:any)=>!filter||j.id===filter)){
  console.log('CLIP',job.id);const r=await demoClip(root,job.id,job.prompt,job.seconds);console.log('DONE',job.id,r.estimatedCostUsd);
 }
}
main().catch(e=>{console.error(JSON.stringify({message:e.message,status:e.status,body:e.body}));process.exit(1)});
