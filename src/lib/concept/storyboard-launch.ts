import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { resolveParams } from "../brain";
import { getActiveRecipe } from "../recipes";
import { customerPriceCents, type CustomerPricingPolicy } from "../customer-price";
import { providerFetch } from "../providers/network";
import { IMAGE_ENDPOINT } from "./generation-plan";
import { prepareStoryboardDirections } from "./direction";
import { planConcept } from "./storyboard";
import type { CamQuote } from "../providers/cam-pricing";

const LIFETIME = 3600_000;
const FAILURE = "The preparation price changed or expired. Review the current preparation price before starting.";
const micros = (value: number) => Math.ceil(Number((value * 1e6).toPrecision(12)));

/** Only production-affecting inputs are signed. Titles and request IDs stay editable. */
export const StoryboardLaunchInputSchema = z.object({
  script: z.string().min(40).max(6000),
  mode: z.enum(["auto", "manual"]),
  previewSource: z.enum(["planning", "existing"]).default("planning"),
  overrides: z.object({
    templateSlug: z.string().optional(), tone: z.enum(["serious", "energetic", "calm"]).optional(),
    tier: z.enum(["standard", "premium"]).optional(), voiceId: z.string().optional(),
    aspectRatio: z.enum(["9:16", "16:9", "1:1"]).optional(),
  }).optional(),
});
export type StoryboardLaunchInput = z.input<typeof StoryboardLaunchInputSchema>;
const ReceiptSchema = z.object({
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]), actorId: z.string().min(1).max(200), inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  sceneCount: z.number().int().min(1).max(36), imageCountCap: z.number().int().min(0).max(72),
  imageOperations: z.array(z.string().regex(/^scene-[1-9]\d*-(start|end)$/)).max(72).optional(),
  maxSupplierUsdMicros: z.number().int().nonnegative().safe(),
  maxCustomerCents: z.number().int().nonnegative().max(1_000_000),
  createdAt: z.number().int().nonnegative().safe(), expiresAt: z.number().int().positive().safe(),
}).strict().refine(r => r.imageCountCap <= r.sceneCount * 2 && r.maxCustomerCents % 100 === 0
  && r.expiresAt - r.createdAt === LIFETIME
  && (r.version === 1 || (r.imageOperations?.length === r.imageCountCap
    && new Set(r.imageOperations).size === r.imageCountCap
    && r.imageOperations.every(id => Number(id.split("-")[1]) <= r.sceneCount
      && (!id.endsWith("-end") || r.imageOperations!.includes(id.replace(/-end$/, "-start")))))));
export type StoryboardLaunchReceipt = z.infer<typeof ReceiptSchema>;
type SignatureOptions = { secret?: string; now?: number };
export type StoryboardLaunchOptions = SignatureOptions & {
  readImageUnitPrice?: () => Promise<number>;
  readCustomerMultiplier?: () => Promise<number>;
  readCustomerPricing?: () => Promise<CustomerPricingPolicy>;
};

function signingSecret(override?: string) {
  // The connected launcher injects the private runtime AUTH_SECRET. Never mint a fallback key.
  const secret = override ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("The workspace signing key is unavailable. Contact your administrator.");
  return secret;
}
function inputHash(input: StoryboardLaunchInput) {
  const value = StoryboardLaunchInputSchema.parse(input);
  // Schema order is stable and omitted/empty overrides mean the same production.
  return createHash("sha256").update(JSON.stringify({ ...value, overrides: value.overrides ?? {} })).digest("hex");
}
function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(`cam-storyboard-launch:v1:${payload}`).digest();
}
function validTime(receipt: StoryboardLaunchReceipt, now: number) {
  if (receipt.createdAt > now || receipt.expiresAt <= now) throw new Error(FAILURE);
}

