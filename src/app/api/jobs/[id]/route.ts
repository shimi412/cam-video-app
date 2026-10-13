import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getBalanceUsd } from "@/lib/credits";
import { z } from "zod";
import { jobWorkerActive } from "@/lib/job-lock";
import { recoveryAllowed, recentlyQueued } from "@/lib/job-recovery";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Invalid production ID." }, { status: 400 });
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });

  const jobParams = job.params as Record<string, unknown>;
  const canResume = recoveryAllowed(job) && !recentlyQueued(job) && !(await jobWorkerActive(id));
  return Response.json({
    id: job.id,
    canResume,
    interrupted: canResume && job.status !== "failed",
    renderReused: jobParams.renderReused === true,
    preparation: jobParams.preparation ?? null,
    execution: jobParams.execution ?? null,
    script: job.script,
    aspectRatio: jobParams.aspectRatio,
    simulation: jobParams.executionMode === "mock" || jobParams.executionMode === "dryrun",
    status: job.status,
    progress: jobParams.progress ?? [],
    estimateUsd: job.estimateUsd ? Number(job.estimateUsd) : null,
    billedUsd: job.billedUsd ? Number(job.billedUsd) : null,
    error: job.error,
    outputUrl: job.outputPath ? `/api/media/outputs/${job.id}.mp4` : null,
    sheet: jobParams.sheet ?? null,
    sheetUrl: jobParams.sheetUrl ?? null,
    artifacts: jobParams.artifacts ?? [],
    media: jobParams.media ?? null,
    balance: await getBalanceUsd(),
  });
}
