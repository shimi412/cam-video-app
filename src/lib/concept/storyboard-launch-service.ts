import type { CamQuote } from "../providers/cam-pricing";

type CustomerQuote = { id: string; amountCents: number; expiresAt: number };
export type StoryboardLaunchView = {
  quote: CamQuote | null;
  approved: boolean;
  renewing: boolean;
  finished: boolean;
  review: unknown | null;
};
export type StoryboardLaunchServices<Receipt> = {
  view: (jobId: string) => Promise<StoryboardLaunchView>;
  quote: (jobId: string, actorId: string) => Promise<unknown>;
  customerQuote: (jobId: string, quote: CamQuote) => Promise<CustomerQuote | null>;
  approve: (jobId: string, quote: { quote: string; customerQuote: string }, actorId: string) => Promise<{ advance: boolean }>;
  validate: (receipt: Receipt, quote: CamQuote, customerQuote: CustomerQuote) => void;
  now?: () => number;
};

/** Called only by the authenticated Start POST, under its request-id lock.
 * A reload cannot create this authorization. Replays may finish initial setup,
 * but cannot cross a saved human review or approve a later production quote. */
export async function initializeStoryboardLaunch<Receipt>(
  input: { jobId: string; actorId: string; receipt: Receipt },
  services: StoryboardLaunchServices<Receipt>,
): Promise<{ advance: boolean }> {
  const { jobId, actorId, receipt } = input;
  let view = await services.view(jobId);
  const stopped = (state: StoryboardLaunchView) => state.finished || state.renewing || Boolean(state.review);
  if (stopped(view)) return { advance: false };
  if (view.approved) return { advance: view.quote?.scope === "storyboard" };
  if (view.quote && view.quote.scope !== "storyboard") throw new Error("This Start action only authorizes storyboard images.");
  if (!view.quote || view.quote.expiresAt <= (services.now?.() ?? Date.now())) {
    await services.quote(jobId, actorId);
    view = await services.view(jobId);
  }
  if (stopped(view)) return { advance: false };
  if (view.approved) return { advance: view.quote?.scope === "storyboard" };
  const quote = view.quote;
  if (!quote || quote.scope !== "storyboard") throw new Error("The storyboard preparation price is unavailable. Your script is saved.");
  const customerQuote = await services.customerQuote(jobId, quote);
  if (!customerQuote) throw new Error("Storyboard preparation pricing is unavailable. Your script is saved.");
  services.validate(receipt, quote, customerQuote);
  return services.approve(jobId, { quote: quote.id, customerQuote: customerQuote.id }, actorId);
}
