import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { withAccess } from "@/lib/access";
import { Id } from "@/lib/workspace";
import { readAttachment } from "@/lib/attachments";
export const GET = withAccess(async (_request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!Id.safeParse(id).success) return Response.json({ error: "Reference not found." }, { status: 404 });
  const [item] = await db.select().from(schema.attachments).where(eq(schema.attachments.id, id));
  if (!item || item.kind === "link") return Response.json({ error: "Reference not found." }, { status: 404 });
  try {
    const bytes = await readAttachment(item);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": item.kind === "pdf" ? "application/pdf" : "image/png", "Content-Length": String(bytes.length), "Content-Disposition": `${item.kind === "pdf" ? "attachment" : "inline"}; filename="cam-reference-${id}.${item.kind === "pdf" ? "pdf" : "png"}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Content-Security-Policy": "sandbox; default-src 'none'" } });
  } catch { return Response.json({ error: "Reference unavailable or changed. Upload it again." }, { status: 409 }); }
});
