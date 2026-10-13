import { z } from "zod";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { acquireJobLock } from "@/lib/job-lock";
import { isSimulation, providerMode } from "@/lib/providers/mode";
import { Hash } from "@/lib/concept/checkpoints";
import { requestReceipts, reconcileRequest } from "@/lib/concept/request-journal";
import { simulationAcceptance } from "@/lib/concept/simulated-provider";
import { requestPaths } from "@/lib/concept/request-recovery";

/** Offline reconciliation only. Never accepts arbitrary IDs, URLs or outputs. */
async function handle(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Invalid production ID." }, { status: 400 });
  if (!isSimulation()) return Response.json({ error: "Paid request recovery is disabled." }, { status: 409 });
  const lock = await acquireJobLock(id);
  if (!lock) return Response.json({ error: "This preview is busy. Wait for it to stop before checking requests." }, { status: 409 });
  try {
    const [job] = await lock.db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    if (!job) return Response.json({ error: "Production not found." }, { status: 404 });
    if ((job.params as { executionMode?: string }).executionMode !== providerMode()) return Response.json({ error: "Execution mode changed." }, { status: 409 });
    const paths = requestPaths(id), directory = paths.current;
    const receipts = await requestReceipts(directory);
    if (receipts.some((r) => r.mode !== "simulation" || r.binding?.jobId !== id)) throw new Error("Invalid request scope.");
    if (request.method === "POST") {
      if (!["failed", "running", "confirmed"].includes(job.status)) return Response.json({ error: "Only an interrupted preview can be reconciled." }, { status: 409 });
      // A single hash is sufficient. Read a bounded body instead of accepting
      // provider credentials, generated output or user-supplied evidence.
      const reader = request.body?.getReader();
      if (!reader) throw new Error("Missing request.");
      const chunks: Uint8Array[] = []; let size = 0;
      try { while (true) { const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.length; if (size > 1024) { await reader.cancel(); throw new Error("Request too large."); } chunks.push(chunk.value);
      } } finally { reader.releaseLock(); }
      const { fingerprint } = z.object({ fingerprint: Hash }).strict().parse(JSON.parse(Buffer.concat(chunks).toString()));
      const receipt = receipts.find((r) => r.fingerprint === fingerprint);
      if (!receipt?.binding || !["submitting", "submitted", "complete"].includes(receipt.state)) throw new Error("No recoverable original request.");
      const accepted = await simulationAcceptance(paths.acceptance, fingerprint);
      if (!accepted) return Response.json({ error: "No saved acceptance was found. The request stays blocked and its budget stays reserved. Nothing was resubmitted." }, { status: 409 });
      await reconcileRequest({ directory, fingerprint, mode: "simulation", requestId: accepted.requestId,
        binding: receipt.binding, assertOwned: lock.assertOwned, verify: async () => accepted });
    }
    const current = await requestReceipts(directory);
    const legacy = await requestReceipts(paths.legacy);
    if (legacy.some((r) => r.mode !== "simulation")) throw new Error("Invalid legacy request scope.");
    return Response.json({ mode: "simulation", paidRequests: 0, requests: [...current, ...legacy].map((r) => ({
      fingerprint: r.fingerprint, operation: r.binding?.operation ?? "Earlier simulation request",
      state: r.state, requestId: r.requestId ?? null, reconciled: Boolean(r.reconciliation),
      canReconcile: Boolean(r.binding && r.state === "submitting"),
    })) });
  } catch {
    return Response.json({ error: "The saved evidence does not match this request. It stays blocked; nothing was resubmitted." }, { status: 409 });
  } finally { await lock.release(); }
}
export const GET = handle;
export const POST = handle;
