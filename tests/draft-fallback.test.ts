import {it,expect} from "vitest";
import {quoteClipFallback,quoteDraftFallback} from "../src/lib/concept/draft-fallback";
import {renewCamQuote,type CamQuote} from "../src/lib/providers/cam-pricing";
import {withImageRecovery} from "../src/lib/concept/image-recovery";
import {HF_SEEDANCE,KLING_PRO,KLING_STANDARD,selectedModels} from "../src/lib/concept/model-selection";
function fixture(){
 const line=(id:string,model:string,price:number):CamQuote["lines"][number]=>({id,model,kind:"video",unit:"usd",quantity:4,unitPrice:price/4e6,maximum:price,seconds:4,billing:"seconds",description:id});
 const previous:CamQuote={id:"a".repeat(64),plan:"b".repeat(64),scope:"production",createdAt:1,expiresAt:2,lines:[line("scene-1-draft",KLING_STANDARD,1e6),line("scene-1-clip",KLING_PRO,2e6),line("scene-6-draft",HF_SEEDANCE,3e6),line("scene-6-draft-retry-1",HF_SEEDANCE,3e6),line("scene-6-clip",HF_SEEDANCE,4e6)],caps:{usd:13e6,"higgsfield-credit":0},falBillingAvailable:false,selection:{version:1,minimumResolution:"1080p",workflow:"draft-first",method:"capabilities-and-live-prices",scenes:[1,6].map(scene=>({scene,operation:`scene-${scene}-clip`,selected:scene===6?HF_SEEDANCE:KLING_PRO,reason:"old",localText:false,candidates:[]})),notes:[]}};
 const current:CamQuote={...previous,createdAt:3,expiresAt:4,lines:[line("scene-1-draft",KLING_STANDARD,99e6),line("scene-1-clip",KLING_PRO,99e6),line("scene-6-draft",KLING_STANDARD,1e6),line("scene-6-clip",KLING_PRO,2e6)],selection:{...previous.selection!,scenes:previous.selection!.scenes.map(s=>({...s,selected:KLING_PRO}))}};
 const failed={fingerprint:"c".repeat(64),state:"failed",requestId:"failed-id",failureReason:"failed",binding:{operation:"scene-6-draft-retry-1",model:HF_SEEDANCE}};
 return {previous,current,failed,retries:{"scene-6-draft":1}};
}
it("changes only the failed scene's new draft and unsubmitted final, preserving all other amounts",()=>{
 const f=fixture(),r=quoteDraftFallback(f.previous,f.current,f.failed,[f.failed],f.retries);
 expect(r.retries).toEqual({"scene-6-draft":2});
 expect(r.quote.lines.slice(0,4)).toEqual(f.previous.lines.slice(0,4));
 expect(r.quote.lines.at(-1)).toMatchObject({id:"scene-6-draft-retry-2",model:KLING_STANDARD});
 expect(r.quote.lines.find(l=>l.id==="scene-6-clip")?.model).toBe(KLING_PRO);
 expect(selectedModels(r.quote.lines)).toEqual({"scene-1-clip":KLING_PRO,"scene-6-clip":KLING_PRO});
 expect(r.quote.caps.usd).toBe(12e6);expect(r.quote.id).not.toBe(f.previous.id);
});
it.each([{state:"submitted"},{state:"submitting",requestId:undefined},{binding:{operation:"scene-6-draft-retry-1",model:KLING_STANDARD}}])("refuses uncertain or nonmatching failure evidence",change=>{
 const f=fixture();expect(()=>quoteDraftFallback(f.previous,f.current,{...f.failed,...change},[f.failed],f.retries)).toThrow();
});
// No provider failure reaches the client (Shimi, 2026-10-23): a moderated or refused-at-submission draft is replaced too.
it.each([{failureReason:"nsfw"},{failureReason:"ip_detected"},{requestId:undefined,failureReason:"Higgsfield refused the request"}])("replaces a moderated or refused draft like a technical failure",change=>{
 const f=fixture(),r=quoteDraftFallback(f.previous,f.current,{...f.failed,...change},[f.failed],f.retries);
 expect(r.quote.draftRecoveries?.at(-1)).toMatchObject({scene:6,attempt:2,failedRequestId:"requestId" in change?"refused-at-submission":"failed-id"});
});
it("replaces a failed Seedance continuation by the scene's native Kling clip, with no second line and the draft cost kept",()=>{
 const f=fixture();
 // Whimsical: the native route has no draft line; the continuation's scene keeps its ids.
 const whimsical=(q:CamQuote):CamQuote=>({...q,lines:q.lines.filter(l=>l.id!=="scene-1-draft"),selection:{...q.selection!,workflow:"whimsical"}});
 f.previous=whimsical(f.previous);f.current=whimsical(f.current);
 const failed={fingerprint:"f".repeat(64),state:"failed",failureReason:"Higgsfield refused the request (tool error)",binding:{operation:"scene-6-clip",model:HF_SEEDANCE}};
 const r=quoteClipFallback(f.previous,f.current,failed,{"scene-6-draft":1});
 expect(r.retries).toEqual({"scene-6-draft":1,"scene-6-clip":1});
 expect(r.quote.lines.map(l=>l.id)).toEqual(f.previous.lines.map(l=>l.id));
 expect(r.quote.lines.find(l=>l.id==="scene-6-clip")).toMatchObject({model:KLING_PRO,maximum:2e6});
 expect(r.quote.lines.filter(l=>l.id.startsWith("scene-6-draft")).every(l=>l.model===HF_SEEDANCE)).toBe(true);
 expect(r.quote.draftRecoveries?.at(-1)).toEqual({scene:6,attempt:1,failedRequestId:"refused-at-submission",failedFingerprint:failed.fingerprint,operation:"scene-6-clip"});
 expect(selectedModels(r.quote.lines)["scene-6-clip"]).toBe(KLING_PRO);
 expect(r.quote.caps.usd).toBe(10e6);
 // The next attempt runs under the Kling line: a recovery-aware allowance adds nothing for it.
 expect(withImageRecovery(r.quote,r.retries).lines.map(l=>l.id)).toEqual(r.quote.lines.map(l=>l.id));
 // A later Kling failure on the same scene still gets its own priced attempt.
 expect(withImageRecovery(r.quote,{...r.retries,"scene-6-clip":2}).lines.at(-1)).toMatchObject({id:"scene-6-clip-retry-2",model:KLING_PRO});
 expect(()=>quoteClipFallback(f.previous,f.current,{...failed,state:"submitted"},{})).toThrow(/confirmed/);
 expect(()=>quoteClipFallback(f.previous,f.current,{...failed,binding:{operation:"scene-6-draft",model:HF_SEEDANCE}},{})).toThrow(/confirmed/);
 expect(()=>quoteClipFallback(f.previous,f.current,failed,{"scene-6-clip":1})).toThrow(/confirmed/);
});
it("refuses to replace a scene with a final already submitted",()=>{
 const f=fixture();expect(()=>quoteDraftFallback(f.previous,f.current,f.failed,[f.failed,{...f.failed,state:"submitted",binding:{operation:"scene-6-clip",model:HF_SEEDANCE}}],f.retries)).toThrow(/final request/);
});
it("requires the actual duration and a new quote for approval",()=>{
 const f=fixture();f.current.lines.find(l=>l.id==="scene-6-draft")!.seconds=15;
 expect(()=>quoteDraftFallback(f.previous,f.current,f.failed,[f.failed],f.retries)).toThrow(/duration/);
});
it("refreshes the fallback without rewriting old failed model/cost history",()=>{
 const f=fixture(),r=quoteDraftFallback(f.previous,f.current,f.failed,[f.failed],f.retries);
 const attempted=new Set(["scene-1-draft","scene-6-draft","scene-6-draft-retry-1"]);
 const renewed=renewCamQuote(r.quote,withImageRecovery(f.current,r.retries),attempted);
 for(const id of attempted)expect(renewed.lines.find(l=>l.id===id)).toEqual(r.quote.lines.find(l=>l.id===id));
 expect(renewed.draftRecoveries).toEqual(r.quote.draftRecoveries);
 expect(renewed.lines.find(l=>l.id==="scene-6-draft-retry-2")?.model).toBe(KLING_STANDARD);
});

