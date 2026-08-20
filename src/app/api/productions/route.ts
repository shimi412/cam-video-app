import { z } from "zod";
import { db, schema } from "@/db";
import { frameProduction } from "@/lib/brain-llm";
import { estimateProduction } from "@/lib/pricing";
import { getBalanceUsd } from "@/lib/credits";
import { getMarginMultiplier } from "@/lib/settings";
import { eq } from "drizzle-orm";

const bodySchema = z.object({
  script: z.string().min(40, "Script too short: paste the full script from your monitoring app."),
  mode: z.enum(["auto", "manual"]),
  overrides: z
    .object({
      templateSlug: z.enum(["cartoon", "whiteboard"]).optional(),
      tone: z.enum(["serious", "energetic", "calm"]).optional(),
      tier: z.enum(["standard", "premium"]).optional(),
      voiceId: z.string().optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { script, mode, overrides } = parsed.data;

  const { analysis, params, brain } = await frameProduction(script, mode, overrides);
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
      params: { ...params },
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
    canConfirm: balance >= estimate.totalBilledUsd,
  });
}
