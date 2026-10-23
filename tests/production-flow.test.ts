import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { resolveParams } from "../src/lib/brain";
import { getRecipe } from "../src/lib/recipes";
import { advanceProductionFlow, flowReviewTarget, type FlowInput, type FlowReview, type FlowDecision } from "../src/lib/concept/production-flow";
import { createBudget, quoteHash, type BudgetBook, type BudgetQuote } from "../src/lib/concept/budget";
import { sha256 } from "../src/lib/concept/checkpoints";
import { KLING_PRO, HF_SEEDANCE } from "../src/lib/concept/model-selection";

let directory: string;
beforeEach(async () => { vi.stubEnv("PROVIDER_MODE", "dryrun"); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden"); })); directory = await mkdtemp(path.join(os.tmpdir(), "cam-flow-")); });
afterEach(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); await rm(directory, { recursive: true, force: true }); });
function fixture() {
  const script = "Offline pipeline test.", { params } = resolveParams(script, "auto");
  const unexpected = vi.fn(async () => { throw new Error("Unexpected provider call"); });
  const review = vi.fn(async (_request: FlowReview) => { void _request; return null; });
  const input: FlowInput = { directory, jobId: randomUUID(), script, params, recipe: getRecipe(params.templateSlug)!,
    references: [{ id: "narrator", url: "/narrator.png", sha256: "a".repeat(64), filePath: "/unread-reference" , characterSheet:{status:"approved",sha256:"a".repeat(64),approvedAt:"2026-10-14"}}], assertOwned: async () => {},
    services: { mode: "simulation", review, authorize: unexpected, queue: () => { throw new Error("Unexpected queue"); }, cost: unexpected,
      assets: { mode: "simulation", upload: unexpected, download: unexpected } } };
  return { input, unexpected, review };
}
it("stops live mode before callbacks or file access, irrespective of supplied services", async () => {
  const f = fixture(); f.input.services.mode = "live";
  await expect(advanceProductionFlow(f.input)).rejects.toThrow("paid generation is disabled");
  expect(f.review).not.toHaveBeenCalled(); expect(f.unexpected).not.toHaveBeenCalled();
});
it("refuses a mixed transport mode before any side effect", async () => {
  const f = fixture(); f.input.services.assets.mode = "live";
  await expect(advanceProductionFlow(f.input)).rejects.toThrow("Mixed production"); expect(f.unexpected).not.toHaveBeenCalled();
});
it("refuses a request journal from a different job before requesting any approval", async () => {
  const f = fixture(), fingerprint = "a".repeat(64);
  await mkdir(path.join(directory, "requests"));
  await writeFile(path.join(directory, "requests", `${fingerprint}.json`), JSON.stringify({ mode: "simulation", fingerprint, state: "complete", requestId: "saved-id", output: "fixture",
    binding: { jobId: randomUUID(), operation: "voice", model: "text2speech_v2", transport: "higgsfield-mcp", payloadSha256: "b".repeat(64) } }));
  await expect(advanceProductionFlow(f.input)).rejects.toThrow("different job"); expect(f.review).not.toHaveBeenCalled();
});
it("pauses before the Bram request until the script is reviewed", async () => {
  const f = fixture(); const result = await advanceProductionFlow(f.input);
  expect(result).toMatchObject({ status: "awaiting-review", phase: "script", paidGenerationAuthorized: false });
  expect(f.unexpected).not.toHaveBeenCalled(); expect(result.events).toEqual([]);
});
it("does not accept a rejected, stale or cross-mode script decision", async () => {
  const f = fixture(); const initial = await advanceProductionFlow(f.input);
  for (const decision of [
    { mode: "simulation" as const, target: initial.review!.target, decision: "rejected" as const },
    { mode: "live" as const, target: initial.review!.target, decision: "approved" as const },
    { mode: "simulation" as const, target: "b".repeat(64), decision: "approved" as const },
  ]) {
    f.input.services.review = async () => ({ id: randomUUID(), ...decision });
    expect((await advanceProductionFlow(f.input)).status).toBe(decision.decision === "rejected" ? "rejected" : "awaiting-review");
  }
  expect(f.unexpected).not.toHaveBeenCalled();
});
it("requires a budget tied to the exact Bram payload after the script decision", async () => {
  const f = fixture(); f.input.services.review = async (r) => ({ id: randomUUID(), target: r.target, decision: "approved", mode: "simulation" });
  f.input.services.authorize = async () => null;
  const result = await advanceProductionFlow(f.input);
  expect(result).toMatchObject({ status: "awaiting-budget", phase: "voice" });
  expect(result.plan!.operations).toHaveLength(1);
  expect(result.plan!.operations[0].input.voice_id).toBe("549ff70a-3ee7-4f04-a4d9-89a24fab7709");
  expect(f.unexpected).not.toHaveBeenCalled();
});
it("binds reviews to mode, job, stage, actual audio/timing and parent decisions", () => {
  const job = randomUUID(), data = { audio: "a".repeat(64), alignment: "b".repeat(64), parent: randomUUID() };
  const first = flowReviewTarget("simulation", job, "voice", data);
  for (const other of [flowReviewTarget("live", job, "voice", data), flowReviewTarget("simulation", randomUUID(), "voice", data),
    flowReviewTarget("simulation", job, "clip", data), flowReviewTarget("simulation", job, "voice", { ...data, audio: "c".repeat(64) }),
    flowReviewTarget("simulation", job, "voice", { ...data, alignment: "c".repeat(64) }), flowReviewTarget("simulation", job, "voice", { ...data, parent: randomUUID() })]) expect(other).not.toBe(first);
});

