import type { ProviderSet } from "./types";
import { mockImage, mockVideo, mockTts } from "./mock";
import { providerMode } from "../sheet";

/**
 * PROVIDER_MODE:
 *  - "mock":   placeholder media, simulated costs (zero API spend)
 *  - "dryrun": placeholders too, plus the production sheet recorded by the
 *              runner — the exact requests fal.ai would receive, to be
 *              reproduced manually on Higgsfield
 *  - "fal":    real fal.ai calls (chantier réel, needs FAL_KEY)
 */
export function isMockMode(): boolean {
  return providerMode() !== "fal";
}

export function getProviders(): ProviderSet {
  const mode = providerMode();
  if (mode === "mock" || mode === "dryrun") {
    return { image: mockImage, video: mockVideo, tts: mockTts };
  }
  throw new Error(
    "Real providers (fal.ai) are not wired yet — keep PROVIDER_MODE=mock or dryrun.",
  );
}
