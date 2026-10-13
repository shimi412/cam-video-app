import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { withAccess } from "@/lib/access";
import { smallJson } from "@/lib/http";
export const GET = withAccess(async () => {
  const items = await db.select().from(schema.conversations).orderBy(desc(schema.conversations.createdAt), desc(schema.conversations.id)).limit(100);
  return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
});
export const POST = withAccess(async (request) => {
  const input = z.object({ id: z.uuid(), title: z.string().trim().min(1).max(160) }).strict().safeParse(await smallJson(request).catch(() => null));
  if (!input.success) return Response.json({ error: "Add a conversation title." }, { status: 400 });
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.data.id}, 0))`);
    const [existing] = await tx.select().from(schema.conversations).where(eq(schema.conversations.id, input.data.id));
    if (existing && existing.title !== input.data.title) return Response.json({ error: "This identifier was already used. Reload to create a new conversation." }, { status: 409 });
    const item = existing ?? (await tx.insert(schema.conversations).values(input.data).returning())[0];
    return Response.json(item);
  });
});