function whimsicalFixture(){
 const f=fixture();f.previous.selection!.workflow="whimsical";f.current.selection!.workflow="whimsical";
 f.current.lines=f.current.lines.filter(l=>l.id!=="scene-6-draft");return f;
}
it("replaces a failed Whimsical draft with one native clip, retaining paid failure history",()=>{
 const f=whimsicalFixture(),r=quoteDraftFallback(f.previous,f.current,f.failed,[f.failed],f.retries);
 expect(r.quote.selection?.workflow).toBe("whimsical");expect(r.quote.lines).toHaveLength(f.previous.lines.length);
 expect(r.quote.lines.filter(l=>l.id.includes("scene-6-draft"))).toEqual(f.previous.lines.filter(l=>l.id.includes("scene-6-draft")));
 expect(r.quote.lines.find(l=>l.id==="scene-6-clip")).toEqual(f.current.lines.find(l=>l.id==="scene-6-clip"));
 const fresh=withImageRecovery(f.current,r.retries);
 expect(fresh.lines.some(l=>l.id==="scene-6-draft-retry-2")).toBe(false);
 const renewed=renewCamQuote(r.quote,fresh,new Set(["scene-6-draft","scene-6-draft-retry-1"]));
 expect(renewed.lines.filter(l=>l.id.startsWith("scene-6-draft"))).toHaveLength(2);
 expect(renewed.expiresAt).toBe(f.current.expiresAt);expect(renewed.draftRecoveries).toEqual(r.quote.draftRecoveries);
});
it("does not change workflow, shorten an action or replace an already attempted native clip",()=>{
 const f=whimsicalFixture();f.current.selection!.workflow="draft-first";
 expect(()=>quoteDraftFallback(f.previous,f.current,f.failed,[f.failed],f.retries)).toThrow(/preserve/);
 f.current.selection!.workflow="whimsical";f.current.lines.find(l=>l.id==="scene-6-clip")!.seconds=3;
 expect(()=>quoteDraftFallback(f.previous,f.current,f.failed,[f.failed],f.retries)).toThrow(/duration/);
 expect(()=>quoteDraftFallback(f.previous,f.current,f.failed,[f.failed,{...f.failed,binding:{operation:"scene-6-clip-retry-1",model:KLING_PRO}}],f.retries)).toThrow(/final request/);
});
