import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {assembleMotionRuntime} from '../src/lib/motion/assembly';
import {compileMotion,inspectMotion,motionSound} from '../src/lib/motion/worker';
async function main(){
const id='ae7b8699-8e43-40a0-a4ef-c272f59c6ae2',root=path.resolve('storage/motion',id),dir=path.resolve('storage/qa/motion-repair-2026-10-19');
await mkdir(dir,{recursive:true});
const original=JSON.parse(await readFile(path.join(dir,'saved-candidate.json'),'utf8')),timing=JSON.parse(await readFile(path.join(root,'timing.json'),'utf8')),ref=await readFile('motion/reference/plot-hole-v4-safe.py','utf8');
const film=await assembleMotionRuntime(original,ref,timing);
await writeFile(path.join(dir,'assembled-film.json'),JSON.stringify(film));
try{console.log(await compileMotion(dir,film,timing,path.join(root,'voix.wav'),undefined,[]));console.log(await inspectMotion(dir));console.log(await motionSound(dir));}catch(e){console.error(String(e));process.exitCode=1;}

}
main().catch(e=>{console.error(e);process.exitCode=1;});
