/** Resume a fully received preview locally. Every provider transport is denied. */
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
async function main(){
 const id=process.argv[2];assert.match(id??'',/^[a-f0-9-]{36}$/);
 Object.assign(process.env,{PROVIDER_MODE:'fal',CAM_RELEASE:'connected',CAM_LIVE_ENABLED:'1',CAM_AUTH_MODE:'required'});
 const dir=path.join(process.cwd(),'storage/concepts',id,'live');const json=async(file:string)=>JSON.parse(await readFile(path.join(dir,file),'utf8'));
 const state=await json('production.json'),flow=await json('state.json');
 assert.equal(flow.phase,'render-draft-film');assert(['The recording has no tail after its last word. Review or replace the recording before finishing.','Budget account configuration changed. Review the existing reservations.'].includes(state.error));assert(!state.pendingQuote);
 const files=new Map<string,string>();const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 for(const base of [path.join(dir,'requests'),path.join(process.cwd(),'storage/imports',id)])for(const name of await readdir(base,{recursive:true})){const file=path.join(base,name);try{files.set(file,digest(await readFile(file)));}catch(e){if((e as NodeJS.ErrnoException).code!=='EISDIR')throw e;}}
 let denied=0;const deny=async()=>{denied++;throw Error('Provider access forbidden during local preview repair');};globalThis.fetch=deny;
 const {runLiveProduction}=await import('../src/lib/concept/live-production');const {pool}=await import('../src/db');
 try{
  await runLiveProduction(id,{providers:async()=>({fal:deny,higgsfield:deny,close:async()=>{}}),assets:()=>({mode:'live' as const,upload:deny,download:deny}),budgetScope:'cam-provider-account'});
  const after=await json('production.json'),outcome=await json('state.json');
  assert.equal(after.error,null);assert.equal(outcome.review?.stage,'draft-film');assert.equal(outcome.status,'awaiting-review');
  assert.deepEqual(after.approval,state.approval);assert.deepEqual(after.quote,state.quote);
  assert.equal((await readdir(path.join(dir,'requests'))).length,[...files.keys()].filter(f=>f.startsWith(path.join(dir,'requests'))).length);
  for(const [file,sha]of files)assert.equal(digest(await readFile(file)),sha,`Original file changed: ${file}`);
  const proof={id,status:'passed',phase:outcome.review.stage,sourceFilesUnchanged:files.size,externalCalls:0,paidCalls:0,deniedTransportReads:denied,preview:outcome.review.film};
  await mkdir('storage/qa',{recursive:true});await writeFile('storage/qa/saved-quiet-tail-preview-proof.json',JSON.stringify(proof,null,2));console.log(proof);
 }finally{await pool.end();}
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
