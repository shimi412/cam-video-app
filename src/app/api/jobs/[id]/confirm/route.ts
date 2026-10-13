import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { schema } from "@/db";
import { acquireJobLock } from "@/lib/job-lock";
import { getBalanceUsd } from "@/lib/credits";
import { runJob } from "@/lib/runner";
import { getActiveRecipe } from "@/lib/recipes";
import { isSimulation, providerMode } from "@/lib/providers/mode";
import type { ProductionParams } from "@/lib/brain";
import { prepareConcept } from "@/lib/concept/preparation";
import { verifiedSceneMedia } from "@/lib/concept/imported-media";
import { verifyWorkflowFiles } from "@/lib/concept/workflow-files";
import { selectedNarration } from "@/lib/concept/narration";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Invalid production ID." }, { status: 400 });
  const lock = await acquireJobLock(id);
  if (!lock) return Response.json({ error: "This production is being edited or is already running. Please try again." }, { status: 409 });
  try {
    const db = lock.db;
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
    const recipe = getActiveRecipe(production.templateSlug)!;
    const input = job.params as ProductionParams;
    if (recipe.concept && input.previewSource !== "existing") {
      const prep = await prepareConcept(job.script, input, recipe, id);
      try { await selectedNarration(id, prep.shots.map((s) => s.narration), input); }
      catch { return Response.json({ error: "The selected recording or its word timings changed. Review them again before starting." }, { status: 409 }); }
      const pending = prep.shots.filter((shot) => shot.media && shot.review?.status !== "approved");
      if (pending.length) return Response.json({ error: `Review the visuals in scenes ${pending.map((s) => s.index).join(", ")} before starting the preview.` }, { status: 409 });
      for (const shot of prep.shots) if (input.sceneMediaWorkflow?.[shot.index]) {
        const clip = shot.workflow?.stages.find((step) => step.stage === "clip");
        if (clip?.status !== "approved" || clip.target !== input.sceneMediaWorkflow[shot.index]) return Response.json({ error: "An animation's scene approvals changed. Review its steps before continuing." }, { status: 409 });
        try { await verifyWorkflowFiles(id, shot.workflow!); }
        catch { return Response.json({ error: "A reviewed scene file changed. Replace it and review the scene again." }, { status: 409 }); }
      }
      try { for (const media of Object.values(input.sceneMedia ?? {})) await verifiedSceneMedia(id, media); }
      catch { return Response.json({ error: "An imported visual is missing or changed. Import and review it again." }, { status: 409 }); }
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
  } finally { await lock.release(); }
}
