import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";

const fixture = vi.hoisted(() => ({
  job: null as Record<string, unknown> | null,
  locked: true, unlockFails: false, available: 100,
  pricing: { mode: "adaptive-v1", multiplier: 2, higgsfieldCreditUsd: .1 } as { mode: string; multiplier: number; higgsfieldCreditUsd: number },
  customerQuote: vi.fn(),
  actor: { id: "launch-actor", local: false },
  direct: vi.fn(), prepare: vi.fn(),
  verify: vi.fn(), validate: vi.fn(), view: vi.fn(), update: vi.fn(), frame: vi.fn(), initialize: vi.fn(), after: vi.fn(), release: vi.fn(), worker: vi.fn(), query: vi.fn(),
}));
let client: EventEmitter & { query: typeof fixture.query; release: typeof fixture.release };
vi.mock("../src/lib/access", () => ({ withAccess: <T,>(handler: T) => handler, actorFor: async () => fixture.actor }));
vi.mock("next/server", () => ({ after: fixture.after }));
vi.mock("../src/db", async () => {
 const schema=await vi.importActual<typeof import("../src/db/schema")>("../src/db/schema");
 return ({
  schema,
  connectionString: "postgres://offline:offline@127.0.0.1:1/offline",
  pool: { connect: async () => client },
  db: {
    select: () => ({ from: () => ({ where: async () => fixture.job ? [fixture.job] : [] }) }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run({
      execute: async()=>{},
      select:()=>({from:()=>({where:async()=>fixture.job?[fixture.job]:[]})}),
      insert:(table:unknown)=>({values:(values:Record<string,unknown>)=>({returning:async()=>{
        if(table===schema.jobs){fixture.job={...values,deletedAt:null};return [fixture.job];}
        return [{id:"new-conversation",...values}];
      }})}),
    }),
    update: () => ({ set: (changed: Record<string, unknown>) => ({ where: async () => { if (fixture.job) Object.assign(fixture.job, changed); } }) }),
  },
});});
vi.mock("../src/lib/providers/mode", () => ({ isSimulation: () => false, providerMode: () => "fal", brainMode: () => "api" }));
vi.mock("../src/lib/providers/live-policy", () => ({ assertCamConfigured: () => {} }));
vi.mock("../src/lib/customer-wallet", () => ({ customerPricingReady: async () => true, customerPricing: async () => fixture.pricing, customerQuote: fixture.customerQuote, walletTotals: async () => ({ available: fixture.available }) }));
vi.mock("../src/lib/concept/storyboard-launch", () => ({ verifyStoryboardLaunch: fixture.verify, assertStoryboardLaunchQuote: fixture.validate }));
vi.mock("../src/lib/concept/storyboard-launch-service", () => ({ initializeStoryboardLaunch: fixture.initialize }));
vi.mock("../src/lib/concept/live-production", () => ({ liveView: fixture.view, updateLiveProduction: fixture.update, runLiveProduction: fixture.worker }));
vi.mock("../src/lib/concept/preparation", () => ({ prepareConcept: fixture.prepare }));
vi.mock("../src/lib/concept/ai-direction", () => ({ directSemanticConcept: fixture.direct }));
vi.mock("../src/lib/credits",()=>({getBalanceUsd:async()=>100}));
vi.mock("../src/lib/providers/openrouter", async importOriginal => ({ ...await importOriginal<typeof import("../src/lib/providers/openrouter")>(), probeWriterModel: async () => {} }));
vi.mock("../src/lib/settings",()=>({getMarginMultiplier:async()=>2,getSetting:async()=>undefined}));
vi.mock("../src/lib/pricing",()=>({estimateProduction:()=>({totalBilledUsd:10})}));
vi.mock("../src/lib/workspace", () => ({ conversationExists: async () => true }));
vi.mock("../src/lib/providers/brain", () => ({ withBrainRequest: async (_scope: unknown, action: () => Promise<unknown>) => action() }));
vi.mock("../src/lib/brain-llm", () => ({ frameProduction: fixture.frame }));
import {resolveParams} from "../src/lib/brain";
import { POST } from "../src/app/api/productions/route";

const requestBody = {
  requestId: "9d137ae9-aad6-4f11-817d-a82a2de9a987",
  storyboardLaunchToken: "signed-preparation-ticket",
  script: "Check the original source before sharing a claim.",
  mode: "auto",
  previewSource: "planning",
};
const receipt = { actorId: "launch-actor", maxCustomerCents: 300, createdAt: 1, expiresAt: 2 };
function savedJob() {
  const identity = { ...requestBody }; delete (identity as Partial<typeof requestBody>).storyboardLaunchToken;
  return { id: requestBody.requestId, deletedAt: null, params: {
    live: true, originActorId: "launch-actor",
    originRequestHash: createHash("sha256").update(JSON.stringify(identity)).digest("hex"),
    storyboardLaunch: { actorId: "launch-actor", acceptedAt: 1, receipt, tokenHash: createHash("sha256").update(requestBody.storyboardLaunchToken).digest("hex") },
    draft: { simulation: false },
  } };
}
const send = (body: Record<string, unknown> = requestBody) => POST(new Request("http://localhost/api/productions", { method: "POST", body: JSON.stringify(body) }));
beforeEach(() => {
  vi.stubEnv("CAM_LIVE_ENABLED", "1");
  fixture.job = null; fixture.locked = true; fixture.unlockFails = false; fixture.available = 100;
  fixture.pricing = { mode: "adaptive-v1", multiplier: 2, higgsfieldCreditUsd: .1 };
  fixture.actor = { id: "launch-actor", local: false };
  for (const fn of [fixture.direct, fixture.prepare, fixture.verify, fixture.validate, fixture.view, fixture.update, fixture.frame, fixture.initialize, fixture.after, fixture.release, fixture.worker, fixture.query, fixture.customerQuote]) fn.mockReset();
  fixture.verify.mockReturnValue(receipt);
  fixture.frame.mockRejectedValue(new Error("Offline test stops before any planning provider."));
  fixture.initialize.mockResolvedValue({ advance: false });
  fixture.view.mockResolvedValue({ quote: null, approved: false, renewing: false, finished: false, review: null, requests: [], phase: "quote" });
  fixture.query.mockImplementation(async (sql: string) => {
    if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: fixture.locked }] };
    if (fixture.unlockFails) throw new Error("Lock connection disconnected");
    return { rows: [{ pg_advisory_unlock: true }] };
  });
  client = Object.assign(new EventEmitter(), { query: fixture.query, release: fixture.release });
});
afterEach(() => { vi.unstubAllEnvs(); });

