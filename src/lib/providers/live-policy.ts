import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import { providerMode } from "./mode";

const execution = new AsyncLocalStorage<{ jobId: string }>();
export function assertCamConfigured() {
  if (providerMode() !== "fal" || process.env.CAM_RELEASE === "preview" || process.env.CAM_LIVE_ENABLED !== "1" || process.env.CAM_AUTH_MODE !== "required") {
    throw new Error("CAM paid generation is disabled in this workspace. Use the connected CAM Studio.");
  }
}
export function assertAuthorizedExecution() {
  assertCamConfigured();
  if (!execution.getStore()) throw new Error("No approved CAM production is executing. Review its quote before starting.");
}
/** Only the authenticated controller calls this after validating the persisted
 * quote, actor and approval. An environment flag alone cannot submit a job. */
export function withCamExecution<T>(jobId: string, action: () => Promise<T>) {
  assertCamConfigured(); z.uuid().parse(jobId);
  return execution.run({ jobId }, action);
}
