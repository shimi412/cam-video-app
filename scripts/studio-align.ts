/** Studio executor helper (2026-10-26): align a recorded narration to the script, word by word,
 * with the same local Whisper check the Attack engine uses. Zero paid call.
 *
 *   npx tsx --env-file=.env scripts/studio-align.ts <workdir> <voice.wav> <panels.json>
 *
 * `panels.json` is the plan written by the executor (`{"panels":[{"id":1,"narration":"…"},…]}`);
 * the script is the narrations joined by a space. Writes `<workdir>/timing.json` and prints it. */
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {alignComicVoice} from '../src/lib/comics/voice';
import {Plan} from '../src/lib/comics/model';
async function main(){
const [workdir,voice,panelsFile]=process.argv.slice(2);
if(!workdir||!voice||!panelsFile){console.error('usage: studio-align.ts <workdir> <voice.wav> <panels.json>');process.exit(2);}
const plan=Plan.parse(JSON.parse(await readFile(panelsFile,'utf8')));
const script=plan.panels.map(p=>p.narration.trim()).join(' ');
const aligned=await alignComicVoice(path.resolve(workdir,'alignment'),path.resolve(voice),script,plan);
const timing=aligned.timing as {duration:number;words:unknown[];phrases:{phrase:number;start:number;end:number}[]};
await writeFile(path.join(workdir,'timing.json'),JSON.stringify(timing));
await copyFile(path.resolve(workdir,aligned.voice).replace(workdir+'/'+workdir,workdir),path.join(workdir,'voice','voix-aligned.wav')).catch(async()=>{await copyFile(path.resolve(aligned.voice),path.join(workdir,'voice','voix-aligned.wav'));});
console.log(JSON.stringify({duration:timing.duration,words:timing.words.length,phrases:timing.phrases.map(p=>({phrase:p.phrase,start:p.start,end:p.end})),voice:'voice/voix-aligned.wav',audioReview:aligned.audioReview}));
}
main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:String(e));process.exit(1);});