it("never resubmits an already saved image operation after a changed or legacy plan fingerprint", async () => {
  const f = fixture(), image = await sharp({ create: { width: 48, height: 48, channels: 3, background: "#245765" } }).png().toBuffer();
  const filePath = path.join(directory, "reference.png"); await writeFile(filePath, image);
  const hash = sha256(image);
  f.input.references[0] = { ...f.input.references[0], filePath, sha256: hash, characterSheet: { status: "approved", sha256: hash, approvedAt: "2026-10-15" } };
  f.input.services.storyboardBeforeVoice = true;
  f.input.services.reviewPolicy = "storyboard-first";
  f.input.services.review = async request => ({ id: randomUUID(), target: request.target, mode: "simulation", decision: "approved" });
  f.input.services.assets.upload = async () => ({ url: "https://simulation.invalid/reference.png", expiresAt: Date.now() + 86400_000 });
  const queue = vi.fn(() => { throw new Error("No generation may be submitted"); }); f.input.services.queue = queue;
  await mkdir(path.join(directory, "requests"));
  const fingerprint = "c".repeat(64);
  await writeFile(path.join(directory, "requests", `${fingerprint}.json`), JSON.stringify({ mode: "simulation", fingerprint, state: "complete", requestId: "already-paid-image", output: "https://simulation.invalid/saved.png",
    binding: { jobId: f.input.jobId, operation: "scene-1-start", model: "earlier-image-model", transport: "fal-queue", payloadSha256: "b".repeat(64) } }));
  await expect(advanceProductionFlow(f.input)).rejects.toThrow("saved image request from an earlier plan");
  expect(queue).not.toHaveBeenCalled(); expect(f.unexpected).not.toHaveBeenCalled();
});

