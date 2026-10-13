import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { withAccess } from "@/lib/access";
import { smallJson } from "@/lib/http";
import { Id, openBrief } from "@/lib/workspace";
type Context = { params: Promise<{ id: string; briefId: string }> };
export const PATCH = withAccess(async (request, { params }: Context) => {
  const { id, briefId } = await params;
  const input = z.object({ title: z.string().trim().min(3).max(160), angle: z.string().trim().min(10).max(6000), script: z.string().max(6000) }).strict().safeParse(await smallJson(request, 64 * 1024).catch(() => null));
  if (!Id.safeParse(id).success || !Id.safeParse(briefId).success || !input.success) return Response.json({ error: "Invalid brief." }, { status: 400 });
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${briefId}, 0))`);
    const [old] = await tx.select().from(schema.campaignBriefs).where(and(eq(schema.campaignBriefs.id, briefId), eq(schema.campaignBriefs.campaignId, id)));
    if (!old) return Response.json({ error: "Brief not found." }, { status: 404 });
    const changed = old.title !== input.data.title || old.angle !== input.data.angle || old.script !== input.data.script;
    if (!changed) return Response.json(old);
    const [brief] = await tx.update(schema.campaignBriefs).set({ ...input.data, updatedAt: new Date() }).where(eq(schema.campaignBriefs.id, briefId)).returning();
    if (brief.conversationId) await tx.insert(schema.messages).values({ conversationId: brief.conversationId, role: "user", content: { type: "brief", text: `Updated brief: ${brief.title}\n\n${brief.angle}${brief.script ? `\n\nNarration draft:\n${brief.script}` : ""}`, script: brief.script, campaignId: id, briefId } });
    return Response.json(brief);
  });
});
export const POST = withAccess(async (_request, { params }: Context) => {
  const { id, briefId } = await params;
  if (!Id.safeParse(id).success || !Id.safeParse(briefId).success) return Response.json({ error: "Invalid brief." }, { status: 400 });
  try { const conversationId = await openBrief(id, briefId); return Response.json({ conversationId, url: `/conversations/${conversationId}` }); }
  catch { return Response.json({ error: "Brief not found." }, { status: 404 }); }
});
