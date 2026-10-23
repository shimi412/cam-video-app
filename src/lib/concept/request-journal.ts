import {SubmissionNotSentError, RetryableReadError, SubmissionRejectedError} from "../providers/network";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { assertTransportMode, type QueueRequest } from "./provider-transports";
import { Hash, readCheckpoint, saveCheckpoint, sha256 } from "./checkpoints";

export const RequestBinding = z.object({
  jobId: z.uuid(), operation: z.string().min(1).max(100),
  model: z.string().min(1).max(200), transport: z.enum(["fal-queue", "higgsfield-mcp"]), payloadSha256: Hash,
  /** Payload hash with hosted reference URLs replaced by the uploaded file hashes (2026-10-23): identity survives a URL refresh. */
  payloadIdentity: z.string().optional(),
}).strict();
export type RequestBinding = z.infer<typeof RequestBinding>;
const RequestId = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/);
/** 10 retries with 2 s … 5 min backoff: about half an hour of provider or network outage before a human is asked. */
const READ_RECOVERY_LIMIT=10;
export const Receipt = z.object({
  mode: z.enum(["simulation", "live"]).default("simulation"),
  fingerprint: Hash, state: z.enum(["not-sent", "submitting", "submitted", "complete", "failed"]),
  submittedAt:z.number().optional(), draftId:z.string().min(1).optional(),
  failureReason: z.string().optional(), requestId: RequestId.optional(), output: z.string().optional(), binding: RequestBinding.optional(),
  readRecovery: z.object({ failures:z.number().int().min(1).max(READ_RECOVERY_LIMIT), nextAt:z.number().nonnegative() }).optional(),
  reconciliation: z.object({ requestId: RequestId, evidenceSha256: Hash, at: z.iso.datetime() }).optional(),
});
type Receipt = z.infer<typeof Receipt>;
export class DefinitiveRequestFailure extends Error {
  constructor(readonly fingerprint:string){super("The original request failed. An explicit new attempt is required.");}
}
export type SimulatedQueue = QueueRequest & { mode: "simulation" };

/** Rehearse queue recovery without a live provider. The caller owns the job lock.
 * A lost submit response is ambiguous: never resubmit it automatically.
 * Read/poll failures preserve the saved request ID so polling can resume safely.
 */
export async function advanceRequest(input: {
  directory: string; fingerprint: string; queue: QueueRequest; assertOwned: () => Promise<void>;
  binding?: RequestBinding;
}) {
  assertTransportMode(input.queue.mode);
  if (!/^[a-f0-9]{64}$/.test(input.fingerprint)) throw new Error("Invalid request fingerprint.");
  await input.assertOwned();
  const file = path.join(input.directory, `${input.fingerprint}.json`);
  let receipt = await readCheckpoint(file, Receipt);
  const binding = input.binding ? RequestBinding.parse(input.binding) : undefined;
  if (receipt && (receipt.fingerprint !== input.fingerprint || receipt.mode !== input.queue.mode)) throw new Error("Request journal mismatch.");
  // A refreshed hosted URL changes the raw payload hash but not the request: bindings that carry a payload identity are compared on it (2026-10-23).
  const sameBinding = (a?: z.infer<typeof RequestBinding>, b?: z.infer<typeof RequestBinding>) => a && b && a.payloadIdentity && b.payloadIdentity
    ? a.jobId === b.jobId && a.operation === b.operation && a.model === b.model && a.transport === b.transport && a.payloadIdentity === b.payloadIdentity
    : JSON.stringify(a) === JSON.stringify(b);
  if (receipt && !sameBinding(receipt.binding, binding)) throw new Error("Request binding mismatch.");
  const save = async (value: Receipt) => {
    await saveCheckpoint(file, Receipt.parse(value), input.assertOwned);
    receipt = value;
  };
  if (receipt?.state === "submitting") throw new Error("Submission outcome unknown. Reconcile the original request before retrying.");
  if (receipt?.state === "failed") throw new DefinitiveRequestFailure(input.fingerprint);
  if (receipt?.state === "complete") {
    if (!receipt.requestId || !receipt.output) throw new Error("Incomplete request journal.");
    return { ...receipt, reused: true };
  }
  if (!receipt || receipt.state === "not-sent") {
    await input.queue.prepare?.();
    await input.assertOwned();
    const submittedAt=Date.now();
    await save({ mode: input.queue.mode, fingerprint: input.fingerprint, binding, submittedAt, state: "submitting" });
    await input.assertOwned();
    let submitted;
    try { submitted = await input.queue.submit(); }
    catch(error) {
      if(error instanceof SubmissionNotSentError)await save({mode:input.queue.mode,fingerprint:input.fingerprint,binding,submittedAt,state:"not-sent"});
      if(error instanceof SubmissionRejectedError){await save({mode:input.queue.mode,fingerprint:input.fingerprint,binding,submittedAt,state:"failed",failureReason:error.message.slice(0,500)});throw new DefinitiveRequestFailure(input.fingerprint);}
      throw error;
    }
    if (!RequestId.safeParse(submitted.requestId).success) throw new Error("Submission returned no request ID. Reconciliation required.");
    await save({ mode: input.queue.mode, fingerprint: input.fingerprint, binding, submittedAt, state: "submitted", requestId: submitted.requestId });
  }
  if (!receipt?.requestId) throw new Error("Submitted request has no ID. Reconciliation required.");
  // Read outages are waited out with a bounded backoff (about 30 minutes in total), not three strikes in 14 seconds (2026-10-21).
  if(receipt.readRecovery&&receipt.readRecovery.failures>=READ_RECOVERY_LIMIT)throw new Error("Saved result recovery exhausted. Support must check the accepted request; no new generation was sent.");
  if(receipt.readRecovery&&receipt.readRecovery.nextAt>Date.now())return {...receipt,reused:true};
  await input.assertOwned();
  let result:Awaited<ReturnType<QueueRequest["poll"]>>;
  try { result = await input.queue.poll(receipt.requestId); }
  catch(error){
    if(!(error instanceof RetryableReadError))throw error;
    const failures=(receipt.readRecovery?.failures??0)+1;
    await save({...receipt,readRecovery:{failures,nextAt:Date.now()+Math.min(300_000,1000*2**failures)}});
    if(failures>=READ_RECOVERY_LIMIT)throw new Error("Saved result recovery exhausted. Support must check the accepted request; no new generation was sent.");
    throw error;
  }
  if(receipt.readRecovery)await save({...receipt,readRecovery:undefined});
  if (result.state === "complete") {
    if (!result.output) throw new Error("Queue result has no output.");
    await save({ ...receipt, state: "complete", output: result.output, draftId:result.draftId });
  } else if (result.state === "failed") {
    await save({ ...receipt, state: "failed", failureReason:result.failureReason });
    throw new DefinitiveRequestFailure(input.fingerprint);
  }
  return { ...receipt, reused: false };
}