it.each([false,true])("prepares the complete image storyboard before voice and preserves its approval (internal sheet: %s)", async (internalSheet) => {
  const f = fixture();
  const image = await sharp({ create: { width: 48, height: 48, channels: 3, background: "#245765" } }).png().toBuffer();
  const filePath = path.join(directory, "reference.png"); await writeFile(filePath, image);
  const hash = sha256(image);
  f.input.references[0] = { ...f.input.references[0], filePath, sha256: hash, characterSheet: { status: "approved", sha256: hash, approvedAt: "2026-10-15" } };
  if(internalSheet){
    f.input.params.editorialPlan={version:"semantic-ideas-v1",beats:[]};
    delete f.input.references[0].characterSheet;
  }
  const expectedOperations=internalSheet?[`cast-${(await import("node:crypto")).createHash("sha256").update(`reference-sheet-v1:narrator:${hash}`).digest("hex").slice(0,16)}-1`,"scene-1-start"]:["scene-1-start"];
  const decisions = new Map<string, FlowDecision>();
  let book: BudgetBook | null = null;
  const budget = createBudget({ mode: "simulation", transaction: async update => { const next = update(book); book = next.book; return next.result; } }, { usd: 1_000_000, "higgsfield-credit": 0 });
  const reservations = new Map<string, NonNullable<Awaited<ReturnType<FlowInput["services"]["authorize"]>>>>();
  const submitted: string[] = [];
  f.input.services = {
    ...f.input.services, storyboardBeforeVoice: true, reviewPolicy: "storyboard-first", videoModels: { "scene-1-clip": KLING_PRO },
    review: async request => {
      if (request.stage !== "script") return decisions.get(request.target) ?? null;
      if (!decisions.has(request.target)) decisions.set(request.target, { id: randomUUID(), mode: "simulation", target: request.target, decision: "approved" });
      return decisions.get(request.target)!;
    },
    authorize: async plan => {
      // Approval of the image budget cannot authorize a voice or animation.
      const op = plan.operations[0]; if (op.kind !== "image") return null;
      if (!reservations.has(plan.fingerprint)) {
        const quote: BudgetQuote = { plan: plan.fingerprint, source: "simulation-fixture", expiresAt: Date.now() + 86400_000, lines: [{ operation: op.fingerprint, unit: "usd", maximum: 1000 }] };
        reservations.set(plan.fingerprint, { budget, quote, approval: { id: randomUUID(), mode: "simulation", plan: plan.fingerprint, quote: quoteHash(quote), expiresAt: quote.expiresAt, caps: { usd: 1000, "higgsfield-credit": 0 } } });
      }
      return reservations.get(plan.fingerprint)!;
    },
    queue: operation => ({ mode: "simulation", submit: async () => { submitted.push(operation.id); return { requestId: operation.fingerprint }; }, poll: async () => ({ state: "complete", output: "https://simulation.invalid/image.png" }) }),
    cost: async () => ({ unit: "usd", actual: 1000, evidence: "offline fixture" }),
    assets: { mode: "simulation", upload: async bytes => ({ url: `https://simulation.invalid/${sha256(bytes)}`, expiresAt: Date.now() + 86400_000 }), download: async () => new Response(new Uint8Array(image)) },
  };
  try {
    const initial = await advanceProductionFlow(f.input);
    expect(initial).toMatchObject({ status: "awaiting-review", phase: "storyboard" });
    expect(initial.review?.storyboard).toHaveLength(1);
    if(internalSheet)expect(initial.review?.storyboard?.[0].characterSheets).toEqual([expect.objectContaining({id:expectedOperations[0],role:"narrator",media:expect.objectContaining({sha256:expect.any(String)})})]);
    expect(initial.review?.audio).toBeUndefined();
    expect(initial.review?.timing?.estimated).toBe(true);
    expect(initial.review?.storyboard?.[0].start?.quality?.issues.map(issue => issue.code)).toContain("wrong-aspect-ratio");
    expect(submitted).toEqual(expectedOperations);
    const resumed = await advanceProductionFlow(f.input);
    expect(resumed.review?.target).toBe(initial.review?.target);
    expect(submitted).toEqual(expectedOperations);
    // An annotation changes the reviewed composition, not the generated image.
    // Even a saved approval of the old board must not cover new graphics.
    decisions.set(initial.review!.target, { id: randomUUID(), mode: "simulation", target: initial.review!.target, decision: "approved" });
    f.input.services.storyboardEdits = { "1": { graphicLayers: [{ kind: "symbol", symbol: "hospital", position: "top-center" }] } };
    const annotated = await advanceProductionFlow(f.input);
    expect(annotated).toMatchObject({ status: "awaiting-review", phase: "storyboard" });
    expect(annotated.review?.target).not.toBe(initial.review?.target);
    expect(annotated.review?.storyboard?.[0].graphicLayers?.[0].symbol).toBe("hospital");
    expect(submitted).toEqual(expectedOperations);
    decisions.set(annotated.review!.target, { id: randomUUID(), mode: "simulation", target: annotated.review!.target, decision: "approved" });
    f.input.services.videoModels = { "scene-1-clip": HF_SEEDANCE };
    const afterApproval = await advanceProductionFlow(f.input);
    expect(afterApproval).toMatchObject({ status: "awaiting-budget", phase: "voice" });
    expect(afterApproval.events).toContainEqual(expect.objectContaining({ stage: "review-storyboard", fingerprint: annotated.review!.target }));
    expect(submitted).toEqual(expectedOperations);
  } finally { await rm(path.join(process.cwd(), "storage/imports", f.input.jobId), { recursive: true, force: true }); }
});

