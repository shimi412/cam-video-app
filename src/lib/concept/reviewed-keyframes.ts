import { materializeRequest, type GenerationOperation } from "./generation-plan";
import { visualTarget, requireVisualApproval, type VisualDecision } from "./visual-review";
import { verifiedSceneMedia } from "./imported-media";
import type { SceneMedia } from "./preview-inputs";

export type KeyframeCandidate = {
  media: SceneMedia; operationFingerprint: string; parentTarget?: string;
  upload: { sha256: string; url: string }; reviews: VisualDecision[];
};

/** Resolve dependent image bindings only from reviewed, byte-verified outputs.
 * Callers must still check final voice, quote and the closed live execution gate. */
export async function materializeReviewedRequest(input: {
  jobId: string; operation: GenerationOperation; operations: GenerationOperation[];
  images: Record<string, KeyframeCandidate>; referenceUrls: Record<string, string>;
}) {
  if (!["image", "video"].includes(input.operation.kind) || !input.operations.some((op) => op.id === input.operation.id && op.fingerprint === input.operation.fingerprint)) throw new Error("Unknown visual operation.");
  const urls = { ...input.referenceUrls };
  const targets = new Map<string, string>();
  const visiting = new Set<string>();
  async function approve(id: string): Promise<string> {
    if (targets.has(id)) return targets.get(id)!;
    if (visiting.has(id)) throw new Error("Cyclic image dependency.");
    visiting.add(id);
    const op = input.operations.find((item) => item.id === id);
    const image = input.images[id];
    if (!op || op.kind !== "image" || op.scene === null || !image || image.operationFingerprint !== op.fingerprint || image.media.kind !== "image") throw new Error("Missing current keyframe.");
    const parents = op.dependsOn.filter((parent) => input.operations.some((item) => item.id === parent && item.kind === "image"));
    if (parents.length > 1) throw new Error("Unexpected keyframe dependencies.");
    const parent = parents.length ? await approve(parents[0]) : undefined;
    if (image.parentTarget !== parent) throw new Error("End frame belongs to a different start image.");
    await verifiedSceneMedia(input.jobId, image.media);
    if (image.upload.sha256 !== image.media.sha256) throw new Error("Uploaded image differs from reviewed bytes.");
    const target = visualTarget({ jobId: input.jobId, scene: op.scene, slot: parent ? "end" : "start", media: image.media, context: op.fingerprint, parent });
    requireVisualApproval(target, image.reviews);
    urls[`output:${id}`] = image.upload.url;
    targets.set(id, target); visiting.delete(id);
    return target;
  }
  // Do not trust caller URLs for prior outputs. Each bound image is resolved above.
  for (const binding of Object.values(input.operation.bindings).flat()) {
    if (binding.startsWith("output:")) { delete urls[binding]; await approve(binding.slice(7)); }
  }
  return materializeRequest(input.operation, urls);
}
