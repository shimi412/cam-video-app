/** Assemble existing paid media only. All provider transports are disabled. */
import assert from "node:assert/strict";
import {cp,readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {z} from "zod";
import {pool} from "../src/db";
import {getActiveRecipe} from "../src/lib/recipes";
import {lockedAssets} from "../src/lib/concept/assets";
import {advanceProductionFlow,type FlowServices} from "../src/lib/concept/production-flow";
import {runLiveProduction} from "../src/lib/concept/live-production";
import {withCamExecution} from "../src/lib/providers/live-policy";
import {selectedModels} from "../src/lib/concept/model-selection";
import {combinedStoryboardEdits,emptyStoryboardFeedback} from "../src/lib/concept/storyboard-feedback";
import {requestReceipts} from "../src/lib/concept/request-journal";
import {sha256} from "../src/lib/concept/checkpoints";
import {mediaFile} from "../src/lib/concept/preview-inputs";
import type {createBudget} from "../src/lib/concept/budget";

async function main(){
 const id=z.uuid().parse(process.argv[2]),publish=process.argv.includes("--publish");
 Object.assign(process.env,{PROVIDER_MODE:"fal",CAM_RELEASE:"connected",CAM_LIVE_ENABLED:"1",CAM_AUTH_MODE:"required"});
 const root=path.join(process.cwd(),"storage/concepts",id,"live");
 const state=JSON.parse(await readFile(path.join(root,"production.json"),"utf8"));
 assert(state.approval&&!state.finished&&!state.pendingQuote);
 const receipts=await requestReceipts(path.join(root,"requests"));
 const protectedFiles=new Map<string,string>();
 for(const r of receipts){
  const f=path.join(root,"requests",`${r.fingerprint}.json`);protectedFiles.set(f,sha256(await readFile(f)));
  if(r.state!=="complete"||!/^scene-\d+-draft/.test(r.binding?.operation??""))continue;
  const t=path.join(root,"transfers/downloads",r.fingerprint,"receipt.json"),bytes=await readFile(t),download=JSON.parse(bytes.toString());
  protectedFiles.set(t,sha256(bytes));const media=path.join(process.cwd(),"storage/imports",id,mediaFile(download.media));protectedFiles.set(media,sha256(await readFile(media)));
 }
 let providerCalls=0;const forbidden=async():Promise<never>=>{providerCalls++;throw new Error("Provider access disabled: local preview recovery only");};
 const assets={mode:"live" as const,upload:forbidden,download:forbidden};
 if(!publish){
  const directory=path.join(process.cwd(),"storage/qa",`local-preview-${id}`);await mkdir(directory,{recursive:true});await cp(root,directory,{recursive:true});
  const job=(await pool.query("SELECT script,params FROM jobs WHERE id=$1",[id])).rows[0];
  const feedback=await readFile(path.join(directory,"storyboard-feedback.json"),"utf8").then(JSON.parse).catch(()=>emptyStoryboardFeedback());
  const budget={reserve:async()=>{}} as unknown as ReturnType<typeof createBudget>;
  const services:FlowServices={mode:"live",assets,allowPendingCost:true,cost:async()=>null,queue:()=>({mode:"live",submit:forbidden,poll:forbidden}),
   authorize:async plan=>{const saved=state.phases[plan.fingerprint];assert(saved,"No existing authorized phase for this request");assert(receipts.some(r=>r.fingerprint===plan.operations[0].fingerprint&&r.state==="complete"),"Every replayed request must already be complete");return {...saved,budget};},
   review:async request=>state.decisions.find((d:{target:string})=>d.target===request.target)??null,
   storyboardEdits:combinedStoryboardEdits(feedback),imageRevisions:feedback.imageRevisions,storyboardBeforeVoice:state.storyboardFirst,imageRetries:state.retries,reviewPolicy:"storyboard-first",videoWorkflow:state.quote.selection?.workflow,videoModels:selectedModels(state.quote.lines)};
  const references=await lockedAssets();
  const outcome=await withCamExecution(id,()=>advanceProductionFlow({jobId:id,script:job.script,params:job.params,recipe:getActiveRecipe(job.params.templateSlug)!,references,directory,assertOwned:async()=>{},services}));
  assert.equal(outcome.review?.stage,"draft-film");console.log({status:outcome.status,film:outcome.review?.film});
 }else{
  const book=(await pool.query("SELECT value FROM settings WHERE key=$1",["cam-budget:live:cam-provider-account"])).rows[0]?.value;
  assert(book?.caps,"Existing workspace budget required");
  process.env.CAM_WORKSPACE_USD_CEILING=String(book.caps.usd/1e6);
  process.env.CAM_WORKSPACE_HIGGSFIELD_CREDIT_CEILING=String(book.caps["higgsfield-credit"]/1e6);
  await runLiveProduction(id,{providers:async()=>({fal:forbidden,higgsfield:forbidden,close:async()=>{}}),assets:()=>assets,budgetScope:"cam-provider-account"});
  const after=JSON.parse(await readFile(path.join(root,"production.json"),"utf8")),outcome=JSON.parse(await readFile(path.join(root,"state.json"),"utf8"));
  assert.equal(after.error,null);assert.equal(outcome.review?.stage,"draft-film");assert.equal(after.finished,false);
  assert.deepEqual(after.decisions,state.decisions,"No human approval may be fabricated");console.log({status:outcome.status,film:outcome.review.film});
 }
 for(const [file,hash] of protectedFiles)assert.equal(sha256(await readFile(file)),hash,`Original changed: ${file}`);
 assert.equal(providerCalls,0);const proof={jobId:id,published:publish,providerCalls,paidCalls:0,protectedFiles:protectedFiles.size,originalMediaPreserved:true};
 await writeFile(`storage/qa/cam-local-preview-${publish?"published":"rehearsal"}.json`,JSON.stringify(proof,null,2));console.log(proof);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>pool.end());
