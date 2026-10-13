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
import { randomUUID } from "node:crypto";
import { verifiedSceneMedia } from "@/lib/concept/imported-media";
import { Hash } from "@/lib/concept/checkpoints";
import { Stage, attachStage, reviewStage, sceneWorkflow } from "@/lib/concept/scene-workflow";
import { planConcept } from "@/lib/concept/storyboard";
import { importedVisualTarget } from "@/lib/concept/visual-review";
import { verifyWorkflowFiles } from "@/lib/concept/workflow-files";

const settingsSchema = z.union([
  z.object({ previewVoice: PreviewVoiceSchema }).strict(),
  z.object({ removeScene: z.number().int().min(1).max(36) }).strict(),
  z.object({ scene: z.number().int().min(1).max(36), direction: DirectionSchema }).strict(),
  z.object({ resetDirection: z.number().int().min(1).max(36) }).strict(),
  z.object({ reviewScene: z.number().int().min(1).max(36), target: Hash,
    decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(1000),
  }).strict().refine((v) => v.decision !== "rejected" || Boolean(v.note)),
  z.object({ workflow: z.object({ scene: z.number().int().min(1).max(36), stage: Stage, target: Hash,
    decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(1000) }).strict()
    .refine((v) => v.decision !== "rejected" || Boolean(v.note)) }).strict(),
  z.object({ useAnimation: z.number().int().min(1).max(36), target: Hash }).strict(),
]);

