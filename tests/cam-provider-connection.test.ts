import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), live: vi.fn(), configured: vi.fn(), fetch: vi.fn(), client: vi.fn(),
}));
vi.mock("../src/lib/providers/higgsfield-auth", () => ({ higgsfieldAccessToken: mocks.token }));
vi.mock("../src/lib/providers/network", async importOriginal => ({ ...await importOriginal<typeof import("../src/lib/providers/network")>(), providerFetch: mocks.fetch }));
vi.mock("../src/lib/providers/live-policy", () => ({ assertCamConfigured: mocks.configured }));
vi.mock("../src/lib/concept/provider-transports", () => ({ assertCamLiveExecution: mocks.live }));
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({ Client: mocks.client }));
import { connectCamProviders } from "../src/lib/providers/cam";
import { IMAGE_ENDPOINT } from "../src/lib/concept/generation-plan";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FAL_KEY", "test-only-no-real-provider");
  mocks.token.mockRejectedValue(new Error("Voice connection unavailable"));
  mocks.fetch.mockImplementation(async () => Response.json({ prices: [] }));
});
afterEach(() => vi.unstubAllEnvs());

it("reads storyboard prices with no voice credentials or MCP connection", async () => {
  const providers = await connectCamProviders("quote", { imagesOnly: true });
  expect(mocks.configured).toHaveBeenCalledOnce();
  expect(mocks.token).not.toHaveBeenCalled();
  expect(mocks.client).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
  await providers.fal(`https://api.fal.ai/v1/models/pricing?endpoint_id=${encodeURIComponent(IMAGE_ENDPOINT)}`, { method: "GET" });
  expect(mocks.fetch).toHaveBeenCalledOnce();
  expect(mocks.configured).toHaveBeenCalledTimes(2);
  await expect(providers.higgsfield("generate_audio", { params: { get_cost: true } })).rejects.toThrow("only supports images");
  await providers.close();
});

it("keeps generation forbidden on the read-only storyboard connection", async () => {
  const providers = await connectCamProviders("quote", { imagesOnly: true });
  await expect(providers.fal(`https://queue.fal.run/${IMAGE_ENDPOINT}`, { method: "POST" })).rejects.toThrow("Unexpected fal URL");
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("isolates authenticated image execution from animation and voice connections", async () => {
  const providers = await connectCamProviders("generation", { imagesOnly: true });
  expect(mocks.live).toHaveBeenCalledOnce();
  await providers.fal(`https://queue.fal.run/${IMAGE_ENDPOINT}`, { method: "POST", body: "{}" });
  await providers.fal("https://queue.fal.run/fal-ai/nano-banana-pro/requests/saved/status", { method: "GET" });
  expect(mocks.live).toHaveBeenCalledTimes(3);
  expect(mocks.token).not.toHaveBeenCalled();
  expect(mocks.client).not.toHaveBeenCalled();
  await expect(providers.fal("https://queue.fal.run/fal-ai/kling-video/v3/pro/image-to-video", { method: "POST" })).rejects.toThrow("only supports images");
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
});

it("classifies a rejected completed GET without treating a failed submission as safe to retry",async()=>{
 mocks.fetch.mockImplementation(async()=>Response.json({detail:[{type:"content_policy_violation",msg:"Private provider body"}]},{status:422}));
 const providers=await connectCamProviders("generation",{imagesOnly:true});
 expect(await providers.fal("https://queue.fal.run/fal-ai/nano-banana-pro/requests/saved",{method:"GET"})).toEqual({error:"content_policy_violation"});
 await expect(providers.fal(`https://queue.fal.run/${IMAGE_ENDPOINT}`,{method:"POST",body:"{}"})).rejects.toThrow("HTTP 422");
 await expect(providers.fal("https://queue.fal.run/fal-ai/nano-banana-pro/requests/saved/status",{method:"GET"})).rejects.toThrow("HTTP 422");
});
