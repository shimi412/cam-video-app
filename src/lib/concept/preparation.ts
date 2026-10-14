import type { ProductionParams } from "../brain";
import type { Recipe } from "../recipes";
import { planConcept } from "./storyboard";
import { placeholderTiming } from "./timing";
import { lockedAssets } from "./assets";
import { LOCAL_VOICES, sceneMediaUrl, type PreviewVoice } from "./preview-inputs";
import type { ConceptTiming } from "./types";
import { camVoiceReference } from "./cam-voice";
import { generationPlan } from "./generation-plan";
import { DEMO_SCRIPT } from "./existing";
import { normalizedText } from "./text";
import { importedVisualTarget, visualReview } from "./visual-review";
import { sceneWorkflow } from "./scene-workflow";
import { prepareQuote } from "./quote-preparation";
import { narrationView, selectedNarration } from "./narration";

/** A reviewable, free preparation, never an approval to generate media. */
export async function prepareConcept(script: string, params: ProductionParams, recipe: Recipe, jobId?: string, measuredTiming?: ConceptTiming) {
  const board = planConcept(script, recipe, params.aspectRatio, params.sceneDirections);
  const phrases = board.shots.map((shot) => shot.narration);
  const narration = jobId ? await narrationView(jobId, phrases, params) : null;
  const selected = jobId && narration?.selected && narration.canUse ? await selectedNarration(jobId, phrases, params) : null;
  const timing = measuredTiming ?? selected?.timing ?? placeholderTiming(phrases);
  const references = await lockedAssets();
  const preview: PreviewVoice = params.previewVoice ?? "silent";
  const plan = generationPlan(script, params, board, timing, references, selected?.evidence);
  const workflows = jobId ? board.shots.map((shot) => sceneWorkflow({ jobId, shot, params, references })) : [];
  const preparation = {
    version: 1 as const,
    source: board.source,
    durationSeconds: timing.duration,
    measuredScenes: Boolean(measuredTiming || selected),
    wordTiming: selected ? "operator-supplied" as const : "estimated" as const,
    narration,
    canGenerate: false as const,
    quote: jobId ? prepareQuote(jobId, plan, workflows, params) : null,
    voice: { status: selected ? "import-reviewed" as const : "identity-verified" as const, name: selected ? `Imported ${selected.narration.speaker === "bram" ? "Bram (declared)" : "recording"}` : preview === "silent" ? "Bram" : LOCAL_VOICES[preview].name, preview,
      cam: await camVoiceReference(),
      message: selected ? "The reviewed imported recording will be used unchanged. Its word timings were supplied and reviewed locally; the speaker identity is declared by the uploader, not verified by the app." : preview === "silent" ? "Bram's exact preset has been identified. A new reading still needs a paid generation and review. This free preview will be silent."
        : `${LOCAL_VOICES[preview].name} is a free Mac test voice. Bram is the CAM reference voice; a new reading still needs generation and review. Scene lengths follow the test voice; subtitle word positions are approximate.` },
    generation: { fingerprint: plan.fingerprint, operations: plan.operations.length, images: plan.operations.filter((op) => op.kind === "image").length,
      clips: plan.operations.filter((op) => op.kind === "video").length, reusedScenes: plan.reusedScenes.length, reusedVoice: Boolean(plan.reusedVoice), blockers: plan.blockers,
      downloadUrl: jobId ? `/api/jobs/${jobId}/generation-plan` : null },
    references: references.map(({ id, url, sha256 }) => ({ id, url, sha256 })),
    shots: board.shots.map((shot, i) => ({
      index: shot.index, narration: shot.narration, scene: shot.scene, motion: shot.motion,
      endScene: shot.endScene, overlay: shot.overlay, strike: shot.strike,
      visualMode: shot.visualMode, metaphor: shot.metaphor, stateChange: shot.stateChange, actionSeconds: shot.actionSeconds, breathBefore: shot.breathBefore,
      references: shot.references, start: timing.phrases[i].start, end: timing.phrases[i].end,
      estimatedClipSeconds: shot.clipSeconds,
      workflow: workflows.find((w) => w.scene === shot.index) ?? null,
      media: jobId && params.sceneMedia?.[shot.index] ? { ...params.sceneMedia[shot.index], url: sceneMediaUrl(jobId, params.sceneMedia[shot.index]) } : null,
      review: jobId && params.sceneMedia?.[shot.index] ? visualReview(importedVisualTarget(jobId, shot, params, references)!, params.sceneReviews?.[shot.index]) : null,
      editorialStatus: params.sceneDirections?.[shot.index] ? "edited-draft" as const : normalizedText(script) === normalizedText(DEMO_SCRIPT) ? "example-plan" as const : "suggested-draft" as const,
    })),
  };
  const previewBlockers = [
    ...(narration?.selected && !narration.canUse ? ["Review the selected recording and word timings again"] : []),
    ...preparation.shots.filter((s) => s.media && s.review?.status !== "approved").map((s) => `Review the visual for scene ${s.index}`),
    ...preparation.shots.filter((s) => params.sceneMediaWorkflow?.[s.index] && s.workflow?.stages.find((w) => w.stage === "clip")?.status !== "approved").map((s) => `Review the earlier steps for animation ${s.index}`),
  ];
  const missingScenes = preparation.shots.filter((s) => !s.media).map((s) => s.index);
  return { ...preparation, readiness: { canPreview: previewBlockers.length === 0, previewBlockers, missingScenes,
    completeLocalInputs: Boolean(selected) && !missingScenes.length && !previewBlockers.length,
    paidGenerationEnabled: false as const, dossierUrl: jobId ? `/api/jobs/${jobId}/dossier` : null } };
}
export type ConceptPreparation = Awaited<ReturnType<typeof prepareConcept>>;
