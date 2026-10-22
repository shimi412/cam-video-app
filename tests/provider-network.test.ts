import {expect,it,vi} from "vitest";
import {providerFetch,SubmissionNotSentError,RetryableReadError,connectionNotEstablished} from "../src/lib/providers/network";
it("reports transient HTTP reads to the supervisor and leaves authentication errors explicit",async()=>{
 vi.useFakeTimers();
 try{
  const fetcher=vi.fn(async()=>new Response("temporarily unavailable",{status:503}));
  const result=providerFetch("https://example.com/status",{method:"GET"},fetcher);
  const rejected=expect(result).rejects.toBeInstanceOf(RetryableReadError);
  await vi.runAllTimersAsync();await rejected;expect(fetcher).toHaveBeenCalledTimes(1);
  const unauthorized=vi.fn(async()=>new Response("unauthorized",{status:401}));
  expect((await providerFetch("https://example.com/status",{method:"GET"},unauthorized)).status).toBe(401);
  expect(unauthorized).toHaveBeenCalledTimes(1);
 }finally{vi.useRealTimers();}
});
it("returns a read failure before any retry or generation POST",async()=>{
 const fetcher=vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValue(new Response("ok"));
 await expect(providerFetch("https://example.com/status",{method:"GET"},fetcher)).rejects.toBeInstanceOf(RetryableReadError);
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it("never retries an ambiguous POST",async()=>{
 const fetcher=vi.fn().mockRejectedValue(new TypeError("fetch failed",{cause:{code:"ECONNRESET"}}));
 await expect(providerFetch("https://example.com/submit",{method:"POST"},fetcher)).rejects.not.toBeInstanceOf(SubmissionNotSentError);
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it("recognizes only errors proving that no connection was established",async()=>{
 for(const code of ["ENOTFOUND","EAI_AGAIN","ECONNREFUSED","UND_ERR_CONNECT_TIMEOUT"]){
 const fetcher=vi.fn().mockRejectedValue(new TypeError("fetch failed",{cause:{code}}));
 await expect(providerFetch("https://example.com/submit",{method:"POST"},fetcher)).rejects.toBeInstanceOf(SubmissionNotSentError);
 expect(fetcher).toHaveBeenCalledTimes(1);
 }
 for(const code of ["ECONNRESET","UND_ERR_SOCKET","UND_ERR_HEADERS_TIMEOUT","ETIMEDOUT"])
 expect(connectionNotEstablished({cause:{code}})).toBe(false);
 expect(connectionNotEstablished({errors:[{code:"ENOTFOUND"},{code:"ECONNRESET"}]})).toBe(false);
});

it("resumes a proven unsent request with the same budget, while unknown attempts stay blocked",async()=>{
 const {mkdtemp,rm}=await import("node:fs/promises");const {tmpdir}=await import("node:os");const {join}=await import("node:path");
 const {advanceRequest}=await import("../src/lib/concept/request-journal");
 const {createBudget,budgetedQueue,quoteHash}=await import("../src/lib/concept/budget");
 const {randomUUID}=await import("node:crypto");
 vi.stubEnv("PROVIDER_MODE","dryrun");const dir=await mkdtemp(join(tmpdir(),"cam-unsent-"));
 try{
 let book:import("../src/lib/concept/budget").BudgetBook|null=null;
 const budget=createBudget({mode:"simulation",transaction:async fn=>{const result=fn(book);book=result.book;return result.result;}},{usd:1000000,"higgsfield-credit":0});
 const hash="a".repeat(64),plan="b".repeat(64),approvalId=randomUUID(),quote={plan,source:"simulation-fixture" as const,expiresAt:Date.now()+60000,lines:[{operation:hash,unit:"usd" as const,maximum:150000}]};
 const approval={id:approvalId,mode:"simulation" as const,plan,quote:quoteHash(quote),expiresAt:quote.expiresAt,caps:{usd:150000,"higgsfield-credit":0}};
 await budget.reserve({jobId:randomUUID(),plan,operations:[{fingerprint:hash,transport:"fal-queue"}],quote,approval});
 const submit=vi.fn().mockRejectedValueOnce(new SubmissionNotSentError("DNS failed")).mockResolvedValue({requestId:"saved"});
 const queue=budgetedQueue({mode:"simulation",submit,poll:async()=>({state:"complete",output:"saved-output"})},budget,approvalId,hash);
 await expect(advanceRequest({directory:dir,fingerprint:hash,queue,assertOwned:async()=>{}})).rejects.toBeInstanceOf(SubmissionNotSentError);
 expect((await budget.snapshot()).reservations[approvalId].entries[0].state).toBe("reserved");
 expect((await advanceRequest({directory:dir,fingerprint:hash,queue,assertOwned:async()=>{}})).state).toBe("complete");
 expect(submit).toHaveBeenCalledTimes(2);
 }finally{await rm(dir,{recursive:true,force:true});vi.unstubAllEnvs();}
});
