import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getBalanceUsd } from "@/lib/credits";
import { runJob } from "@/lib/runner";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "estimated") {
    return Response.json({ error: `Job is ${job.status}, not confirmable` }, { status: 409 });
  }

  const balance = await getBalanceUsd();
  const estimate = Number(job.estimateUsd ?? 0);
  if (balance < estimate) {
    // Clean block on empty balance: rule from the devis.
    return Response.json(
      { error: "Insufficient credits. Top up your account to launch this production.", balance, estimate },
      { status: 402 },
    );
  }

  await db
    .update(schema.jobs)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(eq(schema.jobs.id, id));

  // Fire and forget: the UI polls GET /api/jobs/:id for progress.
  void runJob(id);

  return Response.json({ ok: true });
}
