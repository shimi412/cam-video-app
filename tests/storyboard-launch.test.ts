import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createStoryboardLaunch, verifyStoryboardLaunch, assertStoryboardLaunchQuote, type StoryboardLaunchInput, type StoryboardLaunchReceipt } from "../src/lib/concept/storyboard-launch";
import { IMAGE_ENDPOINT } from "../src/lib/concept/generation-plan";
import type { CamQuote } from "../src/lib/providers/cam-pricing";
import eyal from "../src/lib/concept/eyal-phrases.json";

const NOW = 1_800_000_000_000;
const secret = "offline-test-signing-key-at-least-32-characters";
const actor = "workspace-user";
const input: StoryboardLaunchInput = {
  script: "Check the original source before sharing a claim.\nRead the full passage before making a decision.\nLook at the context surrounding the statement.\nShare the complete information with your audience.",
  mode: "auto", overrides: { aspectRatio: "9:16" },
};
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in launch authorization tests"); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.useRealTimers(); vi.unstubAllGlobals();
});
async function preflight(source = input) {
  const readImageUnitPrice = vi.fn(async () => .15), readCustomerMultiplier = vi.fn(async () => 1.5);
  const result = await createStoryboardLaunch(source, actor, { secret, now: NOW, readImageUnitPrice, readCustomerMultiplier });
  return { ...result, readImageUnitPrice, readCustomerMultiplier,
    receipt: verifyStoryboardLaunch(result.token, source, actor, { secret, now: NOW }) };
}
function imageQuote(count = 2): CamQuote {
  const lines = Array.from({ length: count }, (_, i) => ({ id: `scene-${i + 1}-start`, model: IMAGE_ENDPOINT, kind: "image" as const,
    unit: "usd" as const, quantity: 1, unitPrice: .15, maximum: 150_000, description: "Storyboard image" }));
  return { id: "a".repeat(64), plan: "b".repeat(64), scope: "storyboard", createdAt: NOW, expiresAt: NOW + 3600_000,
    lines, caps: { usd: count * 150_000, "higgsfield-credit": 0 }, falBillingAvailable: false };
}
const customerQuote = (amountCents = 100) => ({ amountCents, expiresAt: NOW + 3600_000 });

it("prices the planned starting images without doubling them", async () => {
  const launch = await preflight();
  expect(launch.sceneCount).toBe(4);
  expect(launch.estimatedAmountCents).toBe(100);
  expect(launch.maximumAmountCents).toBe(100);
  expect(launch.receipt).toMatchObject({ actorId: actor, sceneCount: 4, version: 3, imageCountCap: 4, maxSupplierUsdMicros: 600_000, maxCustomerCents: 100 });
  expect(launch.readImageUnitPrice).toHaveBeenCalledOnce();
  expect(launch.readCustomerMultiplier).toHaveBeenCalledOnce();
});

it("accepts the same production options regardless of object key order", async () => {
  const launch = await preflight();
  expect(verifyStoryboardLaunch(launch.token, { overrides: { aspectRatio: "9:16" }, mode: "auto", script: input.script }, actor, { secret, now: NOW })).toEqual(launch.receipt);
});

it("prices eleven planned images at $1.65 supplier and $4 customer, never $7", async () => {
  const source = { ...input, script: Array.from({length:11},(_,i)=>`This is statement number ${i+1} for the audience.`).join("\n") };
  const launch = await createStoryboardLaunch(source, actor, { secret, now: NOW, readImageUnitPrice: async()=>.15, readCustomerMultiplier:async()=>2 });
  const receipt = verifyStoryboardLaunch(launch.token,source,actor,{secret,now:NOW});
  expect(launch).toMatchObject({sceneCount:11,imageCount:11,maximumAmountCents:400,estimatedAmountCents:400});
  expect(receipt.maxSupplierUsdMicros).toBe(1_650_000);
});

it("includes an end image only for the actual planned transformation", async () => {
  const launch = await preflight({...input,script:eyal.join("\n")});
  expect(launch.sceneCount).toBe(14);
  expect(launch.imageCount).toBe(15);
  expect(launch.receipt.imageOperations?.filter(id=>id.endsWith("-end"))).toEqual(["scene-13-end"]);
});

it("lets semantic planning choose endpoints within the total allowance, retaining strict legacy manifests", async () => {
  const launch = await preflight(), quote=imageQuote(4);
  quote.lines[3].id="scene-1-end";
  expect(()=>assertStoryboardLaunchQuote({...launch.receipt,version:2},quote,customerQuote())).toThrow();
  expect(()=>assertStoryboardLaunchQuote(launch.receipt,quote,customerQuote())).not.toThrow();
});

