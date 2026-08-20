import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getBalanceUsd } from "@/lib/credits";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });

  const jobParams = job.params as Record<string, unknown>;
  return Response.json({
    id: job.id,
    status: job.status,
    progress: jobParams.progress ?? [],
    estimateUsd: job.estimateUsd ? Number(job.estimateUsd) : null,
    billedUsd: job.billedUsd ? Number(job.billedUsd) : null,
    error: job.error,
    outputUrl: job.outputPath ? `/api/media/outputs/${job.id}.mp4` : null,
    sheet: jobParams.sheet ?? null,
    sheetUrl: jobParams.sheetUrl ?? null,
    balance: await getBalanceUsd(),
  });
}
