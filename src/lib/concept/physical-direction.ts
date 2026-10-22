import type { SceneDirection } from "./types";

/** Conservative preflight, not a substitute for viewing the two keyframes. */
export function changesState(shot: SceneDirection) {
  // Opening folded hands/arms is a gesture, not an object transformation.
  // Remove only that verb-object phrase; later object changes still need endpoints.
  const motion = shot.motion.replace(/\b(?:of|the|these|those|miniature|government)\s+buildings?\s+(?:models?|miniatures?|facades?|facilities)\b/gi, "architectural props").replace(/\b(?:government|clay|miniature)\s+buildings?\b/gi, "architecture").replace(/\bunfold\w*\s+(?:(?:the|his|her|their|both|its|own)\s+)*(?:hands|arms)\b/gi, "gestures").replace(/\b(?:no|without)\s+(?:\w+\s+)?(?:transformations?|new objects)\b/gi, "");
  return Boolean(shot.stateChange || shot.endScene || /\b(unroll\w*|unfold\w*|reshap\w*|transform\w*|becom\w*|fill\w*|assembl\w*|build(?:s|ing)?|built)\b/i.test(motion)
    || /\bopens?\s+(?:(?:the|a|an|clay|archive|box)\s+)*(?:lid|book|box|scroll)\b/i.test(motion));
}

export function physicalDirectionIssues(shot: SceneDirection): string[] {
  if (!changesState(shot)) return [];
  const issues: string[] = [];
  if (!shot.endScene) issues.push("This action changes an object's state. Describe and approve a distinct end image before animation.");
  else if (shot.scene.trim().toLowerCase() === shot.endScene.trim().toLowerCase()) issues.push("Start and end images describe the same state.");
  if (/\bunroll\w*\b/i.test(shot.motion) && /\b(?:fully|already)\s+(?:unrolled|open)|extends?\s+(?:across|to\s+the\s+floor)/i.test(shot.scene)) issues.push("The scroll is already open in the start image. Begin with a closed roll.");
  if (shot.actionSeconds !== undefined && shot.actionSeconds < 4) issues.push("Allow at least four seconds for a change of state.");
  return issues;
}
