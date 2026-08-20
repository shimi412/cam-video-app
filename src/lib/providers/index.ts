import type { ProviderSet } from "./types";
import { mockImage, mockVideo, mockTts } from "./mock";

/**
 * MOCK_MODE=true (the local default) keeps every external call simulated.
 * The real fal.ai provider set arrives with chantier 3 and is only used
 * when MOCK_MODE=false AND the API keys are present.
 */
export function isMockMode(): boolean {
  return process.env.MOCK_MODE !== "false";
}

export function getProviders(): ProviderSet {
  if (isMockMode()) {
    return { image: mockImage, video: mockVideo, tts: mockTts };
  }
  throw new Error(
    "Real providers (fal.ai) are not wired yet — chantier 3. Keep MOCK_MODE=true.",
  );
}
