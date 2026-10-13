import { verifiedSceneMedia } from "./imported-media";
import type { WorkflowView, Stage } from "./scene-workflow";

export async function verifyWorkflowFiles(jobId: string, view: WorkflowView, through: Stage = "clip", includeCurrent = true) {
  for (const step of view.stages) {
    if (step.stage === through && !includeCurrent) break;
    if (step.media && step.required && (step.status === "approved" || step.stage === through)) await verifiedSceneMedia(jobId, step.media);
    if (step.stage === through) break;
  }
}
