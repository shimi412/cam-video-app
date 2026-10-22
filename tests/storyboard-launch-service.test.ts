import { expect, it, vi } from "vitest";
import { initializeStoryboardLaunch, type StoryboardLaunchView } from "../src/lib/concept/storyboard-launch-service";
import type { CamQuote } from "../src/lib/providers/cam-pricing";

const input = { jobId: "storyboard-job", actorId: "workspace-user", receipt: { maximumAmountCents: 200 } };
const quote: CamQuote = {
  id: "a".repeat(64), plan: "b".repeat(64), scope: "storyboard", createdAt: 100, expiresAt: 2000,
  lines: [{ id: "scene-1-start", model: "image-model", kind: "image", unit: "usd", quantity: 1, unitPrice: .15, maximum: 150_000, description: "Storyboard image" }],
  caps: { usd: 150_000, "higgsfield-credit": 0 }, falBillingAvailable: false,
};
const customer = { id: "c".repeat(64), amountCents: 100, expiresAt: 2000 };
const view = (change: Partial<StoryboardLaunchView> = {}): StoryboardLaunchView => ({ quote, approved: false, renewing: false, finished: false, review: null, ...change });
function fixture(initial = view()) {
  return {
    view: vi.fn(async () => initial),
    quote: vi.fn(async () => undefined),
    customerQuote: vi.fn(async () => customer as typeof customer | null),
    validate: vi.fn(),
    approve: vi.fn(async () => ({ advance: true })),
    now: () => 1000,
  };
}

it("checks the actual image and customer quote against the Start receipt before authorizing generation", async () => {
  const services = fixture();
  services.view.mockResolvedValueOnce(view({ quote: null })).mockResolvedValueOnce(view());
  expect(await initializeStoryboardLaunch(input, services)).toEqual({ advance: true });
  expect(services.quote).toHaveBeenCalledExactlyOnceWith(input.jobId, input.actorId);
  expect(services.customerQuote).toHaveBeenCalledExactlyOnceWith(input.jobId, quote);
  expect(services.validate).toHaveBeenCalledExactlyOnceWith(input.receipt, quote, customer);
  expect(services.approve).toHaveBeenCalledExactlyOnceWith(input.jobId, { quote: quote.id, customerQuote: customer.id }, input.actorId);
  expect(services.validate.mock.invocationCallOrder[0]).toBeLessThan(services.approve.mock.invocationCallOrder[0]);
});

it("reuses an unexpired image quote rather than re-pricing on repeated setup", async () => {
  const services = fixture();
  await initializeStoryboardLaunch(input, services);
  expect(services.quote).not.toHaveBeenCalled();
  expect(services.validate).toHaveBeenCalledOnce();
  expect(services.approve).toHaveBeenCalledOnce();
});

it("refreshes an expired image quote and validates the replacement before approval", async () => {
  const services = fixture(view({ quote: { ...quote, expiresAt: 999 } }));
  const replacement = { ...quote, id: "d".repeat(64) };
  services.view.mockResolvedValueOnce(view({ quote: { ...quote, expiresAt: 999 } })).mockResolvedValueOnce(view({ quote: replacement }));
  await initializeStoryboardLaunch(input, services);
  expect(services.quote).toHaveBeenCalledOnce();
  expect(services.validate).toHaveBeenCalledWith(input.receipt, replacement, customer);
  expect(services.approve).toHaveBeenCalledWith(input.jobId, { quote: replacement.id, customerQuote: customer.id }, input.actorId);
});

it.each([
  { label: "a storyboard review", state: { review: { stage: "storyboard" } } },
  { label: "a later draft review", state: { review: { stage: "draft" }, approved: true } },
  { label: "a pending budget", state: { renewing: true } },
  { label: "a completed video", state: { finished: true } },
])("never crosses $label when Start is replayed", async ({ state }) => {
  const services = fixture(view(state));
  expect(await initializeStoryboardLaunch(input, services)).toEqual({ advance: false });
  expect(services.quote).not.toHaveBeenCalled();
  expect(services.customerQuote).not.toHaveBeenCalled();
  expect(services.validate).not.toHaveBeenCalled();
  expect(services.approve).not.toHaveBeenCalled();
});

it("resumes only an already approved image stage without renewing or approving another budget", async () => {
  const services = fixture(view({ approved: true }));
  expect(await initializeStoryboardLaunch(input, services)).toEqual({ advance: true });
  expect(services.quote).not.toHaveBeenCalled();
  expect(services.customerQuote).not.toHaveBeenCalled();
  expect(services.validate).not.toHaveBeenCalled();
  expect(services.approve).not.toHaveBeenCalled();
  services.view.mockResolvedValue(view({ approved: true, quote: { ...quote, scope: "production" } }));
  expect(await initializeStoryboardLaunch(input, services)).toEqual({ advance: false });
  expect(services.approve).not.toHaveBeenCalled();
});

it("cannot approve a video quote with the image-only Start authorization", async () => {
  const services = fixture(view({ quote: { ...quote, scope: "production" } }));
  await expect(initializeStoryboardLaunch(input, services)).rejects.toThrow("only authorizes storyboard images");
  expect(services.quote).not.toHaveBeenCalled();
  expect(services.customerQuote).not.toHaveBeenCalled();
  expect(services.approve).not.toHaveBeenCalled();
});

it("stops if the scene price exceeds the disclosed cap, without approving or retrying", async () => {
  const services = fixture();
  services.validate.mockImplementation(() => { throw new Error("The Start price ceiling was exceeded"); });
  await expect(initializeStoryboardLaunch(input, services)).rejects.toThrow("price ceiling");
  expect(services.validate).toHaveBeenCalledOnce();
  expect(services.approve).not.toHaveBeenCalled();
  expect(services.quote).not.toHaveBeenCalled();
});

it("does not approve when customer pricing is unavailable", async () => {
  const services = fixture();
  services.customerQuote.mockResolvedValue(null);
  await expect(initializeStoryboardLaunch(input, services)).rejects.toThrow("pricing is unavailable");
  expect(services.validate).not.toHaveBeenCalled();
  expect(services.approve).not.toHaveBeenCalled();
});

it("rechecks a review or pending state saved while the first quote was prepared", async () => {
  const services = fixture();
  services.view.mockResolvedValueOnce(view({ quote: null })).mockResolvedValueOnce(view({ review: { stage: "storyboard" } }));
  expect(await initializeStoryboardLaunch(input, services)).toEqual({ advance: false });
  expect(services.quote).toHaveBeenCalledOnce();
  expect(services.customerQuote).not.toHaveBeenCalled();
  expect(services.approve).not.toHaveBeenCalled();
});

it("propagates a refused wallet reservation without retrying approval", async () => {
  const services = fixture();
  services.approve.mockRejectedValue(new Error("Insufficient balance"));
  await expect(initializeStoryboardLaunch(input, services)).rejects.toThrow("Insufficient balance");
  expect(services.approve).toHaveBeenCalledOnce();
});
