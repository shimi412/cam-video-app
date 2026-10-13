import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { withAccess } from "@/lib/access";
import { smallJson } from "@/lib/http";
import { campaignAngles, CampaignInput } from "@/lib/workspace";
export const GET = withAccess(async () => Response.json({ items: await db.select().from(schema.campaigns).orderBy(desc(schema.campaigns.createdAt)).limit(100) }, { headers: { "Cache-Control": "no-store" } }));
export const POST = withAccess(async (request) => {
  const input = CampaignInput.safeParse(await smallJson(request).catch(() => null));
  if (!input.success) return Response.json({ error: "Complete the title, topic, audience and objective." }, { status: 400 });
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.data.id}, 0))`);
    const [existing] = await tx.select().from(schema.campaigns).where(eq(schema.campaigns.id, input.data.id));
    if (existing) {
      if (["title", "topic", "audience", "objective"].some((key) => existing[key as "title"] !== input.data[key as "title"])) return Response.json({ error: "This identifier was already used for another campaign." }, { status: 409 });
      return Response.json(existing);
    }
    const [campaign] = await tx.insert(schema.campaigns).values(input.data).returning();
    await tx.insert(schema.campaignBriefs).values(campaignAngles(input.data).map((brief) => ({ ...brief, campaignId: campaign.id })));
    return Response.json(campaign);
  });
});
