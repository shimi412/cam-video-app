import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
export const Hash = z.string().regex(/^[a-f0-9]{64}$/);
export async function readCheckpoint<T>(file: string, schema: z.ZodType<T>): Promise<T | null> {
  try { return schema.parse(JSON.parse(await readFile(file, "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
/** Same-volume atomic replacement, only while the caller owns the job lock. */
export async function saveCheckpoint(file: string, value: unknown, assertOwned: () => Promise<void>) {
  await assertOwned();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, "wx");
    try { await handle.writeFile(JSON.stringify(value, null, 2)); await handle.sync(); }
    finally { await handle.close(); }
    await assertOwned();
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}
