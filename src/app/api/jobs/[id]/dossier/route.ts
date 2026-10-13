import { z } from "zod";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { acquireJobLock } from "@/lib/job-lock";
import { isSimulation, providerMode } from "@/lib/providers/mode";
import { getActiveRecipe } from "@/lib/recipes";
import type { ProductionParams } from "@/lib/brain";
import { prepareConcept } from "@/lib/concept/preparation";
import { productionDossier } from "@/lib/concept/production-dossier";
import { verifiedSceneMedia } from "@/lib/concept/imported-media";
import { selectedNarration } from "@/lib/concept/narration";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Invalid production ID." }, { status: 400 });
  if (!isSimulation()) return Response.json({ error: "Local preparation only." }, { status: 409 });
  const lock = await acquireJobLock(id);
  if (!lock) return Response.json({ error: "Production is busy." }, { status: 409 });
  try {
    const [job] = await lock.db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    if (!job) return Response.json({ error: "Production not found." }, { status: 404 });
    const params = job.params as ProductionParams & { executionMode: string }, recipe = getActiveRecipe(params.templateSlug);
    if (job.status !== "estimated" || params.executionMode !== providerMode() || !recipe?.concept || params.previewSource === "existing") return Response.json({ error: "Export the saved dossier from the completed preview, or open an unconfirmed draft." }, { status: 409 });
    const prep = await prepareConcept(job.script, params, recipe, id);
    await selectedNarration(id, prep.shots.map((s) => s.narration), params);
    for (const shot of prep.shots) {
      if (shot.media) await verifiedSceneMedia(id, shot.media);
      for (const step of shot.workflow?.stages ?? []) if (step.status === "approved" && step.media) await verifiedSceneMedia(id, step.media);
    }
    return Response.json(productionDossier(id, job.script, params, prep), { headers: { "Cache-Control": "no-store", "Content-Disposition": 'attachment; filename="cam-production-dossier.json"' } });
  } catch { return Response.json({ error: "A selected or approved file changed. Restore or replace it before exporting." }, { status: 409 }); }
  finally { await lock.release(); }
}
