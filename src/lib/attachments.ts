import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Id } from "./workspace";

export const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024;
const root = () => path.join(process.cwd(), "storage/references");
export async function saveAttachment(conversationId: string, label: string, bytes: Buffer) {
  Id.parse(conversationId);
  if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES) throw new Error("Choose a file smaller than 16 MB.");
  const id = randomUUID(), pdf = bytes.toString("ascii", 0, 5) === "%PDF-";
  let normalized = bytes;
  if (!pdf) {
    const source = sharp(bytes, { limitInputPixels: 24_000_000 });
    const meta = await source.metadata();
    if (!["png", "jpeg", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) > 1) throw new Error("Choose a still PNG, JPEG, WebP or PDF.");
    normalized = await source.rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  }
  const file = `${id}.${pdf ? "pdf" : "png"}`, folder = path.join(root(), conversationId);
  await mkdir(folder, { recursive: true }); await writeFile(path.join(folder, file), normalized, { flag: "wx" });
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${conversationId}, 0))`);
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(schema.attachments).where(eq(schema.attachments.conversationId, conversationId));
      if (count >= 30) throw new Error("A conversation can contain up to 30 references.");
      const [item] = await tx.insert(schema.attachments).values({ id, conversationId, label, kind: pdf ? "pdf" : "image", file, size: normalized.length, sha256: createHash("sha256").update(normalized).digest("hex") }).returning();
      return { id: item.id, kind: item.kind, label: item.label, url: `/api/attachments/${item.id}` };
    });
  } catch (error) { await rm(path.join(folder, file), { force: true }); throw error; }
}
export async function readAttachment(item: typeof schema.attachments.$inferSelect) {
  Id.parse(item.id); Id.parse(item.conversationId);
  if (!item.file || !new RegExp(`^${item.id}\\.(png|pdf)$`).test(item.file)) throw new Error("Invalid reference file.");
  const base = await realpath(root()), folder = await realpath(path.join(root(), item.conversationId)), file = await realpath(path.join(folder, item.file));
  if (!folder.startsWith(base + path.sep) || !file.startsWith(folder + path.sep)) throw new Error("Invalid reference location.");
  const bytes = await readFile(file);
  if (createHash("sha256").update(bytes).digest("hex") !== item.sha256) throw new Error("This reference file has changed. Upload it again.");
  return bytes;
}
