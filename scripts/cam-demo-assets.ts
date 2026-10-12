import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { MediaResult } from '../src/lib/providers/types';
import { falImage } from '../src/lib/providers/fal';

async function main(){
const root=path.join(process.cwd(),'storage/cam-demo-oct05');
const plan=z.object({images:z.array(z.object({id:z.string(),prompt:z.string(),sample:z.boolean().optional()}))}).parse(JSON.parse(await readFile(path.join(root,'asset-plan.json'),'utf8')));
await mkdir(path.join(root,'assets'),{recursive:true});
const mode=process.argv[2]??'samples';
if(!['samples','all'].includes(mode))throw new Error('This R&D script generates generic object images only. Narration is reused locally; external client-script transmission is disabled.');
const selected=mode==='samples'?plan.images.filter((x)=>x.sample):plan.images;
const ledgerFile=path.join(root,'asset-ledger.json');
const ledger:Record<string, MediaResult & { status: string; review: string; createdAt: string }>=existsSync(ledgerFile)?JSON.parse(await readFile(ledgerFile,'utf8')):{};
async function save(){await writeFile(ledgerFile,JSON.stringify(ledger,null,2));}
for(const item of selected){
  const out=path.join(root,'assets',item.id+'.jpg');
  if(existsSync(out)&&ledger[item.id])continue;
  console.log('IMAGE',item.id);
  const r=await falImage.generateImage({prompt:item.prompt,aspectRatio:'9:16'});
  await copyFile(r.filePath,out);
  ledger[item.id]={...r,filePath:out,status:'generated',review:'pending',createdAt:new Date().toISOString()}; await save();
  console.log('DONE',item.id,r.realCostUsd);
}
console.log('ESTIMATED_ASSET_COST_USD',Object.values(ledger).reduce((s,x)=>s+(x.realCostUsd??0),0));
}
main().catch(e=>{console.error(e.message);process.exit(1)});
