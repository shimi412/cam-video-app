import { after } from "next/server";
import { z } from "zod";
import { withAccess } from "@/lib/access";
import { exportView, getExportJob, queueExports, runExports } from "@/lib/format-exports";
type Context = { params: Promise<{ id: string }> };
export const GET = withAccess(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Invalid production ID." }, { status: 400 });
  const job = await getExportJob(id);
  if (!job) return Response.json({ error: "Production not found." }, { status: 404 });
  return Response.json(await exportView(job), { headers: { "Cache-Control": "no-store" } });
});
export const POST = withAccess(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Invalid production ID." }, { status: 400 });
  try {
    const started = await queueExports(id);
    if (started && !(process.env.CAM_LIVE_ENABLED === "1" && process.env.PROVIDER_MODE === "fal")) after(() => runExports(id));
    return Response.json({ started }, { status: 202 });
  } catch { return Response.json({ error: "Complete a CAM Clay preview with its original files before exporting." }, { status: 409 }); }
});
