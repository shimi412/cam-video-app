import {randomUUID} from 'node:crypto';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {comicsFixture,injectComicAssets} from '../comics/runtime/fixture';
import {buildComic} from '../src/lib/comics/render';
import {comicDirectory} from '../src/lib/comics/store';
import type {ComicState} from '../src/lib/comics/model';
async function main(){globalThis.fetch=async()=>{throw Error('External calls forbidden.');};if(process.argv.includes('--resume')){const s=JSON.parse(await readFile('storage/qa/comics-render-job.json','utf8'));const result=await buildComic(s);await writeFile('storage/qa/comics-render-proof.json',JSON.stringify({id:s.id,...result,paidCalls:0},null,2));console.log(result);return;}const f=await comicsFixture(),id=randomUUID();const s:ComicState={version:1,id,title:'Attack render rehearsal',script:f.script,phase:'working',revision:0,queued:true,work:'video',progress:'',approvedQuotes:[],operations:{},notes:[],votes:{},approved:{},images:{},clips:{},settings:{music:'normal',captions:true},targets:[]};await injectComicAssets(s,comicDirectory(id));await mkdir('storage/qa',{recursive:true});await writeFile('storage/qa/comics-render-job.json',JSON.stringify(s));console.log('Rendering isolated fixture',id);const result=await buildComic(s);console.log(JSON.stringify(result));await writeFile('storage/qa/comics-render-proof.json',JSON.stringify({id,...result,paidCalls:0},null,2));}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
