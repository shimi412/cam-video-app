import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertTransportMode, type QueueRequest } from "./provider-transports";

const Receipt = z.object({
  mode: z.enum(["simulation", "live"]).default("simulation"),
  fingerprint: z.string(), state: z.enum(["submitting", "submitted", "complete", "failed"]),
  requestId: z.string().optional(), output: z.string().optional(),
});
type Receipt = z.infer<typeof Receipt>;
export type SimulatedQueue = QueueRequest & { mode: "simulation" };

/** Rehearse queue recovery without a live provider. The caller owns the job lock.
 * A lost submit response is ambiguous: never resubmit it automatically.
 * Read/poll failures preserve the saved request ID so polling can resume safely.
 */
export async function advanceRequest(input: {
  directory: string; fingerprint: string; queue: QueueRequest; assertOwned: () => Promise<void>;
}) {
  assertTransportMode(input.queue.mode);
  if (!/^[a-f0-9]{64}$/.test(input.fingerprint)) throw new Error("Invalid request fingerprint.");
  await input.assertOwned();
  await mkdir(input.directory, { recursive: true });
  const file = path.join(input.directory, `${input.fingerprint}.json`);
  let receipt: Receipt | undefined;
  try { receipt = Receipt.parse(JSON.parse(await readFile(file, "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (receipt && (receipt.fingerprint !== input.fingerprint || receipt.mode !== input.queue.mode)) throw new Error("Request journal mismatch.");
  const save = async (value: Receipt) => {
    await input.assertOwned();
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value, null, 2), { flag: "wx" });
    await rename(temporary, file);
    receipt = value;
  };
  if (receipt?.state === "submitting") throw new Error("Submission outcome unknown. Reconcile the original request before retrying.");
  if (receipt?.state === "failed") throw new Error("The original request failed. An explicit new attempt is required.");
  if (receipt?.state === "complete") {
    if (!receipt.requestId || !receipt.output) throw new Error("Incomplete request journal.");
    return { ...receipt, reused: true };
  }
  if (!receipt) {
    await save({ mode: input.queue.mode, fingerprint: input.fingerprint, state: "submitting" });
    await input.assertOwned();
    const submitted = await input.queue.submit();
    if (!submitted.requestId) throw new Error("Submission returned no request ID. Reconciliation required.");
    await save({ mode: input.queue.mode, fingerprint: input.fingerprint, state: "submitted", requestId: submitted.requestId });
  }
  if (!receipt?.requestId) throw new Error("Submitted request has no ID. Reconciliation required.");
  await input.assertOwned();
  const result = await input.queue.poll(receipt.requestId);
  if (result.state === "complete") {
    if (!result.output) throw new Error("Queue result has no output.");
    await save({ ...receipt, state: "complete", output: result.output });
  } else if (result.state === "failed") {
    await save({ ...receipt, state: "failed" });
    throw new Error("The original request failed. An explicit new attempt is required.");
  }
  return { ...receipt, reused: false };
}

export const advanceSimulatedRequest = advanceRequest;