it("keeps already accepted legacy receipts readable without granting more images to new launches", async () => {
  const {receipt}=await preflight();
  const legacy={...receipt,version:1 as const,imageOperations:undefined,imageCountCap:8,maxSupplierUsdMicros:1_200_000,maxCustomerCents:200};
  const quote=imageQuote(4);quote.lines[3].id="scene-1-end";
  expect(()=>assertStoryboardLaunchQuote(legacy,quote,customerQuote())).not.toThrow();
});

it.each([
  { label: "the script", changed: { ...input, script: `${input.script} A changed conclusion.` } },
  { label: "the format", changed: { ...input, overrides: { aspectRatio: "16:9" as const } } },
  { label: "the mode", changed: { ...input, mode: "manual" as const } },
  { label: "the source", changed: { ...input, previewSource: "existing" as const } },
])("rejects a launch receipt after changing $label", async ({ changed }) => {
  const launch = await preflight();
  expect(() => verifyStoryboardLaunch(launch.token, changed, actor, { secret, now: NOW })).toThrow(/changed or expired/);
});

it("rejects another user, another signing key, tampering, and malformed tokens", async () => {
  const launch = await preflight();
  expect(() => verifyStoryboardLaunch(launch.token, input, "another-user", { secret, now: NOW })).toThrow();
  expect(() => verifyStoryboardLaunch(launch.token, input, actor, { secret: "different-offline-signing-key-32-characters", now: NOW })).toThrow();
  const [payload, signature] = launch.token.split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), maxCustomerCents: 99900 })).toString("base64url");
  for (const token of [`${forged}.${signature}`, "invalid", "a".repeat(5000)])
    expect(() => verifyStoryboardLaunch(token, input, actor, { secret, now: NOW })).toThrow(/changed or expired/);
});

it("rejects future and expired receipts, including the exact expiry boundary", async () => {
  const launch = await preflight();
  expect(() => verifyStoryboardLaunch(launch.token, input, actor, { secret, now: NOW - 1 })).toThrow();
  expect(() => verifyStoryboardLaunch(launch.token, input, actor, { secret, now: launch.expiresAt })).toThrow();
  expect(() => verifyStoryboardLaunch(launch.token, input, actor, { secret, now: launch.expiresAt - 1 })).not.toThrow();
});

it("quotes existing media at zero without looking up or purchasing any image", async () => {
  const launch = await preflight({ ...input, previewSource: "existing" });
  expect(launch.maximumAmountCents).toBe(0);
  expect(launch.receipt.imageCountCap).toBe(0);
  expect(launch.readImageUnitPrice).not.toHaveBeenCalled();
  expect(() => assertStoryboardLaunchQuote(launch.receipt, imageQuote(0), customerQuote(0))).not.toThrow();
  expect(() => assertStoryboardLaunchQuote(launch.receipt, imageQuote(1), customerQuote(0))).toThrow();
});

it("accepts the actual directed image budget up to both disclosed ceilings", async () => {
  const launch = await preflight();
  expect(() => assertStoryboardLaunchQuote(launch.receipt, imageQuote(), customerQuote())).not.toThrow();
  expect(() => assertStoryboardLaunchQuote(launch.receipt, imageQuote(4), customerQuote(100))).not.toThrow();
});

const invalidImages: { label: string; change: (quote: CamQuote) => void }[] = [
  { label: "a video-budget scope", change: quote => { quote.scope = "production"; } },
  { label: "a voice operation", change: quote => { quote.lines[0].kind = "voice"; } },
  { label: "a video operation", change: quote => { quote.lines[0].kind = "video"; } },
  { label: "another image model", change: quote => { quote.lines[0].model = "unapproved-image-model"; } },
  { label: "provider-credit charges", change: quote => { quote.caps["higgsfield-credit"] = 1; } },
  { label: "provider-credit lines", change: quote => { quote.lines[0].unit = "higgsfield-credit"; } },
  { label: "hidden extra image quantity", change: quote => { quote.lines[0].quantity = 2; } },
  { label: "duplicate operations", change: quote => { quote.lines[1].id = quote.lines[0].id; } },
  { label: "an out-of-range scene", change: quote => { quote.lines[0].id = "scene-37-start"; } },
  { label: "an unapproved image retry", change: quote => { quote.lines[0].id = "scene-1-start-retry-1"; } },
  { label: "an end frame without its start frame", change: quote => { quote.lines[0].id = "scene-1-end"; } },
  { label: "underreported total", change: quote => { quote.caps.usd -= 1; } },
  { label: "underreported line cost", change: quote => { quote.lines[0].unitPrice = .16; } },
  { label: "an expired image quote", change: quote => { quote.expiresAt = NOW; } },
];
it.each(invalidImages)("rejects $label before image generation", async ({ change }) => {
  const launch = await preflight(), quote = imageQuote(); change(quote);
  expect(() => assertStoryboardLaunchQuote(launch.receipt, quote, customerQuote())).toThrow();
});

