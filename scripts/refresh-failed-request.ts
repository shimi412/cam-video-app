/** Support reconciliation: only reads one existing job, never submits media. */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {homedir} from "node:os";
import path from "node:path";
import {z} from "zod";
import {eq} from "drizzle-orm";
import {schema,pool} from "../src/db";
import {acquireJobLock} from "../src/lib/job-lock";
import {withCamExecution} from "../src/lib/providers/live-policy";
import {connectCamProviders} from "../src/lib/providers/cam";
import {advanceRequest,requestReceipts} from "../src/lib/concept/request-journal";
import {saveCheckpoint} from "../src/lib/concept/checkpoints";
async function main(){
 const jobId=z.uuid().parse(process.argv[2]),requestId=z.uuid().parse(process.argv[3]);
 const config=JSON.parse(await readFile(path.join(homedir(),".config/cam-video-app/runtime.json"),"utf8"));
 Object.assign(process.env,{PROVIDER_MODE:"fal",CAM_RELEASE:"connected",CAM_LIVE_ENABLED:"1",CAM_AUTH_MODE:"required",CAM_HIGGSFIELD_AUTH_FILE:config.higgsfieldAuthFile});
 const lock=await acquireJobLock(jobId);assert(lock,"Production is active; leave it untouched.");
 try{
  const directory=path.join(process.cwd(),"storage/concepts",jobId,"live"),file=path.join(directory,"production.json");
  const state=JSON.parse(await readFile(file,"utf8"));assert(state.approval&&state.quote?.id===state.approval.quote,"Saved approval required");
  const receipts=await requestReceipts(path.join(directory,"requests"));
  const receipt=receipts.find(r=>r.requestId===requestId);assert(receipt?.state==="submitted"&&receipt.binding?.jobId===jobId&&receipt.binding.transport==="higgsfield-mcp");
  await withCamExecution(jobId,async()=>{
   const providers=await connectCamProviders();
   try{
    const response=await providers.higgsfield("jobs_wait",{jobs:[{index:0,job_id:requestId}],timeout_seconds:0}) as {structuredContent?:unknown;content?:{type:string;text?:string}[]};
    const raw=response.structuredContent??JSON.parse(response.content?.find(c=>c.type==="text")?.text??"null");
    const evidence=z.object({jobs:z.array(z.object({index:z.literal(0),job_id:z.literal(requestId),model:z.literal(receipt.binding!.model),status:z.enum(["failed","canceled","nsfw","ip_detected"])})).length(1)}).parse(raw);
    await saveCheckpoint(path.join(directory,"failure-evidence",`${requestId}.json`),{at:new Date().toISOString(),...evidence},lock.assertOwned);
    try{
     await advanceRequest({directory:path.join(directory,"requests"),fingerprint:receipt.fingerprint,binding:receipt.binding,assertOwned:lock.assertOwned,queue:{mode:"live",submit:async()=>{throw new Error("Submission forbidden in reconciliation");},poll:async id=>{assert.equal(id,requestId);return {state:"failed",failureReason:evidence.jobs[0].status};}}});
    }catch(error){if(!(error instanceof Error)||!error.message.includes("original request failed"))throw error;}
    state.error="The original request failed. An explicit new attempt is required.";
    await saveCheckpoint(file,state,lock.assertOwned);
    await lock.db.update(schema.jobs).set({error:state.error}).where(eq(schema.jobs.id,jobId));
    console.log({jobId,requestId,status:evidence.jobs[0].status,submitted:0,existingCompleted:receipts.filter(r=>r.state==="complete"&&r.binding?.operation.endsWith("-draft")).length});
   }finally{await providers.close();}
  });
 }finally{await lock.release();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Reconciliation failed");process.exitCode=1;}).finally(()=>pool.end());
