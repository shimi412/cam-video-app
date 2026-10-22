import { withAccess } from "@/lib/access";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { rm } from "node:fs/promises";
import { schema } from "@/db";
import { acquireJobLock } from "@/lib/job-lock";
import type { ProductionParams } from "@/lib/brain";
import { isSimulation, providerMode } from "@/lib/providers/mode";
import { getActiveRecipe } from "@/lib/recipes";
import { planConcept } from "@/lib/concept/storyboard";
import { prepareConcept } from "@/lib/concept/preparation";
import { boundedMedia } from "@/lib/concept/media-transfers";
import { Hash } from "@/lib/concept/checkpoints";
import { importNarration, narrationDirectory, narrationTarget, reviewNarration, selectedNarration, verifyNarration, withWordTimings, WordTimings, type Narration } from "@/lib/concept/narration";

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("timing"), id: z.uuid(), target: Hash, timing: WordTimings }).strict(),
  z.object({ action: z.literal("review"), target: Hash, decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(1000), listened: z.boolean(), checkedWords: z.boolean() }).strict(),
  z.object({ action: z.literal("select"), target: Hash }).strict(),
  z.object({ action: z.literal("remove"), id: z.uuid() }).strict(),
]);
async function handle(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Invalid production ID." }, { status: 400 });
  if (!isSimulation()) return Response.json({ error: "Recording imports are available in local preview mode only." }, { status: 409 });
  const lock = await acquireJobLock(id);
  if (!lock) return Response.json({ error: "This production is busy. Try again when it finishes saving." }, { status: 409 });
  let imported: Narration | undefined, saved = false;
  try {
    const [job] = await lock.db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    if (!job) return Response.json({ error: "Production not found." }, { status: 404 });
    const params = job.params as ProductionParams & { executionMode: string }, recipe = getActiveRecipe(params.templateSlug);
    if (job.status !== "estimated" || params.executionMode !== providerMode() || !recipe?.concept || params.previewSource === "existing") return Response.json({ error: "Only an unconfirmed local draft can change its recording." }, { status: 409 });
    const phrases = planConcept(job.script, recipe, params.aspectRatio, params.sceneDirections, params.sceneNarrations).shots.map((s) => s.narration);
    if (request.method === "POST") {
      const body = await boundedMedia(new Response(request.body, { headers: request.headers }), 64 * 1024 * 1024 + 65536);
      const form = await new Response(body, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
      if (form.get("currentId") !== (params.narration?.id ?? "")) return Response.json({ error: "This recording changed. Reload before replacing it." }, { status: 409 });
      const file = form.get("file");
      if (!(file instanceof File)) throw new Error("Choose an audio file under 64 MB.");
      const speaker = z.enum(["bram", "test", "other"]).parse(form.get("speaker"));
      const source = z.string().trim().min(1).max(500).parse(form.get("sourceNote"));
      imported = await importNarration(id, Buffer.from(await file.arrayBuffer()), speaker, source);
      params.narration = { ...imported, reviews: params.narration?.reviews ?? [] }; params.useImportedNarration = false;
    } else {
      const body = await boundedMedia(new Response(request.body, { headers: request.headers }), 512 * 1024);
      const action = Action.parse(JSON.parse(body.toString())), narration = params.narration;
      if (!narration) throw new Error("Import a recording first.");
      if (action.action === "remove") {
        if (action.id !== narration.id) return Response.json({ error: "This recording changed. Reload before removing it." }, { status: 409 });
        delete params.narration; params.useImportedNarration = false;
      } else {
        await verifyNarration(id, narration);
        if (action.action === "timing") {
          if (action.id !== narration.id || action.target !== narrationTarget(id, phrases, narration)) return Response.json({ error: "The recording or word timings changed. Reload before saving your edits." }, { status: 409 });
          params.narration = withWordTimings(narration, phrases, action.timing);
        } else {
          if (action.target !== narrationTarget(id, phrases, narration)) return Response.json({ error: "The recording or word timings changed. Reload before reviewing." }, { status: 409 });
          if (action.action === "review") params.narration = reviewNarration(id, phrases, narration, action);
          else { await selectedNarration(id, phrases, { ...params, useImportedNarration: true }); params.useImportedNarration = true; }
        }
      }
    }
    const preparation = await prepareConcept(job.script, params, recipe, id);
    await lock.assertOwned();
    await lock.db.update(schema.jobs).set({ params: { ...params, preparation } }).where(eq(schema.jobs.id, id));
    saved = true; return Response.json({ preparation });
  } catch (error) {
    const safe = error instanceof Error && /^(Use an audio|Use a mono|Choose an audio|Voice (duration|recording|review)|Import a recording|The imported recording|The recording or timings|Listen to the recording|Add a reason|Alignment belongs|Transcript (omits|differs)|Word timestamps|Media exceeds|Empty media)/.test(error.message);
    return Response.json({ error: error instanceof z.ZodError ? "Check the recording details and every word's start/end time." : safe ? error.message : "Could not read this recording. Use audible mono/stereo audio, 0.2–600 seconds, under 64 MB." }, { status: 400 });
  } finally {
    try { if (imported && !saved) await rm(narrationDirectory(id, imported.id), { recursive: true, force: true }); }
    finally { await lock.release(); }
  }
}
export const POST = withAccess(handle);
export const PATCH = withAccess(handle);
