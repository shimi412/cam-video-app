import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ProductionParams } from "@/lib/brain";
import { getActiveRecipe } from "@/lib/recipes";
import { planConcept } from "@/lib/concept/storyboard";
import { generationPlan } from "@/lib/concept/generation-plan";
import { lockedAssets } from "@/lib/concept/assets";
import { placeholderTiming } from "@/lib/concept/timing";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Invalid production ID." }, { status: 400 });
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  if (!job) return Response.json({ error: "Production not found." }, { status: 404 });
  const params = job.params as ProductionParams;
  const recipe = getActiveRecipe(params.templateSlug);
  if (!recipe?.concept || params.previewSource === "existing") return Response.json({ error: "This export is for a new CAM Clay script." }, { status: 409 });
  try {
    const board = planConcept(job.script, recipe, params.aspectRatio, params.sceneDirections);
    const plan = generationPlan(job.script, params, board, placeholderTiming(board.shots.map((s) => s.narration)), await lockedAssets());
    return Response.json(plan, { headers: { "Cache-Control": "no-store", "Content-Disposition": 'attachment; filename="cam-generation-plan.json"' } });
  } catch {
    return Response.json({ error: "Restore the locked CAM references before exporting." }, { status: 409 });
  }
}
