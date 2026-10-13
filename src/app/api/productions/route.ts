import { withAccess } from "@/lib/access";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { db, schema } from "@/db";
import { frameProduction } from "@/lib/brain-llm";
import { estimateProduction } from "@/lib/pricing";
import { getBalanceUsd } from "@/lib/credits";
import { getMarginMultiplier } from "@/lib/settings";
import { getActiveRecipe, activeRecipes, RecipeUnavailableError } from "@/lib/recipes";
import { providerMode, isSimulation } from "@/lib/providers/mode";
import { eq, sql } from "drizzle-orm";
import { assertExistingSelection, existingParams, verifyExistingAssets, existingMediaSummary } from "@/lib/concept/existing";
import { prepareConcept } from "@/lib/concept/preparation";
import { smallJson } from "@/lib/http";
import { conversationExists } from "@/lib/workspace";

const bodySchema = z.object({
  conversationId: z.uuid().optional(),
  requestId: z.uuid().optional(),
  parentJobId: z.uuid().optional(),
  script: z.string().min(40, "Script too short: paste the full script from your monitoring app.").max(6000),
  mode: z.enum(["auto", "manual"]),
  previewSource: z.enum(["planning", "existing"]).default("planning"),
  overrides: z
    .object({
      templateSlug: z
        .string()
        .refine((s) => Boolean(getActiveRecipe(s)), "This video model is unavailable")
        .optional(),
      tone: z.enum(["serious", "energetic", "calm"]).optional(),
      tier: z.enum(["standard", "premium"]).optional(),
      voiceId: z.string().optional(),
      aspectRatio: z.enum(["9:16", "16:9", "1:1"]).optional(),
    })
    .optional(),
});

async function handlePOST(request: Request) {
  if (activeRecipes().length === 0) {
    return Response.json({ error: new RecipeUnavailableError().message }, { status: 409 });
  }
  const parsed = bodySchema.safeParse(await smallJson(request).catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { script, mode, overrides, previewSource, conversationId, requestId, parentJobId } = parsed.data;
  const requestHash = createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex");
  const replay = (job: typeof schema.jobs.$inferSelect) => {
    const saved = job.params as Record<string, unknown>;
    if (saved.originRequestHash !== requestHash) return Response.json({ error: "This request identifier was already used. Reload before submitting a changed request." }, { status: 409 });
    return Response.json({ ...(saved.draft as Record<string, unknown>), jobId: job.id, preparation: saved.preparation, replayed: true });
  };
  if (requestId) { const [existing] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, requestId)); if (existing) return replay(existing); }
  if (conversationId && !await conversationExists(conversationId)) return Response.json({ error: "Conversation not found." }, { status: 404 });
  if (parentJobId) {
    const [parent] = await db.select({ conversationId: schema.jobs.conversationId }).from(schema.jobs).where(eq(schema.jobs.id, parentJobId));
    if (!conversationId || parent?.conversationId !== conversationId) return Response.json({ error: "The source video must belong to this conversation." }, { status: 400 });
  }
  if (previewSource === "existing") {
    try {
      assertExistingSelection(script, { templateSlug: overrides?.templateSlug ?? "cam-clay", aspectRatio: overrides?.aspectRatio ?? "9:16" });
      await verifyExistingAssets();
    } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Existing media unavailable." }, { status: 409 }); }
  }
  if (!isSimulation() && (overrides?.templateSlug ? getActiveRecipe(overrides.templateSlug)?.concept?.previewOnly : activeRecipes().every((r) => r.concept?.previewOnly))) {
    return Response.json({ error: "CAM Clay is currently available for free previews only. Final production is being prepared." }, { status: 409 });
  }
  let framing;
  try { framing = await frameProduction(script, mode, overrides); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to plan this script." }, { status: 400 }); }
  const { analysis, brain } = framing;
  const params = previewSource === "existing" ? existingParams(framing.params) : { ...framing.params, previewSource };
  if (previewSource === "existing") {
    analysis.durationSeconds = params.durationSeconds;
    analysis.reason = "Reuse the existing CAM film with its recorded Dylan voice and 12 animated clips. Local montage, no new generation.";
  }
  const recipe = getActiveRecipe(params.templateSlug)!;
  const jobId = requestId ?? randomUUID();
  let preparation = null;
  if (recipe.concept && previewSource === "planning") {
    try { preparation = await prepareConcept(script, params, recipe, jobId); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to prepare this script." }, { status: 409 }); }
    params.durationSeconds = preparation.durationSeconds;
    analysis.durationSeconds = preparation.durationSeconds;
  }
  const marginMultiplier = await getMarginMultiplier();
  const estimate = estimateProduction(params, marginMultiplier);
  const balance = await getBalanceUsd();

  const [template] = await db
    .select()
    .from(schema.templates)
    .where(eq(schema.templates.slug, params.templateSlug));

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${jobId}, 0))`);
    const [existing] = await tx.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    if (existing) return replay(existing);
    const conversation = conversationId ? { id: conversationId } : (await tx.insert(schema.conversations).values({ mode, title: script.slice(0, 60) }).returning())[0];
    const draft = {
      conversationId: conversation.id, analysis, params,
      template: template ? { slug: template.slug, name: template.name, description: template.description } : null,
      estimate, balance, brain, simulation: isSimulation(),
      media: previewSource === "existing" ? existingMediaSummary() : null,
      canConfirm: isSimulation() || (!estimate.unpriced?.length && balance >= estimate.totalBilledUsd),
    };
    await tx.insert(schema.messages).values({ conversationId: conversation.id, role: "user", content: { type: "script", text: script, parentJobId } });
    const [job] = await tx.insert(schema.jobs).values({
      id: jobId, conversationId: conversation.id, templateId: template?.id, status: "estimated", script,
      params: { ...params, executionMode: providerMode(), preparation, draft, originRequestHash: requestHash, parentJobId },
      estimateUsd: estimate.totalBilledUsd.toFixed(2),
    }).returning();
    await tx.insert(schema.messages).values({ conversationId: conversation.id, role: "assistant", content: { type: "framing", jobId: job.id, analysis, params, estimate } });
    return Response.json({ ...draft, jobId: job.id, preparation });
  });
}

export const POST = withAccess(handlePOST);
