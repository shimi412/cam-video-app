/** Read-only provider quotes; updates only the pending offer, never its approval. */
import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {homedir} from "node:os";
import {z} from "zod";
import {pool} from "../src/db";
import {updateLiveProduction} from "../src/lib/concept/live-production";
import {requestReceipts} from "../src/lib/concept/request-journal";
import {recoverableRequest} from "../src/lib/concept/image-recovery";
import {mediaFile} from "../src/lib/concept/preview-inputs";
import {sha256} from "../src/lib/concept/checkpoints";
import {HF_SEEDANCE} from "../src/lib/concept/model-selection";
import {customerQuote} from "../src/lib/customer-wallet";
async function main(){
 const jobId=z.uuid().parse(process.argv[2]);
 const config=JSON.parse(await readFile(path.join(homedir(),".config/cam-video-app/runtime.json"),"utf8"));
 Object.assign(process.env,{PROVIDER_MODE:"fal",CAM_RELEASE:"connected",CAM_LIVE_ENABLED:"1",CAM_AUTH_MODE:"required",CAM_HIGGSFIELD_AUTH_FILE:config.higgsfieldAuthFile});
 const directory=path.join(process.cwd(),"storage/concepts",jobId,"live"),stateFile=path.join(directory,"production.json");
 const before=JSON.parse(await readFile(stateFile,"utf8"));assert(before.approval&&!before.finished);
 const receipts=await requestReceipts(path.join(directory,"requests"));
 const failed=receipts.find(r=>r.binding?.model===HF_SEEDANCE&&recoverableRequest(r,before.retries??{}));assert(failed,"No matching technical failure to replace");
 const protectedFiles=new Map<string,string>();
 for(const r of receipts){
  protectedFiles.set(path.join(directory,"requests",`${r.fingerprint}.json`),sha256(await readFile(path.join(directory,"requests",`${r.fingerprint}.json`))));
  if(r.state!=="complete"||!/^scene-\d+-draft$/.test(r.binding?.operation??""))continue;
  const transfer=path.join(directory,"transfers/downloads",r.fingerprint,"receipt.json");
  const bytes=await readFile(transfer),download=JSON.parse(bytes.toString());protectedFiles.set(transfer,sha256(bytes));
  const file=path.join(process.cwd(),"storage/imports",jobId,mediaFile(download.media));protectedFiles.set(file,sha256(await readFile(file)));
 }
 const immutable={approval:before.approval,quote:before.quote,retries:before.retries,decisions:before.decisions,phases:before.phases};
 const result=await updateLiveProduction(jobId,{action:"recovery-quote",target:failed.fingerprint},before.approval.actor);
 assert.equal(result.advance,false,"Preparing a price must never dispatch production");
 const after=JSON.parse(await readFile(stateFile,"utf8"));
 assert.deepEqual({approval:after.approval,quote:after.quote,retries:after.retries,decisions:after.decisions,phases:after.phases},immutable);
 for(const [file,hash] of protectedFiles)assert.equal(sha256(await readFile(file)),hash,`Preserved file changed: ${file}`);
 assert(after.pendingQuote.draftRecoveries?.length);const customer=await customerQuote(jobId,after.pendingQuote);assert(customer,"Customer quote missing");
 const proof={jobId,protectedFiles:protectedFiles.size,originalReceiptsPreserved:true,completedDraftFilesPreserved:true,approvalUnchanged:true,paidCalls:0,customerTotalUsd:customer.amountCents/100,replacement:after.pendingQuote.draftRecoveries.at(-1)};
 await mkdir("storage/qa",{recursive:true});await writeFile("storage/qa/cam-draft-fallback-proof.json",JSON.stringify(proof,null,2));console.log(proof);
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Could not prepare alternative");process.exitCode=1;}).finally(()=>pool.end());