/** Reads only the current image tariff; it cannot submit a generation or connect a voice provider. */
async function readImageUnitPrice() {
  const { assertCamConfigured } = await import("../providers/live-policy");
  assertCamConfigured();
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("The image connection is unavailable. Contact your administrator.");
  const response = await providerFetch(`https://api.fal.ai/v1/models/pricing?endpoint_id=${encodeURIComponent(IMAGE_ENDPOINT)}`, {
    method: "GET", redirect: "error", cache: "no-store", headers: { Authorization: `Key ${key}` },
  });
  if (!response.ok) throw new Error("The preparation price is temporarily unavailable. Please try again.");
  const data = z.object({ prices: z.array(z.object({ endpoint_id: z.string(), unit_price: z.number().finite().nonnegative(), unit: z.string(), currency: z.string() })) }).parse(await response.json());
  const rows = data.prices.filter(row => row.endpoint_id === IMAGE_ENDPOINT);
  if (rows.length !== 1 || rows[0].unit !== "images" || rows[0].currency !== "USD") throw new Error("The preparation price could not be verified. Please contact support.");
  return rows[0].unit_price;
}
async function readCustomerPricing() {
  const [{ pool }, { CustomerPricingSchema }] = await Promise.all([import("@/db"), import("../customer-wallet")]);
  const parsed = CustomerPricingSchema.safeParse((await pool.query("SELECT value FROM settings WHERE key='customer_pricing'")).rows[0]?.value);
  if (!parsed.success) throw new Error("CAM pricing is not configured. Contact your administrator.");
  return parsed.data;
}

/** Provisional image allowance plus read-only prices. The semantic director
 * selects the actual breakdown only after Start, independent of this estimate. */
export async function createStoryboardLaunch(input: StoryboardLaunchInput, actorId: string, options: StoryboardLaunchOptions = {}) {
  const parsed = StoryboardLaunchInputSchema.parse(input);
  const secret = signingSecret(options.secret), now = options.now ?? Date.now();
  z.string().min(1).max(200).parse(actorId);
  const { params } = resolveParams(parsed.script, parsed.mode, parsed.overrides);
  const recipe = getActiveRecipe(params.templateSlug);
  if (!recipe?.concept) throw new Error("This video format is not available for storyboard preparation.");
  const board = (params.sceneNarrations?.length??0)>36
    ? {shots:Object.values(prepareStoryboardDirections(params.sceneNarrations!.slice(0,36))).map((direction,i)=>({index:i+1,endImagePrompt:direction.endScene}))}
    : planConcept(parsed.script, recipe, params.aspectRatio, {}, params.sceneNarrations);
  const sceneCount = board.shots.length;
  const imported = parsed.previewSource === "existing";
  // This provisional allowance does not bind narrative boundaries. Version 3
  // caps the total images and money; actual semantic plans may use different
  // scene indices/endpoints. Over-budget plans require a new explicit approval.
  const imageOperations = imported ? [] : board.shots.flatMap(shot => [
    `scene-${shot.index}-start`, ...(shot.endImagePrompt ? [`scene-${shot.index}-end`] : []),
  ]);
  const imageCountCap = imageOperations.length;
  const [unitPrice, pricing] = await Promise.all([
    imported ? Promise.resolve(0) : (options.readImageUnitPrice ?? readImageUnitPrice)(),
    options.readCustomerPricing ? options.readCustomerPricing() : options.readCustomerMultiplier ? options.readCustomerMultiplier().then(multiplier => ({mode:"fixed" as const,multiplier})) : readCustomerPricing(),
  ]);
  z.number().finite().nonnegative().parse(unitPrice);
  z.number().finite().min(1).max(100).parse(pricing.multiplier);
  const unitMicros = micros(unitPrice), maxSupplierUsdMicros = unitMicros * imageCountCap;
  const maximumAmountCents = customerPriceCents(maxSupplierUsdMicros / 1e6, pricing);
  const estimatedAmountCents = maximumAmountCents;
  const receipt = ReceiptSchema.parse({ version: 3, actorId, inputHash: inputHash(parsed), sceneCount, imageCountCap, imageOperations,
    maxSupplierUsdMicros, maxCustomerCents: maximumAmountCents, createdAt: now, expiresAt: now + LIFETIME });
  const payload = Buffer.from(JSON.stringify(receipt)).toString("base64url");
  return { token: `${payload}.${signature(payload, secret).toString("base64url")}`, estimatedAmountCents,
    maximumAmountCents, sceneCount, imageCount: imageCountCap, expiresAt: receipt.expiresAt };
}