it("requires a signed preparation ticket and enough balance before any paid planning", async () => {
  const missing = { ...requestBody }; delete (missing as Partial<typeof requestBody>).storyboardLaunchToken;
  expect(await (await send(missing)).json()).toMatchObject({ code: "STORYBOARD_LAUNCH_CHANGED" });
  fixture.verify.mockImplementationOnce(() => { throw new Error("Expired preparation ticket"); });
  expect(await (await send()).json()).toMatchObject({ code: "STORYBOARD_LAUNCH_EXPIRED" });
  fixture.available = 2;
  expect(await (await send()).json()).toMatchObject({ error: expect.stringContaining("Not enough available") });
  expect(fixture.frame).not.toHaveBeenCalled();
  expect(fixture.initialize).not.toHaveBeenCalled();
  expect(fixture.after).not.toHaveBeenCalled();
  expect(fixture.release).toHaveBeenCalledTimes(3);
});

it("serializes the initial Start request before framing begins", async () => {
  fixture.locked = false;
  const response = await send();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "STORYBOARD_LAUNCH_IN_PROGRESS" });
  expect(fixture.verify).not.toHaveBeenCalled(); expect(fixture.frame).not.toHaveBeenCalled();
  expect(fixture.release).toHaveBeenCalledOnce();
});

it("replays a persisted accepted ticket after expiry without repeating paid planning", async () => {
  fixture.job = savedJob(); fixture.initialize.mockResolvedValue({ advance: true });
  fixture.verify.mockImplementation(() => { throw new Error("Expired preparation ticket"); });
  const response = await send();
  expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({ jobId: requestBody.requestId, replayed: true });
  expect(fixture.verify).not.toHaveBeenCalled(); expect(fixture.frame).not.toHaveBeenCalled();
  expect(fixture.initialize).toHaveBeenCalledWith({ jobId: requestBody.requestId, actorId: "launch-actor", receipt }, expect.any(Object));
  expect(fixture.after).not.toHaveBeenCalled(); expect(fixture.worker).not.toHaveBeenCalled();
});

it("refuses changed inputs and other actors before replaying a saved launch", async () => {
  fixture.job = savedJob();
  expect((await send({ ...requestBody, script: `${requestBody.script} More words.` })).status).toBe(409);
  fixture.actor.id = "different-actor";
  expect((await send()).status).toBe(409);
  expect(fixture.initialize).not.toHaveBeenCalled(); expect(fixture.after).not.toHaveBeenCalled();
});

it("returns the saved job on initialization failure without scheduling a worker", async () => {
  fixture.job = savedJob(); fixture.initialize.mockRejectedValue(new Error("Customer quote exceeds launch cap"));
  const response = await send();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ jobId: requestBody.requestId, replayed: true });
  expect(fixture.frame).not.toHaveBeenCalled(); expect(fixture.after).not.toHaveBeenCalled();
});