it("rejects extra images and a supplier price rise above the accepted maximum", async () => {
  const launch = await preflight();
  expect(() => assertStoryboardLaunchQuote(launch.receipt, imageQuote(5), customerQuote(100))).toThrow();
  const quote = imageQuote(4);
  quote.lines.forEach(line => { line.unitPrice = .16; line.maximum = 160_000; }); quote.caps.usd = 640_000;
  expect(() => assertStoryboardLaunchQuote(launch.receipt, quote, customerQuote(100))).toThrow();
});

it.each([300, -100, 150, NaN])("rejects the invalid or excessive customer amount %s", async amount => {
  const launch = await preflight();
  expect(() => assertStoryboardLaunchQuote(launch.receipt, imageQuote(), customerQuote(amount))).toThrow();
});

it("requires a current customer price and a still-valid launch authorization", async () => {
  const launch = await preflight();
  expect(() => assertStoryboardLaunchQuote(launch.receipt, imageQuote(), null)).toThrow();
  expect(() => assertStoryboardLaunchQuote(launch.receipt, imageQuote(), { amountCents: 100, expiresAt: NOW })).toThrow();
  vi.setSystemTime(launch.expiresAt);
  expect(() => assertStoryboardLaunchQuote(launch.receipt, { ...imageQuote(), expiresAt: launch.expiresAt + 1000 }, { amountCents: 100, expiresAt: launch.expiresAt + 1000 })).toThrow();
});

it("fails closed when a receipt does not match its planned image manifest", async () => {
  const launch = await preflight();
  const invalid = { ...launch.receipt, imageCountCap: 9 } as StoryboardLaunchReceipt;
  expect(() => assertStoryboardLaunchQuote(invalid, imageQuote(), customerQuote())).toThrow();
});

it("can finish setup after a disconnect using the server-saved acceptance time and a current image quote", async () => {
  const launch = await preflight();
  const acceptedAt = NOW + 1000;
  const later = NOW + 4 * 3600_000;
  vi.setSystemTime(later);
  const quote = { ...imageQuote(), createdAt: later, expiresAt: later + 3600_000 };
  const customer = { amountCents: 100, expiresAt: quote.expiresAt };
  expect(() => assertStoryboardLaunchQuote(launch.receipt, quote, customer, { acceptedAt })).not.toThrow();
  expect(() => assertStoryboardLaunchQuote(launch.receipt, quote, customer, { acceptedAt: launch.expiresAt })).toThrow();
  expect(() => assertStoryboardLaunchQuote(launch.receipt, quote, customer, { acceptedAt: later + 1 })).toThrow();
});

it("never extends an expired image or customer quote through a saved Start acceptance", async () => {
  const launch = await preflight();
  vi.setSystemTime(launch.expiresAt + 1000);
  expect(() => assertStoryboardLaunchQuote(launch.receipt, imageQuote(), customerQuote(), { acceptedAt: NOW })).toThrow();
  const current = { ...imageQuote(), expiresAt: launch.expiresAt + 3600_000 };
  expect(() => assertStoryboardLaunchQuote(launch.receipt, current, customerQuote(), { acceptedAt: NOW })).toThrow();
});

it("includes internal character sheets inside the accepted semantic image allowance",async()=>{
 const {receipt}=await preflight();const quote=imageQuote(2);
 quote.lines[0].id="cast-0123456789abcdef-1";
 expect(()=>assertStoryboardLaunchQuote(receipt,quote,customerQuote())).not.toThrow();
 // Extra sheets are never a way to exceed the disclosed price or image count.
 expect(()=>assertStoryboardLaunchQuote({...receipt,maxSupplierUsdMicros:150000},quote,customerQuote())).toThrow();
 expect(()=>assertStoryboardLaunchQuote({...receipt,version:2},quote,customerQuote())).toThrow();
});

it("uses the same adaptive curve for the disclosed preparation allowance",async()=>{
 const launch=await createStoryboardLaunch(input,actor,{secret,now:NOW,readImageUnitPrice:async()=>5,readCustomerPricing:async()=>({mode:"adaptive-v1",multiplier:2})});
 expect(launch.maximumAmountCents).toBe(3500);
 expect(verifyStoryboardLaunch(launch.token,input,actor,{secret,now:NOW}).maxCustomerCents).toBe(3500);
});
