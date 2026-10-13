import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ProductionParams } from "../brain";
import type { ConceptShot } from "./types";
import { Hash, sha256 } from "./checkpoints";
import { SceneMediaSchema, sceneMediaUrl, type SceneMedia } from "./preview-inputs";
import { VisualDecisionSchema, visualReview, type VisualDecision } from "./visual-review";

export const Stage = z.enum(["direction", "start", "end", "clip"]);
export type Stage = z.infer<typeof Stage>;
const Candidate = z.object({ media: SceneMediaSchema, parent: Hash, source: z.literal("local-import") });
export const WorkflowSchema = z.object({
  direction: z.array(VisualDecisionSchema).max(500).default([]),
  start: Candidate.optional(), end: Candidate.optional(), clip: Candidate.optional(),
  reviews: z.object({ start: z.array(VisualDecisionSchema).max(500), end: z.array(VisualDecisionSchema).max(500), clip: z.array(VisualDecisionSchema).max(500) }).default({ start: [], end: [], clip: [] }),
});
export type SceneWorkflow = z.infer<typeof WorkflowSchema>;
type Context = { jobId: string; shot: ConceptShot; params: ProductionParams; references: { id: string; sha256: string }[] };

/** Approval IDs form a chain: withdrawing/replacing an earlier approval makes
 * downstream work stale even when the same file is later approved again. */
export function sceneWorkflow(context: Context) {
  const { jobId, shot, params, references } = context;
  const stored = WorkflowSchema.parse(params.sceneWorkflow?.[shot.index] ?? {});
  const directionTarget = sha256(JSON.stringify({ version: 1, jobId, shot, format: params.aspectRatio, template: params.templateSlug, references: references.map(({ id, sha256 }) => ({ id, sha256 })) }));
  const directionReview = visualReview(directionTarget, stored.direction);
  const direction = { stage: "direction" as Stage, required: true, target: directionTarget, uploadTarget: null as string | null, canReview: true,
    status: directionReview.status as string, note: directionReview.note, media: null as (SceneMedia & { url: string }) | null,
    blockedReason: null as string | null, token: directionReview.status === "approved" ? stored.direction.at(-1)!.id : null as string | null };
  const stages = [direction];
  let parentToken = direction.token;
  for (const stage of ["start", "end", "clip"] as const) {
    const required = stage !== "end" || Boolean(shot.endImagePrompt);
    const candidate = stored[stage];
    const parent = parentToken ? sha256(JSON.stringify({ directionTarget, stage, parentToken })) : null;
    const target = candidate && parent ? sha256(JSON.stringify({ version: 1, jobId, scene: shot.index, stage, parent, media: candidate.media })) : null;
    const current = Boolean(required && candidate && parent && candidate.parent === parent);
    const review = target ? visualReview(target, stored.reviews[stage]) : null;
    const status = !required ? "not-needed" : candidate && !current ? "stale" : !parent ? "blocked" : !candidate ? "missing" : review!.status;
    const token = status === "approved" ? stored.reviews[stage].at(-1)!.id : null;
    stages.push({ stage, required, target: target ?? directionTarget, uploadTarget: required ? parent : null, canReview: current,
      status, note: current ? review?.note ?? "" : "", media: candidate ? { ...candidate.media, url: sceneMediaUrl(jobId, candidate.media) } : null,
      blockedReason: !required ? "No end image is needed for this scene." : !parent ? "Approve the previous step first." : candidate && !current ? "An earlier approval changed. Replace this file for the current scene." : null,
      token });
    if (required) parentToken = token;
  }
  return { scene: shot.index, stages, completed: stages.filter((s) => s.required && s.status === "approved").length,
    required: stages.filter((s) => s.required).length, paidGenerationAuthorized: false as const };
}
export type WorkflowView = ReturnType<typeof sceneWorkflow>;

function append(history: VisualDecision[], target: string, decision: "approved" | "rejected", note: string) {
  const last = history.at(-1);
  // A repeated approval of the same target is not a new parent revision.
  if (last?.target === target && last.decision === decision && last.note === note) return history;
  if (history.length >= 500) throw new Error("Review history is full.");
  return [...history, { id: randomUUID(), target, decision, note, reviewedAt: new Date().toISOString() }];
}
export function reviewStage(context: Context, action: { stage: Stage; target: string; decision: "approved" | "rejected"; note: string }) {
  const step = sceneWorkflow(context).stages.find((s) => s.stage === action.stage)!;
  if (!step.required || !step.canReview || step.target !== action.target) throw new Error("This step changed or its previous step is not approved. Reload the scene.");
  const state = WorkflowSchema.parse(context.params.sceneWorkflow?.[context.shot.index] ?? {});
  const history = action.stage === "direction" ? state.direction : state.reviews[action.stage];
  const decisions = append(history, action.target, action.decision, action.note);
  if (action.stage === "direction") state.direction = decisions; else state.reviews[action.stage] = decisions;
  return state;
}
export function attachStage(context: Context, stage: Exclude<Stage, "direction">, target: string, media: SceneMedia) {
  const step = sceneWorkflow(context).stages.find((s) => s.stage === stage)!;
  if (!step.required || !step.uploadTarget || step.uploadTarget !== target) throw new Error("Approve the previous step before importing this file.");
  if (media.kind !== (stage === "clip" ? "video" : "image")) throw new Error(stage === "clip" ? "Use an MP4 animation." : "Use a still image for this step.");
  const state = WorkflowSchema.parse(context.params.sceneWorkflow?.[context.shot.index] ?? {});
  state[stage] = { media, parent: target, source: "local-import" };
  return state;
}