it("keeps a failed revised scene and completes another scene without resubmitting the rejected request",async()=>{
 const f=fixture();f.input.script="First idea. Second idea.";
 f.input.params.sceneNarrations=["First idea.","Second idea."];
 const image=await sharp({create:{width:72,height:128,channels:3,background:"#987654"}}).png().toBuffer();
 const filePath=path.join(directory,"reference.png");await writeFile(filePath,image);const hash=sha256(image);
 f.input.references[0]={...f.input.references[0],filePath,sha256:hash,characterSheet:{status:"approved",sha256:hash,approvedAt:"2026-10-18"}};
 let book:BudgetBook|null=null;
 const budget=createBudget({mode:"simulation",transaction:async update=>{const next=update(book);book=next.book;return next.result;}},{usd:1_000_000,"higgsfield-credit":0});
 const reservations=new Map<string,NonNullable<Awaited<ReturnType<FlowInput["services"]["authorize"]>>>>();
 const submitted:string[]=[];
 f.input.services={...f.input.services,storyboardBeforeVoice:true,reviewPolicy:"storyboard-first",
  review:async request=>request.stage==="script"?{id:randomUUID(),target:request.target,mode:"simulation",decision:"approved"}:null,
  authorize:async plan=>{const op=plan.operations[0];if(op.kind!=="image")throw Error("Unexpected animation");if(!reservations.has(plan.fingerprint)){const quote:BudgetQuote={plan:plan.fingerprint,source:"simulation-fixture",expiresAt:Date.now()+86400000,lines:[{operation:op.fingerprint,unit:"usd",maximum:1000}]};reservations.set(plan.fingerprint,{budget,quote,approval:{id:randomUUID(),mode:"simulation",plan:plan.fingerprint,quote:quoteHash(quote),expiresAt:quote.expiresAt,caps:{usd:1000,"higgsfield-credit":0}}});}return reservations.get(plan.fingerprint)!;},
  queue:op=>({mode:"simulation",submit:async()=>{submitted.push(op.id);return {requestId:op.fingerprint};},poll:async()=>op.id==="scene-1-start-retry-1"?{state:"failed",failureReason:"content_policy_violation"}:{state:"complete",output:"https://simulation.invalid/image.png"}}),
  cost:async()=>({unit:"usd",actual:1000,evidence:"fixture"}),
  assets:{mode:"simulation",upload:async bytes=>({url:`https://simulation.invalid/${sha256(bytes)}`,expiresAt:Date.now()+86400000}),download:async()=>new Response(new Uint8Array(image))}
 };
 try{
  const initial=await advanceProductionFlow(f.input);expect(initial.review?.storyboard).toHaveLength(2);
  f.input.services.imageRetries={"scene-1-start":1,"scene-2-start":1};
  f.input.services.imageRevisions={1:{note:"Cooler lighting",attempt:1,animationContract:2},2:{note:"Wider camera",attempt:1,animationContract:2}};
  const changed=await advanceProductionFlow(f.input);
  expect(changed.status).toBe("awaiting-review");expect(Object.keys(changed.storyboardFailures??{})).toEqual(["1"]);
  expect(changed.review?.storyboard?.[0]).toEqual(initial.review?.storyboard?.[0]);
  expect(changed.review?.storyboard?.[1].startScene).toContain("Wider camera");
  expect(submitted).toContain("scene-2-start-retry-1");
  const count=submitted.length;await advanceProductionFlow(f.input);expect(submitted).toHaveLength(count);
 }finally{await rm(path.join(process.cwd(),"storage/imports",f.input.jobId),{recursive:true,force:true});}
});

