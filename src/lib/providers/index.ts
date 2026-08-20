import type { ProviderSet } from "./types";
import { mockImage, mockVideo, mockTts } from "./mock";
import { higgsfieldImage, higgsfieldVideo, higgsfieldTts } from "./higgsfield";
import { providerMode } from "../sheet";

/**
 * PROVIDER_MODE:
 *  - "mock":       placeholder media, simulated costs (zero API spend)
 *  - "dryrun":     placeholders + production sheet (exact fal.ai requests)
 *  - "higgsfield": REAL media via the Higgsfield MCP on Shimon's subscription —
 *                  temporary testing backend, never shipped to the client
 *  - "fal":        real fal.ai calls (chantier réel, needs FAL_KEY)
 */
export function isMockMode(): boolean {
  const mode = providerMode();
  return mode === "mock" || mode === "dryrun";
}

export function getProviders(): ProviderSet {
  const mode = providerMode();
  if (mode === "mock" || mode === "dryrun") {
    return { image: mockImage, video: mockVideo, tts: mockTts };
  }
  if (mode === "higgsfield") {
    return { image: higgsfieldImage, video: higgsfieldVideo, tts: higgsfieldTts };
  }
  throw new Error(
    "Real fal.ai providers are not wired yet — use PROVIDER_MODE=mock, dryrun or higgsfield.",
  );
}
