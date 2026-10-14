/**
 * Seeds the template library (one template per recipe in src/lib/recipes.ts)
 * and dev settings. Idempotent: safe to run several times. Templates that no
 * longer exist in the recipe library are archived, not deleted (jobs reference them).
 */
import { notInArray } from "drizzle-orm";
import { db, schema } from "../src/db";
import { RECIPES } from "../src/lib/recipes";
import { isSimulation } from "../src/lib/providers/mode";

async function main() {
  const demoCredits = process.argv.includes("--demo-credits");
  if (demoCredits && (process.env.NODE_ENV === "production" || !isSimulation())) throw new Error("Demo credits are only available in offline development.");
  for (const r of RECIPES) {
    const recipe = {
      family: r.family,
      bible: r.bible,
      defaultTone: r.defaultTone,
      voiceId: r.voiceId,
      thumbnail: r.thumbnail,
      concept: r.concept,
    };
    await db
      .insert(schema.templates)
      .values({ slug: r.slug, name: r.name, description: r.description, recipe, status: r.status })
      .onConflictDoUpdate({
        target: schema.templates.slug,
        set: { name: r.name, description: r.description, recipe, status: r.status, updatedAt: new Date() },
      });
    console.log(`Template upserted: ${r.slug}`);
  }

  const slugs = RECIPES.map((r) => r.slug);
  const archived = await db
    .update(schema.templates)
    .set({ status: "archived", updatedAt: new Date() })
    .where(notInArray(schema.templates.slug, slugs))
    .returning({ slug: schema.templates.slug });
  for (const a of archived) console.log(`Template archived: ${a.slug}`);
  const existing = await db.select().from(schema.creditLedger).limit(1);
  if (demoCredits && existing.length === 0) {
    await db.insert(schema.creditLedger).values({
      deltaUsd: "50.00",
      kind: "topup",
      note: "Dev credits (simulated)",
    });
    console.log("Dev credits: +50.00 USD (simulated)");
  }

  await db
    .insert(schema.settings)
    .values([
      { key: "ai_fast_model", value: "deepseek/deepseek-v4.1-flash" },
      { key: "ai_deep_model", value: "anthropic/claude-sonnet-5" },
      { key: "assistant_monthly_usd", value: 25 },
      { key: "margin_multiplier", value: 2.5 },
    ])
    .onConflictDoNothing();

  console.log("Seed done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
