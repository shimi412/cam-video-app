import type { ProviderSet } from "./types";
import { mockImage, mockVideo, mockTts, mockCutout, mockTranscribe } from "./mock";
import { falImage, falVideo, falTts, falCutout, falTranscribe } from "./fal";
import { providerMode } from "../sheet";

/**
 * PROVIDER_MODE:
 *  - "mock":       placeholder media, simulated costs (zero API spend)
 *  - "dryrun":     placeholders + production sheet (exact fal.ai requests)
 *  - "fal":        REAL fal.ai calls on the Bina account (default, needs FAL_KEY)
 */
export function isMockMode(): boolean {
  const mode = providerMode();
  return mode === "mock" || mode === "dryrun";
}

export function getProviders(): ProviderSet {
  const mode = providerMode();
  if (mode === "mock" || mode === "dryrun") {
    return { image: mockImage, video: mockVideo, tts: mockTts, cutout: mockCutout, transcribe: mockTranscribe };
  }
  if (mode === "fal") {
    return { image: falImage, video: falVideo, tts: falTts, cutout: falCutout, transcribe: falTranscribe };
  }
  throw new Error(`Unknown PROVIDER_MODE "${mode}" — use mock, dryrun or fal.`);
}