export const advanceSimulatedRequest = advanceRequest;

/** A trusted, read-only provider lookup must prove the exact original payload.
 * No submit, budget release or retry is possible from this function. */
export async function reconcileRequest(input: {
  directory: string; fingerprint: string; mode: QueueRequest["mode"]; requestId: string;
  binding: RequestBinding; assertOwned: () => Promise<void>;
  verify: (requestId: string) => Promise<{ mode: QueueRequest["mode"]; requestId: string; fingerprint: string; binding: RequestBinding }>;
}) {
  assertTransportMode(input.mode); Hash.parse(input.fingerprint); RequestId.parse(input.requestId);
  const binding = RequestBinding.parse(input.binding);
  await input.assertOwned();
  const file = path.join(input.directory, `${input.fingerprint}.json`);
  const receipt = await readCheckpoint(file, Receipt);
  if (!receipt || receipt.mode !== input.mode || receipt.fingerprint !== input.fingerprint || !receipt.binding || JSON.stringify(receipt.binding) !== JSON.stringify(binding)) throw new Error("No matching bound request to reconcile.");
  if (receipt.requestId && receipt.requestId !== input.requestId) throw new Error("Cannot replace the original request ID.");
  if (receipt.state === "failed") throw new Error("The original request failed. An explicit new attempt is required.");
  const evidence = await input.verify(input.requestId);
  if (evidence.mode !== input.mode || evidence.requestId !== input.requestId || evidence.fingerprint !== input.fingerprint || JSON.stringify(RequestBinding.parse(evidence.binding)) !== JSON.stringify(binding)) throw new Error("Provider evidence does not match the original request.");
  const evidenceSha256 = sha256(JSON.stringify({ mode: evidence.mode, requestId: evidence.requestId, fingerprint: evidence.fingerprint, binding }));
  if (receipt.reconciliation) {
    if (receipt.reconciliation.evidenceSha256 !== evidenceSha256) throw new Error("Conflicting reconciliation evidence.");
    return receipt;
  }
  const next: Receipt = { ...receipt, state: receipt.state === "submitting" ? "submitted" : receipt.state,
    requestId: input.requestId, reconciliation: { requestId: input.requestId, evidenceSha256, at: new Date().toISOString() } };
  await saveCheckpoint(file, next, input.assertOwned);
  return next;
}

export async function requestReceipts(directory: string) {
  let files: string[];
  try { files = await readdir(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const receipts: Receipt[] = [];
  for (const name of files.filter((f) => /^[a-f0-9]{64}\.json$/.test(f)).sort()) {
    const receipt = await readCheckpoint(path.join(directory, name), Receipt);
    if (!receipt || receipt.fingerprint !== name.slice(0, -5)) throw new Error("Invalid request journal.");
    receipts.push(receipt);
  }
  return receipts;
}