it('reuses completed images after the hosted reference URLs are refreshed (live Clay 2026-10-23)',async()=>{
 const f=fixture();f.input.script="First idea. Second idea.";
 f.input.params.sceneNarrations=["First idea.","Second idea."];
 const image=await sharp({create:{width:72,height:128,channels:3,background:"#345678"}}).png().toBuffer();
 const filePath=path.join(directory,"reference.png");await writeFile(filePath,image);const hash=sha256(image);
 f.input.references[0]={...f.input.references[0],filePath,sha256:hash,characterSheet:{status:"approved",sha256:hash,approvedAt:"2026-10-18"}};
 let book:BudgetBook|null=null;
 const budget=createBudget({mode:"simulation",transaction:async update=>{const next=update(book);book=next.book;return next.result;}},{usd:1_000_000,"higgsfield-credit":0});
 const reservations=new Map<string,NonNullable<Awaited<ReturnType<FlowInput["services"]["authorize"]>>>>();
 const submitted:string[]=[];let uploads=0;
 f.input.services={...f.input.services,storyboardBeforeVoice:true,reviewPolicy:"storyboard-first",
  review:async request=>request.stage==="script"?{id:randomUUID(),target:request.target,mode:"simulation",decision:"approved"}:null,
  authorize:async plan=>{const op=plan.operations[0];if(!reservations.has(plan.fingerprint)){const quote:BudgetQuote={plan:plan.fingerprint,source:"simulation-fixture",expiresAt:Date.now()+86400000,lines:[{operation:op.fingerprint,unit:"usd",maximum:1000}]};reservations.set(plan.fingerprint,{budget,quote,approval:{id:randomUUID(),mode:"simulation",plan:plan.fingerprint,quote:quoteHash(quote),expiresAt:quote.expiresAt,caps:{usd:1000,"higgsfield-credit":0}}});}return reservations.get(plan.fingerprint)!;},
  queue:op=>({mode:"simulation",submit:async()=>{submitted.push(op.id);return {requestId:op.fingerprint};},poll:async()=>({state:"complete",output:"https://simulation.invalid/image.png"})}),
  cost:async()=>({unit:"usd",actual:1000,evidence:"fixture"}),
  // Every upload returns a fresh hosted URL, as fal does after an expiry.
  assets:{mode:"simulation",upload:async bytes=>({url:`https://simulation.invalid/${sha256(bytes)}/${++uploads}`,expiresAt:Date.now()+3600_000}),download:async()=>new Response(new Uint8Array(image))}
 };
 try{
  const first=await advanceProductionFlow(f.input);expect(first.review?.storyboard).toHaveLength(2);const count=submitted.length;expect(count).toBeGreaterThan(0);
  // The hosted URLs expire (as fal's do after a day); the next run re-uploads and must reuse every completed image.
  const uploadsDir=path.join(f.input.directory,"transfers","uploads");const {readdir,readFile:readF,writeFile:writeF}=await import("node:fs/promises");
  for(const name of await readdir(uploadsDir)){const file=path.join(uploadsDir,name);const saved=JSON.parse(await readF(file,"utf8"));if(saved.state==="complete")await writeF(file,JSON.stringify({...saved,expiresAt:Date.now()-1000}));}
  const again=await advanceProductionFlow(f.input);
  expect(again.status).toBe("awaiting-review");expect(again.storyboardFailures??{}).toEqual({});expect(submitted).toHaveLength(count);expect(uploads).toBeGreaterThan(1);
  expect(again.review?.storyboard?.map(p=>p.start?.sha256)).toEqual(first.review?.storyboard?.map(p=>p.start?.sha256));
 }finally{await rm(path.join(process.cwd(),"storage/imports",f.input.jobId),{recursive:true,force:true});}
});