/** Call before any paid framing/direction request. No database or provider access. */
export function verifyStoryboardLaunch(token: string, input: StoryboardLaunchInput, actorId: string, options: SignatureOptions = {}): StoryboardLaunchReceipt {
  const secret = signingSecret(options.secret);
  try {
    if (typeof token !== "string" || token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) throw new Error(FAILURE);
    const [payload, signed] = token.split(".");
    const actual = Buffer.from(signed, "base64url"), expected = signature(payload, secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error(FAILURE);
    const receipt = ReceiptSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    validTime(receipt, options.now ?? Date.now());
    // Refresh preflight notices still open from the former blanket ceiling.
    // Already accepted receipts are resumed from server storage, not re-signed here.
    if (receipt.version !== 3) throw new Error(FAILURE);
    if (receipt.actorId !== actorId || receipt.inputHash !== inputHash(input)) throw new Error(FAILURE);
    return receipt;
  } catch { throw new Error(FAILURE); }
}

/** New launches authorize only the planned images. Keep accepted legacy receipts
 * readable so a deployment cannot interrupt an already-started production. */
export function assertStoryboardLaunchQuote(receipt: StoryboardLaunchReceipt, quote: CamQuote, customerQuote: { amountCents: number; expiresAt?: number } | null, options: { acceptedAt?: number } = {}) {
  const now = Date.now();
  ReceiptSchema.parse(receipt);
  // Replays use the acceptance timestamp stored by the authenticated controller,
  // never a timestamp supplied by the browser. New quotes still must be current.
  const acceptedAt = options.acceptedAt ?? now;
  if (!Number.isSafeInteger(acceptedAt) || acceptedAt > now) throw new Error(FAILURE);
  validTime(receipt, acceptedAt);
  const ids = new Set(quote.lines.map(line => line.id));
  if (quote.scope !== "storyboard" || quote.expiresAt <= now || quote.caps["higgsfield-credit"] !== 0
    || !Number.isSafeInteger(quote.caps.usd) || quote.caps.usd < 0 || quote.caps.usd > receipt.maxSupplierUsdMicros
    || quote.lines.length > receipt.imageCountCap || ids.size !== quote.lines.length
    || (receipt.version === 2 && quote.lines.some(line => !receipt.imageOperations!.includes(line.id)))
    || quote.lines.some(line => {
      if (receipt.version === 3 && /^cast-[a-f0-9]{16}-[1-4]$/.test(line.id)) return false;
      const match = /^scene-([1-9]\d*)-(start|end)$/.exec(line.id);
      return !match || Number(match[1]) > (receipt.version===3?36:receipt.sceneCount) || (match[2] === "end" && !ids.has(`scene-${match[1]}-start`));
    })
    || quote.lines.some(line => line.kind !== "image" || line.model !== IMAGE_ENDPOINT || line.unit !== "usd" || line.quantity !== 1
      || !Number.isFinite(line.unitPrice) || line.unitPrice < 0 || !Number.isSafeInteger(line.maximum) || line.maximum !== micros(line.unitPrice))
    || quote.lines.reduce((sum, line) => sum + line.maximum, 0) !== quote.caps.usd
    || !customerQuote || !Number.isSafeInteger(customerQuote.amountCents) || customerQuote.amountCents < 0
    || customerQuote.amountCents % 100 !== 0 || customerQuote.amountCents > receipt.maxCustomerCents
    || (customerQuote.expiresAt !== undefined && customerQuote.expiresAt <= now)) throw new Error(FAILURE);
}