it("reports an updated price when the actual quote exceeds the accepted preparation cap", async () => {
  fixture.job = savedJob();
  fixture.validate.mockImplementation(() => { throw new Error("Preparation price changed"); });
  fixture.initialize.mockImplementation(async (input, services) => { services.validate(input.receipt, {}, {}); return { advance: true }; });
  const response = await send();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "STORYBOARD_LAUNCH_REPRICE_REQUIRED", jobId: requestBody.requestId });
  expect(fixture.after).not.toHaveBeenCalled(); expect(fixture.frame).not.toHaveBeenCalled();
});

it("accepts a fresh preparation ticket for the same saved script without repeating planning", async () => {
  fixture.job = savedJob(); fixture.initialize.mockResolvedValue({ advance: true });
  const freshReceipt = { ...receipt, maxCustomerCents: 400 };
  fixture.verify.mockReturnValue(freshReceipt);
  const response = await send({ ...requestBody, storyboardLaunchToken: "new-ticket-for-new-price" });
  expect(response.status).toBe(202);
  expect(fixture.verify).toHaveBeenCalledOnce();
  expect(fixture.update).toHaveBeenCalledWith(requestBody.requestId, { action: "quote" }, "launch-actor");
  expect(fixture.initialize).toHaveBeenCalledWith({ jobId: requestBody.requestId, actorId: "launch-actor", receipt: freshReceipt }, expect.any(Object));
  expect(fixture.frame).not.toHaveBeenCalled(); expect(fixture.after).not.toHaveBeenCalled();
  fixture.after.mockClear(); fixture.verify.mockClear(); fixture.update.mockClear();
  expect((await send({ ...requestBody, storyboardLaunchToken: "new-ticket-for-new-price" })).status).toBe(202);
  expect(fixture.verify).not.toHaveBeenCalled(); expect(fixture.update).not.toHaveBeenCalled();
});

it.each([
  { approved: true }, { renewing: true }, { finished: true }, { review: { stage: "storyboard" } },
  { requests: [{ state: "submitting" }] }, { phase: "images" }, { quote: { scope: "production" } },
])("never replaces a ticket after preparation has advanced: %j", async (state) => {
  fixture.job = savedJob(); fixture.view.mockResolvedValue({ ...(await fixture.view()), ...state });
  expect((await send({ ...requestBody, storyboardLaunchToken: "new-ticket" })).status).toBe(409);
  expect(fixture.verify).not.toHaveBeenCalled(); expect(fixture.initialize).not.toHaveBeenCalled(); expect(fixture.after).not.toHaveBeenCalled();
});

it("destroys the checked-out connection even when releasing the launch lock fails", async () => {
  fixture.job = savedJob(); fixture.unlockFails = true;
  await expect(send()).rejects.toThrow("Lock connection disconnected");
  expect(fixture.release).toHaveBeenCalledWith(expect.any(Error));
  expect(client.listenerCount("error")).toBe(0);
});

it("captures a checked-out connection error and never schedules production after losing the lock", async () => {
  fixture.job = savedJob();
  fixture.initialize.mockImplementation(async () => { client.emit("error", new Error("Launch lock lost")); return { advance: true }; });
  await expect(send()).rejects.toThrow("Launch lock lost");
  expect(fixture.after).not.toHaveBeenCalled();
  expect(fixture.release).toHaveBeenCalledWith(expect.any(Error));
  expect(client.listenerCount("error")).toBe(0);
});

it("retains the analyzed semantic plan and shows its actual image price without scheduling generation",async()=>{
 fixture.job=savedJob();
 Object.assign(fixture.job.params as object,{editorialPlan:{version:"semantic-ideas-v1",beats:[]}});
 fixture.view.mockResolvedValue({quote:{scope:"storyboard"},approved:false,requests:[],phase:"quote"});
 fixture.validate.mockImplementation(()=>{throw new Error("Preparation price changed");});
 fixture.initialize.mockImplementation(async(input,services)=>{services.validate(input.receipt,{},{});return {advance:true};});
 const response=await send();
 expect(response.status).toBe(200);
 expect(await response.json()).toMatchObject({preparationPriceUpdated:true,jobId:requestBody.requestId});
 expect(fixture.frame).not.toHaveBeenCalled();expect(fixture.after).not.toHaveBeenCalled();expect(fixture.worker).not.toHaveBeenCalled();
});

