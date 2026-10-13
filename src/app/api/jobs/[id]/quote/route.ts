import { withAccess } from "@/lib/access";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import type { ProductionParams } from "@/lib/brain";
import { acquireJobLock } from "@/lib/job-lock";
import { getActiveRecipe } from "@/lib/recipes";
import { isSimulation, providerMode } from "@/lib/providers/mode";
import { prepareConcept } from "@/lib/concept/preparation";
import { Hash } from "@/lib/concept/checkpoints";
import { DecimalAmount, saveQuoteDraft } from "@/lib/concept/quote-preparation";
import { verifiedSceneMedia } from "@/lib/concept/imported-media";

const Input = z.object({ basis: Hash, amounts: z.record(Hash, DecimalAmount),
  caps: z.object({ usd: DecimalAmount, "higgsfield-credit": DecimalAmount }).strict(), note: z.string().trim().max(1000),
}).strict();
async function handle(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Invalid production ID." }, { status: 400 });
  if (!isSimulation()) return Response.json({ error: "Quote preparation is available in offline mode only." }, { status: 409 });
  const lock = await acquireJobLock(id);
  if (!lock) return Response.json({ error: "This production is busy. Try again after the current operation." }, { status: 409 });
  try {
    const [job] = await lock.db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    if (!job) return Response.json({ error: "Production not found." }, { status: 404 });
    const params = job.params as ProductionParams & { executionMode: string };
    const recipe = getActiveRecipe(params.templateSlug);
    if (job.status !== "estimated" || params.previewSource === "existing" || !recipe?.concept || params.executionMode !== providerMode()) return Response.json({ error: "This worksheet belongs to an unconfirmed local draft. Completed previews keep their exported snapshot." }, { status: 409 });
    const prep = await prepareConcept(job.script, params, recipe, id);
    for (const shot of prep.shots) {
      for (const step of shot.workflow?.stages ?? []) if (step.status === "approved" && step.media) await verifiedSceneMedia(id, step.media);
      if (shot.media) await verifiedSceneMedia(id, shot.media);
    }
    if (request.method === "PATCH") {
      const reader = request.body?.getReader(); if (!reader) throw new Error("Missing worksheet.");
      const chunks: Uint8Array[] = []; let size = 0;
      try { while (true) { const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.length; if (size > 32768) { await reader.cancel(); throw new Error("Worksheet too large."); } chunks.push(chunk.value);
      } } finally { reader.releaseLock(); }
      const input = Input.parse(JSON.parse(Buffer.concat(chunks).toString()));
      if (input.basis !== prep.quote!.basis) return Response.json({ error: "The scenes or their approvals changed. Reload this worksheet before saving." }, { status: 409 });
      params.quoteDraft = saveQuoteDraft(prep.quote!, input);
      const preparation = await prepareConcept(job.script, params, recipe, id);
      await lock.db.update(schema.jobs).set({ params: { ...params, preparation } }).where(eq(schema.jobs.id, id));
      return Response.json({ preparation });
    }
    return Response.json(prep.quote, { headers: { "Cache-Control": "no-store", "Content-Disposition": 'attachment; filename="cam-quote-preparation.json"' } });
  } catch {
    return Response.json({ error: "Could not prepare this worksheet. Check the files, use nonnegative amounts with at most six decimals, and add a source or assumption for entered prices." }, { status: 400 });
  } finally { await lock.release(); }
}
export const GET = withAccess(handle);
export const PATCH = withAccess(handle);
