import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { getBalanceUsd } from "@/lib/credits";
import { runJob } from "@/lib/runner";
import { getActiveRecipe } from "@/lib/recipes";
import { isSimulation, providerMode } from "@/lib/providers/mode";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Invalid production ID." }, { status: 400 });
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "estimated") {
    return Response.json({ error: `Job is ${job.status}, not confirmable` }, { status: 409 });
  }
  const production = job.params as { templateSlug?: string; executionMode?: string };
  if (!production.templateSlug || !getActiveRecipe(production.templateSlug)) {
    return Response.json({ error: "This video model is no longer available. Please frame a new request." }, { status: 409 });
  }
  if (production.executionMode !== providerMode()) {
    return Response.json({ error: "Production settings changed. Please frame a new request." }, { status: 409 });
  }
  if (!isSimulation() && getActiveRecipe(production.templateSlug)?.concept?.previewOnly) {
    return Response.json({ error: "This style is currently available for free previews only." }, { status: 409 });
  }

  const balance = await getBalanceUsd();
  const estimate = Number(job.estimateUsd ?? 0);
  if (!isSimulation() && balance < estimate) {
    // Clean block on empty balance: rule from the devis.
    return Response.json(
      { error: "Insufficient credits. Top up your account to launch this production.", balance, estimate },
      { status: 402 },
    );
  }

  const claimed = await db
    .update(schema.jobs)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(and(eq(schema.jobs.id, id), eq(schema.jobs.status, "estimated")))
    .returning({ id: schema.jobs.id });
  if (claimed.length === 0) return Response.json({ error: "Production already confirmed." }, { status: 409 });

  after(() => runJob(id));

  return Response.json({ ok: true });
}
