import {it,expect} from "vitest";
import {withImageRecovery,supersededImage,recoverableRequest,definitiveVideoFailure} from "../src/lib/concept/image-recovery";
import type {CamQuote} from "../src/lib/providers/cam-pricing";
const quote:CamQuote={id:"a".repeat(64),plan:"b".repeat(64),createdAt:1,expiresAt:2,lines:[{id:"scene-3-start",model:"image",kind:"image",unit:"usd",quantity:1,unitPrice:.15,maximum:150000,description:"image"}],caps:{usd:150000,"higgsfield-credit":0},falBillingAvailable:false};
it("adds a replacement allowance without releasing the uncertain original",()=>{
 const q=withImageRecovery(quote,{"scene-3-start":1});
 expect(q.caps.usd).toBe(300000);expect(q.lines[0]).toEqual(quote.lines[0]);expect(q.lines[1].id).toBe("scene-3-start-retry-1");expect(q.id).not.toBe(quote.id);
});
it("invalidates approval for each new replacement, retaining every previous allowance",()=>{
 expect(withImageRecovery(quote,{"scene-3-start":2}).caps.usd).toBe(450000);
 expect(withImageRecovery(quote,{"scene-3-start":2}).id).not.toBe(withImageRecovery(quote,{"scene-3-start":1}).id);
});
it("only supersedes attempts with an explicit approved replacement",()=>{
 expect(supersededImage("scene-3-start",{"scene-3-start":1})).toBe(true);
 expect(supersededImage("scene-3-start-retry-1",{"scene-3-start":1})).toBe(false);
 expect(supersededImage("scene-3-clip",{"scene-3-clip":1})).toBe(true);
 expect(supersededImage("scene-3-clip",{})).toBe(false);
 expect(supersededImage("scene-3-clip-retry-1",{"scene-3-clip":1})).toBe(false);
 expect(supersededImage("scene-2-start",{"scene-3-start":1})).toBe(false);
});
it("rejects missing operations and unbounded attempts",()=>{
 for(const retries of ([{voice:1},{"scene-3-start":11},{"scene-3-start":-1}] as Record<string,number>[]))expect(()=>withImageRecovery(quote,retries)).toThrow();
});

it("quotes only the failed draft replacement, retaining original and finishing allowances",()=>{
 const q:CamQuote={...quote,lines:[...quote.lines,{id:"scene-6-draft",kind:"video",model:"seedance_2_5",unit:"higgsfield-credit",quantity:1,unitPrice:12,maximum:12000000,description:"draft"}],caps:{usd:150000,"higgsfield-credit":12000000}};
 const replacement=withImageRecovery(q,{"scene-6-draft":1});
 expect(replacement.caps).toEqual({usd:150000,"higgsfield-credit":24000000});
 expect(replacement.lines.slice(0,2)).toEqual(q.lines);
 expect(replacement.lines[2].id).toBe("scene-6-draft-retry-1");
 expect(supersededImage("scene-6-draft",{"scene-6-draft":1})).toBe(true);
 expect(supersededImage("scene-6-draft-retry-1",{"scene-6-draft":1})).toBe(false);
});
it("offers draft recovery only for a confirmed technical failure",()=>{
 const receipt={state:"failed",requestId:"saved",failureReason:"failed",binding:{operation:"scene-6-draft"}};
 expect(recoverableRequest(receipt,{})).toBe(true);
 for(const change of [{state:"submitted"},{state:"submitting",requestId:undefined},{failureReason:"nsfw"},{failureReason:"ip_detected"},{failureReason:undefined}])expect(recoverableRequest({...receipt,...change},{})).toBe(false);
 expect(recoverableRequest(receipt,{"scene-6-draft":1})).toBe(false);
});

it("permits an explicitly priced replacement of a failed native clip but never an uncertain or moderated one",()=>{
 const receipt={state:"failed",requestId:"saved",failureReason:"failed",binding:{operation:"scene-3-clip"}};
 expect(recoverableRequest(receipt,{})).toBe(true);
 expect(recoverableRequest({...receipt,state:"submitting",requestId:undefined},{})).toBe(false);
 expect(recoverableRequest({...receipt,failureReason:"nsfw"},{})).toBe(false);
 expect(recoverableRequest(receipt,{"scene-3-clip":1})).toBe(false);
 // Single journey: refused at submission or moderated is definitive too; uncertain or superseded never is.
 expect(definitiveVideoFailure(receipt,{})).toBe(true);
 expect(definitiveVideoFailure({...receipt,failureReason:"nsfw"},{})).toBe(true);
 expect(definitiveVideoFailure({...receipt,requestId:undefined,failureReason:"Higgsfield refused the request"},{})).toBe(true);
 expect(definitiveVideoFailure({...receipt,state:"submitting",requestId:undefined},{})).toBe(false);
 expect(definitiveVideoFailure({...receipt,state:"submitted"},{})).toBe(false);
 expect(definitiveVideoFailure(receipt,{"scene-3-clip":1})).toBe(false);
 expect(definitiveVideoFailure({...receipt,binding:{operation:"scene-3-start"}},{})).toBe(false);
 const q:CamQuote={...quote,lines:[{id:"scene-3-clip",kind:"video",model:"native",unit:"usd",quantity:5,unitPrice:.1,maximum:500000,description:"clip"}],caps:{usd:500000,"higgsfield-credit":0}};
 const replacement=withImageRecovery(q,{"scene-3-clip":1});
 expect(replacement.lines[0]).toEqual(q.lines[0]);
 expect(replacement.lines[1].id).toBe("scene-3-clip-retry-1");
 expect(replacement.caps.usd).toBe(1000000);
});
