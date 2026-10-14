import { withAccess } from "@/lib/access";
import { z } from "zod";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { isSimulation, providerMode } from "@/lib/providers/mode";
import { storedVideoUrl } from "@/lib/stored-media";

const Query = z.object({ q: z.string().trim().max(120).default(""), status: z.enum(["all", "estimated", "confirmed", "running", "succeeded", "failed"]).default("all"), cursor: z.uuid().optional() }).strict();

/** One authenticated CAM workspace. Offline and connected catalogues stay separate. */
async function handleGET(request: Request) {
  const query = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return Response.json({ error: "Invalid search or production filter." }, { status: 400 });
  const { q, status, cursor } = query.data, jobs = schema.jobs;
  const escaped = q.replace(/[\\%_]/g, (character) => `\\${character}`);
  const rows = await db.select({ id: jobs.id, status: jobs.status, script: sql<string>`left(${jobs.script}, 160)`, createdAt: jobs.createdAt, billedUsd: jobs.billedUsd, outputPath: jobs.outputPath,
    aspectRatio: sql<string | null>`${jobs.params}->>'aspectRatio'`, previewSource: sql<string | null>`${jobs.params}->>'previewSource'`,
    imported: sql<string | null>`${jobs.params}->>'useImportedNarration'`, previewVoice: sql<string | null>`${jobs.params}->>'previewVoice'`,
    live: sql<string | null>`${jobs.params}->>'live'`,
    duration: sql<string | null>`coalesce(${jobs.params}->>'finalDurationSeconds',${jobs.params}->'preparation'->>'durationSeconds')` })
    .from(jobs).where(and(
      sql`${jobs.params}->>'executionMode' = ${providerMode()}`,
      isSimulation() ? undefined : sql`${jobs.params}->>'live' = 'true'`,
      sql`${jobs.params}->>'templateSlug' = 'cam-clay'`,
      status === "all" ? undefined : eq(jobs.status, status), q ? ilike(jobs.script, `%${escaped}%`) : undefined,
      cursor ? sql`(${jobs.createdAt}, ${jobs.id}) < (select created_at, id from jobs where id = ${cursor})` : undefined,
    )).orderBy(desc(jobs.createdAt), desc(jobs.id)).limit(25);
  const page = rows.slice(0, 24);
  return Response.json({ mode: isSimulation()?"local":"connected", items: await Promise.all(page.map(async (row) => {
    return { id: row.id, status: row.status, title: row.script, createdAt: row.createdAt.toISOString(), aspectRatio: row.aspectRatio,
      live: row.live === "true", duration: row.duration ? Number(row.duration) : null, voice: row.live === "true" ? "Bram" : row.previewSource === "existing" ? "Original Dylan" : row.imported === "true" ? "Imported recording" : row.previewVoice && row.previewVoice !== "silent" ? "Mac test voice" : "Silent preview",
      billedUsd: row.billedUsd === null && row.live === "true" ? null : Number(row.billedUsd ?? 0), url: row.live === "true" ? `/production/${row.id}` : `/?job=${row.id}`, outputUrl: row.status === "succeeded" ? await storedVideoUrl(row.outputPath) : null };
  })), nextCursor: rows.length > 24 ? page.at(-1)!.id : null }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withAccess(handleGET);
