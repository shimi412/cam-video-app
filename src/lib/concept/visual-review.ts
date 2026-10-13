import { z } from "zod";
import { Hash, sha256 } from "./checkpoints";
import { SceneMediaSchema, type SceneMedia } from "./preview-inputs";
import type { ConceptShot } from "./types";
import type { ProductionParams } from "../brain";

export const VisualDecisionSchema = z.object({
  id: z.uuid(), target: Hash, decision: z.enum(["approved", "rejected"]),
  reviewedAt: z.iso.datetime(), note: z.string().max(1000),
}).strict();
export type VisualDecision = z.infer<typeof VisualDecisionSchema>;
export type VisualStatus = "pending" | "approved" | "rejected" | "stale";

/** A decision belongs to these exact bytes AND this scene, never to a filename. */
export function visualTarget(input: {
  jobId: string; scene: number; slot: "import" | "start" | "end";
  media: SceneMedia; context: string; parent?: string;
}) {
  z.uuid().parse(input.jobId); Hash.parse(input.context);
  if (input.slot === "end") Hash.parse(input.parent);
  return sha256(JSON.stringify({ version: 1, jobId: input.jobId, scene: input.scene,
    slot: input.slot, media: SceneMediaSchema.parse(input.media), context: input.context, parent: input.parent ?? null }));
}

export function importedVisualTarget(jobId: string, shot: ConceptShot, params: ProductionParams, references: { id: string; sha256: string }[]) {
  const media = params.sceneMedia?.[shot.index];
  if (!media) return null;
  const context = sha256(JSON.stringify({ template: params.templateSlug, aspectRatio: params.aspectRatio,
    shot, references: references.map(({ id, sha256 }) => ({ id, sha256 })) }));
  return visualTarget({ jobId, scene: shot.index, slot: "import", media, context });
}

export function visualReview(target: string, history: VisualDecision[] = []) {
  const latest = history.at(-1);
  if (!latest) return { target, status: "pending" as VisualStatus, note: "", reviewedAt: null };
  const decision = VisualDecisionSchema.parse(latest);
  return { target, status: decision.target === target ? decision.decision : "stale" as VisualStatus,
    note: decision.target === target ? decision.note : "", reviewedAt: decision.reviewedAt };
}

/** Used before spending on dependent frames/clips. This never authorizes a budget. */
export function requireVisualApproval(target: string, history: VisualDecision[]) {
  if (visualReview(target, history).status !== "approved") throw new Error("Review the current visual before continuing.");
}