it('reworks a revised image refused by the provider inside the same batch and never shows the client a failure (Shimi, 2026-10-22)',async()=>{
 const f=fixture();f.input.script="First idea. Second idea.";
 f.input.params.sceneNarrations=["First idea.","Second idea."];
 const image=await sharp({create:{width:72,height:128,channels:3,background:"#987654"}}).png().toBuffer();
 const filePath=path.join(directory,"reference.png");await writeFile(filePath,image);const hash=sha256(image);
 f.input.references[0]={...f.input.references[0],filePath,sha256:hash,characterSheet:{status:"approved",sha256:hash,approvedAt:"2026-10-18"}};
 let book:BudgetBook|null=null;
 const budget=createBudget({mode:"simulation",transaction:async update=>{const next=update(book);book=next.book;return next.result;}},{usd:1_000_000,"higgsfield-credit":0});
 const reservations=new Map<string,NonNullable<Awaited<ReturnType<FlowInput["services"]["authorize"]>>>>();
 const submitted:string[]=[];const reworks:{scene:number;reason:string;attempt:number}[]=[];
 f.input.services={...f.input.services,storyboardBeforeVoice:true,reviewPolicy:"storyboard-first",
  review:async request=>request.stage==="script"?{id:randomUUID(),target:request.target,mode:"simulation",decision:"approved"}:null,
  authorize:async plan=>{const op=plan.operations[0];if(!reservations.has(plan.fingerprint)){const quote:BudgetQuote={plan:plan.fingerprint,source:"simulation-fixture",expiresAt:Date.now()+86400000,lines:[{operation:op.fingerprint,unit:"usd",maximum:1000}]};reservations.set(plan.fingerprint,{budget,quote,approval:{id:randomUUID(),mode:"simulation",plan:plan.fingerprint,quote:quoteHash(quote),expiresAt:quote.expiresAt,caps:{usd:1000,"higgsfield-credit":0}}});}return reservations.get(plan.fingerprint)!;},
  queue:op=>({mode:"simulation",submit:async()=>{submitted.push(op.id);return {requestId:op.fingerprint};},poll:async()=>op.id==="scene-1-start-retry-1"?{state:"failed",failureReason:"content_policy_violation"}:{state:"complete",output:"https://simulation.invalid/image.png"}}),
  cost:async()=>({unit:"usd",actual:1000,evidence:"fixture"}),
  assets:{mode:"simulation",upload:async bytes=>({url:`https://simulation.invalid/${sha256(bytes)}`,expiresAt:Date.now()+86400000}),download:async()=>new Response(new Uint8Array(image))},
  reworkRefusedImage:async({scene,revision,reason,attempt})=>{reworks.push({scene,reason,attempt});return {revision:{...revision,note:"A calm clay print shop, scraps stacked on a plain wooden tray",attempt:attempt+1},attempt:attempt+1};}
 };
 try{
  const initial=await advanceProductionFlow(f.input);expect(initial.review?.storyboard).toHaveLength(2);
  f.input.services.imageRetries={"scene-1-start":1};
  f.input.services.imageRevisions={1:{note:"Monsters stacking newspaper scraps onto an effigy",attempt:1,animationContract:2}};
  const changed=await advanceProductionFlow(f.input);
  expect(changed.status).toBe("awaiting-review");expect(changed.storyboardFailures??{}).toEqual({});
  expect(reworks).toEqual([{scene:1,reason:"content_policy_violation",attempt:1}]);
  expect(submitted).toContain("scene-1-start-retry-1");expect(submitted).toContain("scene-1-start-retry-2");
  expect(changed.review?.storyboard?.[0].startScene).toContain("plain wooden tray");
  expect(changed.events.some(e=>e.stage==="rework-scene-1-start")).toBe(true);
 }finally{await rm(path.join(process.cwd(),"storage/imports",f.input.jobId),{recursive:true,force:true});}
});
