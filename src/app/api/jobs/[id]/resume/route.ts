import { withAccess } from "@/lib/access";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import { runJob } from "@/lib/runner";
import { acquireJobLock } from "@/lib/job-lock";
import { recoveryAllowed, recentlyQueued } from "@/lib/job-recovery";
import { assertRequestsResumable } from "@/lib/concept/request-recovery";

async function handlePOST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Invalid production ID." }, { status: 400 });
  const lock = await acquireJobLock(id);
  if (!lock) return Response.json({ code: "already-running", error: "This production is already running." }, { status: 409 });
  try {
    const [job] = await lock.db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    if (!job) return Response.json({ error: "Production not found." }, { status: 404 });
    if (!recoveryAllowed(job)) return Response.json({ error: "Only unfinished local previews can be resumed in the same offline mode." }, { status: 409 });
    if (recentlyQueued(job)) return Response.json({ code: "already-running", error: "This preview is queued." }, { status: 409 });
    try { await assertRequestsResumable(id); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Check the saved request journal before resuming." }, { status: 409 }); }
    // Persist the queue transition before replying. A polling browser must not
    // see the previous failed state and stop watching before the worker starts.
    await lock.db.update(schema.jobs).set({ status: "confirmed", confirmedAt: new Date(), error: null, finishedAt: null }).where(eq(schema.jobs.id, id));
  } finally { await lock.release(); }
  // Persisted job + explicit retry remain recoverable if this callback is interrupted.
  // The worker reacquires its session lock before changing any production state.
  after(() => runJob(id, { resume: true }));
  return Response.json({ ok: true }, { status: 202 });
}

export const POST = withAccess(handlePOST);