it("persists the semantic director result on the real Start route and reuses it on replay",async()=>{
 const base=resolveParams(requestBody.script,"auto");
 fixture.frame.mockResolvedValue({...base,brain:"mock"});
 const semantic={...base.params,sceneNarrations:[requestBody.script],editorialPlan:{version:"semantic-ideas-v1",beats:[{narration:requestBody.script,idea:"Check before sharing",boundaryReason:"One complete instruction",continuityKey:"source"}]},sceneDirections:{1:{scene:"A source archive"}}};
 fixture.direct.mockResolvedValue(semantic);fixture.prepare.mockResolvedValue({durationSeconds:5});
 const response=await send();expect(response.status).toBe(200);
 expect(fixture.direct).toHaveBeenCalledTimes(1);
 expect(fixture.direct.mock.calls[0][0]).toBe(requestBody.script);
 expect(fixture.prepare.mock.calls[0][1]).toMatchObject({editorialPlan:semantic.editorialPlan,sceneNarrations:semantic.sceneNarrations,sceneDirections:semantic.sceneDirections});
 expect(fixture.job?.params).toMatchObject({editorialPlan:semantic.editorialPlan,sceneNarrations:semantic.sceneNarrations,sceneDirections:semantic.sceneDirections});
 expect((await send()).status).toBe(200);
 expect(fixture.direct).toHaveBeenCalledTimes(1);expect(fixture.frame).toHaveBeenCalledTimes(1);expect(fixture.prepare).toHaveBeenCalledTimes(1);
 expect(fixture.after).not.toHaveBeenCalled();
});

it("single journey (tiers-v2): needs no preparation ticket, analyses once, quotes the complete version and returns ONE estimate without launching",async()=>{
 fixture.pricing={mode:"tiers-v2",multiplier:2,higgsfieldCreditUsd:.1};
 const base=resolveParams(requestBody.script,"auto",{templateSlug:"cam-clay"});
 fixture.frame.mockResolvedValue({...base,brain:"mock"});
 fixture.direct.mockResolvedValue({...base.params,sceneNarrations:[requestBody.script],editorialPlan:{version:"semantic-ideas-v1",beats:[]}});
 fixture.prepare.mockResolvedValue({durationSeconds:5});
 const quote={id:"q".repeat(64),scope:"production",expiresAt:Date.now()+3600_000,caps:{usd:6_000_000,"higgsfield-credit":0},lines:[]};
 fixture.view.mockResolvedValueOnce({quote:null,approved:false,finished:false,renewing:false,review:null,requests:[],phase:"quote"}).mockResolvedValue({quote,approved:false,finished:false,renewing:false,review:null,requests:[],phase:"quote"});
 fixture.customerQuote.mockResolvedValue({id:"c".repeat(64),amountCents:3000,expiresAt:quote.expiresAt});
 const missing={...requestBody,overrides:{templateSlug:"cam-clay"}};delete (missing as Partial<typeof requestBody>).storyboardLaunchToken;
 const response=await send(missing);
 expect(response.status).toBe(200);
 const body=await response.json();
 expect(body).toMatchObject({jobId:requestBody.requestId,journey:"single-v1",approved:false,estimate:{quote:quote.id,customerQuote:"c".repeat(64),amountCents:3000,minutes:15,sceneCount:1,availableCents:10000}});
 expect(fixture.verify).not.toHaveBeenCalled();
 expect(fixture.update).toHaveBeenCalledExactlyOnceWith(requestBody.requestId,{action:"quote"},"launch-actor");
 expect(fixture.customerQuote).toHaveBeenCalledWith(requestBody.requestId,quote,{allowanceUsd:2.5});
 expect(fixture.job?.params).toMatchObject({journey:"single-v1",live:true});
 expect(fixture.initialize).not.toHaveBeenCalled();expect(fixture.worker).not.toHaveBeenCalled();
 // A replay returns the saved estimate without repeating the paid analysis.
 fixture.update.mockClear();
 expect((await send(missing)).status).toBe(200);expect(fixture.frame).toHaveBeenCalledTimes(1);expect(fixture.direct).toHaveBeenCalledTimes(1);expect(fixture.update).not.toHaveBeenCalled();
 // Once approved, a replay simply reopens the film.
 fixture.view.mockResolvedValue({quote,approved:true,finished:false,renewing:false,review:null,requests:[],phase:"images"});
 const reopened=await send(missing);expect(reopened.status).toBe(202);expect(await reopened.json()).toMatchObject({jobId:requestBody.requestId,approved:true});
});

it("single journey: refuses to analyse for a wallet below the lowest tier, with nothing charged",async()=>{
 fixture.pricing={mode:"tiers-v2",multiplier:2,higgsfieldCreditUsd:.1};fixture.available=20;
 const missing={...requestBody};delete (missing as Partial<typeof requestBody>).storyboardLaunchToken;
 const response=await send(missing);expect(response.status).toBe(409);
 expect(await response.json()).toMatchObject({error:expect.stringContaining("$30")});
 expect(fixture.frame).not.toHaveBeenCalled();expect(fixture.update).not.toHaveBeenCalled();
});
