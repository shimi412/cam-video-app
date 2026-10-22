import {afterEach,expect,it,vi} from "vitest";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {advanceRequest,requestReceipts} from "../src/lib/concept/request-journal";
import {RetryableReadError} from "../src/lib/providers/network";
import {recoveryCapabilities} from "../src/lib/agent/recovery-policy";
import {productionStatus} from "../src/lib/production-status";

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
async function fixture(){
 vi.stubEnv("PROVIDER_MODE","dryrun");
 const directory=await mkdtemp(path.join(tmpdir(),"cam-read-recovery-"));
 let time=Date.now();vi.spyOn(Date,"now").mockImplementation(()=>time);
 const submit=vi.fn(async()=>({requestId:"original-accepted-request"}));
 const poll=vi.fn<()=>Promise<{state:"complete";output:string}>>();
 // Every call reads the receipt from disk, as a restarted worker would.
 const run=()=>advanceRequest({directory,fingerprint:"a".repeat(64),assertOwned:async()=>{},queue:{mode:"simulation",submit,poll}});
 return {directory,submit,poll,run,tick:()=>{time+=60000;},clean:()=>rm(directory,{recursive:true,force:true})};
}
it("recovers an accepted request after a read outage and worker restart without resubmitting",async()=>{
 const f=await fixture();
 try{
  f.poll.mockRejectedValueOnce(new RetryableReadError("timeout")).mockResolvedValue({state:"complete",output:"original-output"});
  await expect(f.run()).rejects.toThrow("timeout");
  expect((await requestReceipts(f.directory))[0].readRecovery?.failures).toBe(1);
  await f.run();expect(f.poll).toHaveBeenCalledTimes(1); // persisted backoff
  f.tick();expect((await f.run()).output).toBe("original-output");
  expect((await requestReceipts(f.directory))[0].readRecovery).toBeUndefined();
  await f.run();expect(f.submit).toHaveBeenCalledTimes(1);expect(f.poll).toHaveBeenCalledTimes(2);
  for(const call of f.poll.mock.calls)expect(call).toEqual(["original-accepted-request"]);
 }finally{await f.clean();}
});
it("records a provider refusal of the submission as a definitive failure, never as an unknown outcome",async()=>{
 const f=await fixture();
 try{
  const {SubmissionRejectedError}=await import("../src/lib/providers/network");const {DefinitiveRequestFailure}=await import("../src/lib/concept/request-journal");
  f.submit.mockRejectedValueOnce(new SubmissionRejectedError(403,"fal refused the request (HTTP 403): balance exhausted"));
  await expect(f.run()).rejects.toBeInstanceOf(DefinitiveRequestFailure);
  const [saved]=await requestReceipts(f.directory);expect(saved.state).toBe("failed");expect(saved.failureReason).toContain("HTTP 403");
  await expect(f.run()).rejects.toBeInstanceOf(DefinitiveRequestFailure);expect(f.submit).toHaveBeenCalledTimes(1);
 }finally{await f.clean();}
});
it("persists the retry ceiling across workers and never turns unavailable results into new orders",async()=>{
 const f=await fixture();
 try{
  f.poll.mockRejectedValue(new RetryableReadError("unavailable"));
  // Ten bounded retries (2 s … 5 min backoff, about half an hour) before support is asked (2026-10-21); still never a new order.
  for(let i=0;i<9;i++){await expect(f.run()).rejects.toThrow("unavailable");for(let m=0;m<6;m++)f.tick();}
  await expect(f.run()).rejects.toThrow("Saved result recovery exhausted");
  f.tick();await expect(f.run()).rejects.toThrow("Saved result recovery exhausted");
  expect(f.poll).toHaveBeenCalledTimes(10);expect(f.submit).toHaveBeenCalledTimes(1);
  const [saved]=await requestReceipts(f.directory);expect(saved.requestId).toBe("original-accepted-request");expect(saved.state).toBe("submitted");
 }finally{await f.clean();}
});
it("does not mistake a malformed result for a temporary network outage",async()=>{
 const f=await fixture();
 try{
  f.poll.mockRejectedValue(new Error("invalid provider output"));
  await expect(f.run()).rejects.toThrow("invalid provider output");
  expect((await requestReceipts(f.directory))[0].readRecovery).toBeUndefined();
 }finally{await f.clean();}
});
it("derives available tools from receipts and approval, never error words",()=>{
 expect(recoveryCapabilities([{operation:'scene',state:'submitting',requestId:null}],true,true)).toEqual(['needs-attention']);
 expect(recoveryCapabilities([{operation:'scene',state:'failed',requestId:'accepted'}],true,true)).toContain('replace-failed');
 expect(recoveryCapabilities([],false,false)).toEqual(['needs-attention','review-budget']);
});
it("keeps remaining draft progress visible and offers budget review only for a budget problem",()=>{
 const base={approved:true,finished:false,renewing:false,error:null,phase:"scene-3-draft",review:null,requests:[{operation:"scene-2-draft",state:"failed",requestId:"failed-id"}]};
 expect(productionStatus(base)).toMatchObject({running:true,canResume:false});
 expect(productionStatus({...base,phase:"draft-failures",error:"Scene 2 failed",failureAnalysis:{action:"replace-failed",message:"Review the failed scene replacement price.",pending:false}})).toMatchObject({running:false,canResume:false});
 expect(productionStatus({...base,error:"quote expired",requests:[],failureAnalysis:{action:"review-budget",message:"Review the remaining budget before continuing.",pending:false}})).toMatchObject({canResume:false,canUpdateBudget:true});
});
