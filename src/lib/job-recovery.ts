import { getActiveRecipe } from "./recipes";
import { isSimulation, providerMode } from "./providers/mode";

/** Only local concept work is retryable. Paid requests need request-ID recovery. */
export function recoveryAllowed(job: { status: string; params: unknown }) {
  const p = job.params as { templateSlug?: string; executionMode?: string };
  return ["confirmed", "running", "failed"].includes(job.status)
    && isSimulation() && p.executionMode === providerMode()
    && Boolean(p.templateSlug && getActiveRecipe(p.templateSlug)?.concept);
}

/** Give a confirmed after() callback time to acquire its worker connection.
 * A lost callback becomes explicitly resumable after this short grace period.
 */
export function recentlyQueued(job: { status: string; confirmedAt: Date | null }, now = Date.now()) {
  const age = job.confirmedAt ? now - job.confirmedAt.getTime() : Infinity;
  return job.status === "confirmed" && age >= 0 && age < 5_000;
}
