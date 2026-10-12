import { z } from "zod";
import { db, schema } from "@/db";
import { frameProduction } from "@/lib/brain-llm";
import { estimateProduction } from "@/lib/pricing";
import { getBalanceUsd } from "@/lib/credits";
import { getMarginMultiplier } from "@/lib/settings";
import { getActiveRecipe, activeRecipes, RecipeUnavailableError } from "@/lib/recipes";
import { providerMode, isSimulation } from "@/lib/providers/mode";
import { eq } from "drizzle-orm";

const bodySchema = z.object({
  script: z.string().min(40, "Script too short: paste the full script from your monitoring app.").max(6000),
  mode: z.enum(["auto", "manual"]),
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

export async function POST(request: Request) {
  if (activeRecipes().length === 0) {
    return Response.json({ error: new RecipeUnavailableError().message }, { status: 409 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { script, mode, overrides } = parsed.data;
  if (!isSimulation() && (overrides?.templateSlug ? getActiveRecipe(overrides.templateSlug)?.concept?.previewOnly : activeRecipes().every((r) => r.concept?.previewOnly))) {
    return Response.json({ error: "CAM Clay is currently available for free previews only. Final production is being prepared." }, { status: 409 });
  }
  let framing;
  try { framing = await frameProduction(script, mode, overrides); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to plan this script." }, { status: 400 }); }
  const { analysis, params, brain } = framing;
  const marginMultiplier = await getMarginMultiplier();
  const estimate = estimateProduction(params, marginMultiplier);
  const balance = await getBalanceUsd();

  const [template] = await db
    .select()
    .from(schema.templates)
    .where(eq(schema.templates.slug, params.templateSlug));

  const [conversation] = await db
    .insert(schema.conversations)
    .values({ mode, title: script.slice(0, 60) })
    .returning();

  await db.insert(schema.messages).values({
    conversationId: conversation.id,
    role: "user",
    content: { type: "script", text: script },
  });

  const [job] = await db
    .insert(schema.jobs)
    .values({
      conversationId: conversation.id,
      templateId: template?.id,
      status: "estimated",
      script,
      params: { ...params, executionMode: providerMode() },
      estimateUsd: estimate.totalBilledUsd.toFixed(2),
    })
    .returning();

  await db.insert(schema.messages).values({
    conversationId: conversation.id,
    role: "assistant",
    content: { type: "framing", jobId: job.id, analysis, params, estimate },
  });

  return Response.json({
    jobId: job.id,
    conversationId: conversation.id,
    analysis,
    params,
    template: template ? { slug: template.slug, name: template.name, description: template.description } : null,
    estimate,
    balance,
    brain,
    simulation: isSimulation(),
    canConfirm: isSimulation() || balance >= estimate.totalBilledUsd,
  });
}