function detachWorkflowPreview(params: ProductionParams, scene: number) {
  if (!params.sceneMediaWorkflow?.[scene]) return;
  params.sceneMedia = { ...params.sceneMedia }; delete params.sceneMedia[scene];
  params.sceneMediaWorkflow = { ...params.sceneMediaWorkflow }; delete params.sceneMediaWorkflow[scene];
}

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
    const board = planConcept(job.script, recipe, params.aspectRatio, params.sceneDirections);
    const stageContext = (scene: number) => {
      const shot = board.shots.find((s) => s.index === scene);
      if (!shot) throw new Error("Unknown scene.");
      return { jobId: id, shot, params, references: preparation.references };
    };
    if (request.method === "PATCH") {
      const parsed = settingsSchema.safeParse(JSON.parse((await boundedBody(request, 32768)).toString()));
      if (!parsed.success) throw new Error("Invalid preparation settings.");
      if ("workflow" in parsed.data) {
        const action = parsed.data.workflow, context = stageContext(action.scene);
        const step = sceneWorkflow(context).stages.find((s) => s.stage === action.stage)!;
        if (!step.canReview || !step.required || step.target !== action.target) return Response.json({ error: "This step or its previous approval changed. Reload the scene before reviewing." }, { status: 409 });
        if (action.decision === "approved") await verifyWorkflowFiles(id, sceneWorkflow(context), action.stage);
        const state = reviewStage(context, action);
        if (JSON.stringify(state) !== JSON.stringify(params.sceneWorkflow?.[action.scene])) detachWorkflowPreview(params, action.scene);
        params.sceneWorkflow = { ...params.sceneWorkflow, [action.scene]: state };
      } else if ("useAnimation" in parsed.data) {
        const scene = parsed.data.useAnimation, context = stageContext(scene);
        const step = sceneWorkflow(context).stages.find((s) => s.stage === "clip")!;
        if (step.status !== "approved" || !step.media || step.target !== parsed.data.target) throw new Error("Review the current animation first.");
        await verifyWorkflowFiles(id, sceneWorkflow(context));
        const verified = await verifiedSceneMedia(id, step.media);
        if (params.sceneMediaWorkflow?.[scene] !== step.target) {
          if ((params.sceneReviews?.[scene]?.length ?? 0) >= 500) throw new Error("Visual review history is full.");
          params.sceneMedia = { ...params.sceneMedia, [scene]: verified.media };
          params.sceneMediaWorkflow = { ...params.sceneMediaWorkflow, [scene]: step.target };
          const target = importedVisualTarget(id, context.shot, params, preparation.references)!;
          params.sceneReviews = { ...params.sceneReviews, [scene]: [...(params.sceneReviews?.[scene] ?? []), {
            id: randomUUID(), target, decision: "approved", note: "Reviewed animation selected for the free preview.", reviewedAt: new Date().toISOString(),
          }] };
        }
      } else if ("reviewScene" in parsed.data) {
        const { reviewScene, target, decision, note } = parsed.data;
        const shot = preparation.shots.find((s) => s.index === reviewScene);
        if (!shot?.media || shot.review?.target !== target) return Response.json({ error: "This visual or scene changed. Reload it before reviewing." }, { status: 409 });
        if (params.sceneMediaWorkflow?.[reviewScene] && decision === "approved") {
          const view = sceneWorkflow(stageContext(reviewScene)), clip = view.stages.find((s) => s.stage === "clip")!;
          if (clip.status !== "approved" || clip.target !== params.sceneMediaWorkflow[reviewScene]) return Response.json({ error: "The animation's earlier approvals changed. Review its scene steps and select the animation again." }, { status: 409 });
          await verifyWorkflowFiles(id, view);
        }
        await verifiedSceneMedia(id, shot.media);
        const history = params.sceneReviews?.[reviewScene] ?? [];
        if (history.length >= 500) throw new Error("Visual review history is full.");
        // The job lock serializes review, replacement and confirmation. Repeated
        // browser delivery is idempotent; a new decision preserves the old one.
        const last = history.at(-1);
        if (last?.target !== target || last.decision !== decision || last.note !== note) {
          params.sceneReviews = { ...params.sceneReviews, [reviewScene]: [...history,
            { id: randomUUID(), target, decision, note, reviewedAt: new Date().toISOString() }] };
        }
      } else if ("previewVoice" in parsed.data) {
        const voice = parsed.data.previewVoice;
        if (voice !== "silent" && !(await availableLocalVoices()).includes(voice)) throw new Error("This Mac test voice is unavailable.");
        params.previewVoice = voice;
        params.useImportedNarration = false;
      } else if ("scene" in parsed.data) {
        const { scene, direction } = parsed.data;
        if (!preparation.shots.some((shot) => shot.index === scene)) throw new Error("Unknown scene.");
        params.sceneDirections = { ...params.sceneDirections, [scene]: direction };
      } else if ("resetDirection" in parsed.data) {
        params.sceneDirections = { ...params.sceneDirections };
        delete params.sceneDirections[parsed.data.resetDirection];
      } else {
        detachWorkflowPreview(params, parsed.data.removeScene);
        params.sceneMedia = { ...params.sceneMedia };
        delete params.sceneMedia[parsed.data.removeScene];
      }
    } else {
      const body = await boundedBody(request, MAX_MEDIA_BYTES + 65536);
      const form = await new Response(body, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
      const shot = Number(form.get("scene")), file = form.get("file");
      if (!Number.isInteger(shot) || !preparation.shots.some((s) => s.index === shot) || !(file instanceof File)) throw new Error("Choose a file and an existing scene.");
      if (file.size > MAX_MEDIA_BYTES) throw new Error("Choose a file smaller than 32 MB.");
      const stage = form.get("stage");
      if (stage !== null) {
        const kind = Stage.exclude(["direction"]).parse(stage), target = Hash.parse(form.get("target"));
        const context = stageContext(shot);
        const step = sceneWorkflow(context).stages.find((s) => s.stage === kind)!;
        if (step.uploadTarget !== target || !step.required) return Response.json({ error: "The previous step changed. Reload and approve it before importing." }, { status: 409 });
        await verifyWorkflowFiles(id, sceneWorkflow(context), kind, false);
        imported = await importSceneMedia(id, Buffer.from(await file.arrayBuffer()));
        const state = attachStage(context, kind, target, imported);
        detachWorkflowPreview(params, shot);
        params.sceneWorkflow = { ...params.sceneWorkflow, [shot]: state };
      } else {
        imported = await importSceneMedia(id, Buffer.from(await file.arrayBuffer()));
        detachWorkflowPreview(params, shot);
        params.sceneMedia = { ...params.sceneMedia, [shot]: imported };
      }
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
