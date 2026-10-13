import type { ProductionParams } from "../brain";
import type { ConceptPreparation } from "./preparation";
import { CAM_VOICE } from "./cam-voice";

/** Review/export only: never creates a reservation or authorization. */
export function productionDossier(jobId: string, script: string, params: ProductionParams, preparation: ConceptPreparation) {
  return { version: 1, jobId, preparedAt: new Date().toISOString(), script, format: params.aspectRatio, targetVoice: CAM_VOICE,
    execution: { localPreviewCostUsd: 0, paidGenerationEnabled: false, paidGenerationAuthorized: false, providerQuoteComplete: false },
    recording: preparation.narration ? { ...preparation.narration, alignment: params.narration?.alignment ?? null } : null,
    readiness: preparation.readiness, scenes: preparation.shots, references: preparation.references, quoteWorksheet: preparation.quote,
    reviewHistory: { visuals: params.sceneReviews ?? {}, stages: params.sceneWorkflow ?? {} },
    remainingBeforePaidGeneration: ["Complete, current supplier quotes and cost evidence", "Trusted provider receipt reconciliation", "Explicit spending authorization and a validated real provider run"],
    notes: ["An imported recording's speaker identity is declared by its uploader.", "Local word timing is checked for consistency, not transcribed or acoustically verified.", "Manual estimates are not supplier quotes or customer prices.", "This dossier is a review snapshot and cannot enable paid generation."] };
}
