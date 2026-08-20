/**
 * Seeds the template library (the two launch video models) and dev credits.
 * Idempotent: safe to run several times.
 */
import { db, schema } from "../src/db";

const templates = [
  {
    slug: "cartoon",
    name: "Cartoon",
    description:
      "The script is told by 1-2 stylized cartoon characters with a voice-over. No lip-sync needed: short shots, expressive poses. Recognizable house style.",
    recipe: {
      style:
        "stylized 2D cartoon, bold outlines, flat colors, expressive characters, no text in image",
      pipeline: ["storyboard", "keyframes", "clips", "voice", "montage", "captions"],
      keyframes: { model: "nano-banana-2k", aspectRatio: "16:9" },
      clips: { model: "wan-2.5-720p", tier: "standard", shotSeconds: [3, 5] },
      voice: { style: "warm, engaging narrator", language: "en" },
      montage: { engine: "hyperframes", packaging: "titles + lower-thirds" },
      captions: { style: "bold sans-serif, high contrast" },
    },
  },
  {
    slug: "whiteboard",
    name: "Whiteboard",
    description:
      "Educational, informational tone. The video appears hand-drawn on a whiteboard in motion graphics, Vox-style explanatory collage. Cheapest format: mostly HyperFrames, little generative video.",
    recipe: {
      style:
        "hand-drawn whiteboard illustration, marker strokes, editorial collage, documentary cutouts, no text in image",
      pipeline: ["storyboard", "assets", "voice", "montage", "captions"],
      assets: { model: "nano-banana-2k", aspectRatio: "16:9" },
      clips: { model: "hyperframes-only", tier: "standard" },
      voice: { style: "calm, educational narrator", language: "en" },
      montage: {
        engine: "hyperframes",
        packaging: "progressive draw-on, hand reveals, collage motion",
      },
      captions: { style: "editorial serif accents" },
    },
  },
];

async function main() {
  for (const t of templates) {
    await db
      .insert(schema.templates)
      .values(t)
      .onConflictDoUpdate({
        target: schema.templates.slug,
        set: { name: t.name, description: t.description, recipe: t.recipe },
      });
    console.log(`Template upserted: ${t.slug}`);
  }

  const existing = await db.select().from(schema.creditLedger).limit(1);
  if (existing.length === 0) {
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
      { key: "chat_model", value: "claude-sonnet-5" },
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
