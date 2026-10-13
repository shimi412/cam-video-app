import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { withAccess } from "@/lib/access";
import { boundedBody, smallJson } from "@/lib/http";
import { conversationExists, ReferenceLink } from "@/lib/workspace";
import { MAX_ATTACHMENT_BYTES, saveAttachment } from "@/lib/attachments";
export const POST = withAccess(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!await conversationExists(id)) return Response.json({ error: "Conversation not found." }, { status: 404 });
  try {
    if (request.headers.get("content-type")?.split(";")[0] === "application/json") {
      const input = z.object({ label: z.string().trim().min(1).max(160), url: ReferenceLink }).strict().parse(await smallJson(request));
      return await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`);
        const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(schema.attachments).where(eq(schema.attachments.conversationId, id));
        if (count >= 30) throw new Error("A conversation can contain up to 30 references.");
        const [item] = await tx.insert(schema.attachments).values({ conversationId: id, kind: "link", ...input }).returning();
        return Response.json({ id: item.id, label: item.label, kind: item.kind, url: item.url });
      });
    }
    const label = z.string().trim().min(1).max(160).parse(new URL(request.url).searchParams.get("label"));
    return Response.json(await saveAttachment(id, label, await boundedBody(request, MAX_ATTACHMENT_BYTES)));
  } catch { return Response.json({ error: "Reference not saved. Use a still PNG, JPEG, WebP or PDF under 16 MB, or a valid HTTPS link. Maximum 30 references per conversation." }, { status: 400 }); }
});
