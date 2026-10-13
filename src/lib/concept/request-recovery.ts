import path from "node:path";
import { z } from "zod";
import { requestReceipts } from "./request-journal";

export const REQUEST_DIRECTORY = "provider-contracts-v3";
export const ACCEPTANCE_DIRECTORY = "provider-acceptances-v3";
export function requestPaths(jobId: string) {
  z.uuid().parse(jobId);
  const root = path.join(process.cwd(), "storage/concepts", jobId, "checkpoints/simulated-requests");
  const sequence = path.join(process.cwd(), "storage/concepts", jobId, "checkpoints/production-sequence");
  return { current: path.join(root, REQUEST_DIRECTORY), legacy: path.join(root, "provider-contracts-budgeted-v2"), acceptance: path.join(root, ACCEPTANCE_DIRECTORY),
    sequence: path.join(sequence, "requests"), sequenceAcceptance: path.join(sequence, "acceptances") };
}
export function requestLocations(jobId: string) {
  const paths = requestPaths(jobId);
  return [{ directory: paths.current, acceptance: paths.acceptance }, { directory: paths.sequence, acceptance: paths.sequenceAcceptance }];
}
export async function assertRequestsResumable(jobId: string) {
  const paths = requestPaths(jobId);
  const receipts = [...await requestReceipts(paths.current), ...await requestReceipts(paths.sequence), ...await requestReceipts(paths.legacy)];
  if (receipts.some((r) => r.mode !== "simulation" || (r.binding && r.binding.jobId !== jobId))) throw new Error("Request journal does not match this preview.");
  if (receipts.some((r) => r.state === "submitting")) throw new Error("An original request has an unknown outcome. Check its saved receipt before resuming.");
  if (receipts.some((r) => r.state === "failed")) throw new Error("An original request failed. A new provider attempt remains blocked.");
}
