import { actorFor, withAccess } from "@/lib/access";
import { eq, and, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { getBalanceUsd } from "@/lib/credits";
import { z } from "zod";
import { jobWorkerActive } from "@/lib/job-lock";
import { recoveryAllowed, recentlyQueued } from "@/lib/job-recovery";
import { currentDraft } from "@/lib/concept/current-draft";
import { storedVideoUrl } from "@/lib/stored-media";
import { settleCredits } from "@/lib/customer-wallet";

async function handleGET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Invalid production ID." }, { status: 400 });
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  if (!job || job.deletedAt) return Response.json({ error: "Job not found" }, { status: 404 });

  const jobParams = job.params as Record<string, unknown>;
  if(jobParams.filmType==='comics'){
    const {getComic}=await import('@/lib/comics/store');const {publicComic}=await import('@/lib/comics/model');
    try{return Response.json(publicComic(await getComic(id,(await actorFor(_request))!.id)));}catch{return Response.json({error:'Video not found.'},{status:404});}
  }
  if(jobParams.filmType==='motion'){
    const {getMotion}=await import('@/lib/motion/store');
    const {publicMotion}=await import('@/lib/motion/state');
    try{return Response.json(publicMotion(id,await getMotion(id,(await actorFor(_request))!.id)));}
    catch{return Response.json({error:'Video not found.'},{status:404});}
  }
  const current = await currentDraft(job);
  const canResume = recoveryAllowed(job) && !recentlyQueued(job) && !(await jobWorkerActive(id));
  return Response.json({
    id: job.id,
    savedToLibrary: job.savedToLibrary,
    live: jobParams.live === true,
    conversationId: job.conversationId,
    draft: job.status === "estimated" && current.draft ? { ...current.draft, jobId: job.id, preparation: current.preparation } : null,
    canResume,
    interrupted: canResume && job.status !== "failed",
    renderReused: jobParams.renderReused === true,
    preparation: current.preparation,
    execution: jobParams.execution ?? null,
    script: job.script,
    aspectRatio: jobParams.aspectRatio,
    simulation: jobParams.executionMode === "mock" || jobParams.executionMode === "dryrun",
    status: job.status,
    progress: jobParams.progress ?? [],
    estimateUsd: job.estimateUsd ? Number(job.estimateUsd) : null,
    billedUsd: job.billedUsd ? Number(job.billedUsd) : null,
    error: job.error,
    outputUrl: await storedVideoUrl(job.outputPath),
    sheet: jobParams.sheet ?? null,
    sheetUrl: jobParams.sheetUrl ?? null,
    artifacts: jobParams.artifacts ?? [],
    media: jobParams.media ?? null,
    balance: await getBalanceUsd(),
  });
}

export const GET = withAccess(handleGET);

export const PATCH = withAccess(async (request, {params}: {params: Promise<{id:string}>}) => {
 const {id}=await params;
 const body=z.object({title:z.string().trim().min(1).max(80).optional(),savedToLibrary:z.boolean().optional()}).strict().refine(value=>value.title!==undefined||value.savedToLibrary!==undefined).safeParse(await request.json().catch(()=>null));
 if(!z.uuid().safeParse(id).success || !body.success) return Response.json({error:"Invalid video update."},{status:400});
 const [existing]=await db.select({params:schema.jobs.params}).from(schema.jobs).where(eq(schema.jobs.id,id));
 if((existing?.params as {filmType?:string})?.filmType==='comics'){
  try{const {getComic}=await import('@/lib/comics/store');await getComic(id,(await actorFor(request))!.id);if(body.data.title){const {pool}=await import('@/db');await pool.query("UPDATE comics_runs SET state=jsonb_set(state,'{title}',to_jsonb($2::text)) WHERE job_id=$1",[id,body.data.title]);}}catch{return Response.json({error:'Video not found.'},{status:404});}
 }
 if((existing?.params as {filmType?:string})?.filmType==='motion'){
  try{const {getMotion}=await import('@/lib/motion/store');await getMotion(id,(await actorFor(request))!.id);if(body.data.title){const {pool}=await import('@/db');await pool.query("UPDATE motion_runs SET state=jsonb_set(state,'{title}',to_jsonb($2::text)) WHERE job_id=$1",[id,body.data.title]);}}
  catch{return Response.json({error:'Video not found.'},{status:404});}
 }
 const changed=await db.update(schema.jobs).set(body.data).where(and(eq(schema.jobs.id,id),isNull(schema.jobs.deletedAt))).returning({id:schema.jobs.id,title:schema.jobs.title,savedToLibrary:schema.jobs.savedToLibrary});
 return changed.length?Response.json(changed[0]):Response.json({error:"Video not found."},{status:404});
});

/** The client deletes a video in progress from the home page (Shimi, 2026-10-25): soft delete, its reserved
 * hold released, the worker stops at its next read (deleted jobs are never run). Spent holds stay spent. */
export const DELETE = withAccess(async (request, {params}: {params: Promise<{id:string}>}) => {
 const {id}=await params;
 if(!z.uuid().safeParse(id).success) return Response.json({error:"Invalid production ID."},{status:400});
 const [existing]=await db.select({id:schema.jobs.id,params:schema.jobs.params,status:schema.jobs.status}).from(schema.jobs).where(and(eq(schema.jobs.id,id),isNull(schema.jobs.deletedAt)));
 if(!existing) return Response.json({error:"Video not found."},{status:404});
 const filmType=(existing.params as {filmType?:string})?.filmType;
 if(filmType==='comics'){try{const {getComic}=await import('@/lib/comics/store');await getComic(id,(await actorFor(request))!.id);}catch{return Response.json({error:'Video not found.'},{status:404});}}
 if(filmType==='motion'){try{const {getMotion}=await import('@/lib/motion/store');await getMotion(id,(await actorFor(request))!.id);}catch{return Response.json({error:'Video not found.'},{status:404});}}
 await settleCredits(id,false);
 const ended=["succeeded","failed"].includes(existing.status);
 await db.update(schema.jobs).set({deletedAt:new Date(),savedToLibrary:false,...(ended?{}:{status:"failed",error:"Deleted by the client."})}).where(eq(schema.jobs.id,id));
 return Response.json({deleted:true});
});
