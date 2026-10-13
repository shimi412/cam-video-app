import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { rm } from "node:fs/promises";
import path from "node:path";
import { schema } from "@/db";
import type { ProductionParams } from "@/lib/brain";
import { acquireJobLock } from "@/lib/job-lock";
import { getActiveRecipe } from "@/lib/recipes";
import { providerMode, isSimulation } from "@/lib/providers/mode";
import { prepareConcept } from "@/lib/concept/preparation";
import { availableLocalVoices } from "@/lib/concept/local-voice";
import { PreviewVoiceSchema, mediaFile, type SceneMedia } from "@/lib/concept/preview-inputs";
import { importSceneMedia, MAX_MEDIA_BYTES } from "@/lib/concept/imported-media";
import { DirectionSchema } from "@/lib/concept/types";

const settingsSchema = z.union([
  z.object({ previewVoice: PreviewVoiceSchema }).strict(),
  z.object({ removeScene: z.number().int().min(1).max(36) }).strict(),
  z.object({ scene: z.number().int().min(1).max(36), direction: DirectionSchema }).strict(),
  z.object({ resetDirection: z.number().int().min(1).max(36) }).strict(),
]);

async function boundedBody(request: Request, limit: number) {
  if (!request.body) throw new Error("Missing upload.");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) { await reader.cancel(); throw new Error("Upload exceeds the 32 MB limit."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

async function update(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Invalid production ID." }, { status: 400 });
  if (!isSimulation()) return Response.json({ error: "Media imports and test voices are available in free preview mode only." }, { status: 409 });
  const lock = await acquireJobLock(id);
  if (!lock) return Response.json({ error: "This production is busy. Try again after the current operation." }, { status: 409 });
  let imported: SceneMedia | undefined, saved = false;
  try {
    const [job] = await lock.db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    if (!job) return Response.json({ error: "Production not found." }, { status: 404 });
    const params = job.params as ProductionParams & { executionMode: string };
    const recipe = getActiveRecipe(params.templateSlug);
    if (job.status !== "estimated" || params.previewSource === "existing" || params.executionMode !== providerMode() || !recipe?.concept) {
      return Response.json({ error: "Only an unconfirmed planning preview can be edited." }, { status: 409 });
    }
    const preparation = await prepareConcept(job.script, params, recipe, id);
    if (request.method === "PATCH") {
      const parsed = settingsSchema.safeParse(JSON.parse((await boundedBody(request, 32768)).toString()));
      if (!parsed.success) throw new Error("Invalid preparation settings.");
      if ("previewVoice" in parsed.data) {
        const voice = parsed.data.previewVoice;
        if (voice !== "silent" && !(await availableLocalVoices()).includes(voice)) throw new Error("This Mac test voice is unavailable.");
        params.previewVoice = voice;
      } else if ("scene" in parsed.data) {
        const { scene, direction } = parsed.data;
        if (!preparation.shots.some((shot) => shot.index === scene)) throw new Error("Unknown scene.");
        params.sceneDirections = { ...params.sceneDirections, [scene]: direction };
      } else if ("resetDirection" in parsed.data) {
        params.sceneDirections = { ...params.sceneDirections };
        delete params.sceneDirections[parsed.data.resetDirection];
      } else {
        params.sceneMedia = { ...params.sceneMedia };
        delete params.sceneMedia[parsed.data.removeScene];
      }
    } else {
      const body = await boundedBody(request, MAX_MEDIA_BYTES + 65536);
      const form = await new Response(body, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
      const shot = Number(form.get("scene")), file = form.get("file");
      if (!Number.isInteger(shot) || !preparation.shots.some((s) => s.index === shot) || !(file instanceof File)) throw new Error("Choose a file and an existing scene.");
      if (file.size > MAX_MEDIA_BYTES) throw new Error("Choose a file smaller than 32 MB.");
      imported = await importSceneMedia(id, Buffer.from(await file.arrayBuffer()));
      params.sceneMedia = { ...params.sceneMedia, [shot]: imported };
    }
    const next = await prepareConcept(job.script, params, recipe, id);
    const changed = await lock.db.update(schema.jobs).set({ params: { ...params, preparation: next } })
      .where(and(eq(schema.jobs.id, id), eq(schema.jobs.status, "estimated"))).returning({ id: schema.jobs.id });
    if (!changed.length) return Response.json({ error: "Production was confirmed while editing. The change was not applied." }, { status: 409 });
    saved = true;
    return Response.json({ preparation: next });
  } catch {
    return Response.json({ error: "Could not save. Check the scene number and direction fields, or use an installed test voice and a supported visual under 32 MB." }, { status: 400 });
  } finally {
    try { if (imported && !saved) await rm(path.join(process.cwd(), "storage/imports", id, mediaFile(imported)), { force: true }); }
    finally { await lock.release(); }
  }
}

export const POST = update;
export const PATCH = update;
