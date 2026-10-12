import type { ProviderSet, VideoGenProvider } from "./types";
import { mockImage, mockVideo, mockTts, mockCutout, mockTranscribe } from "./mock";
import { falImage, falVideo, falTts, falCutout, falTranscribe } from "./fal";
import { runwayVideo } from "./runway";
import { providerMode } from "../sheet";

/**
 * PROVIDER_MODE:
 *  - "mock":       placeholder media, simulated costs (zero API spend)
 *  - "dryrun":     placeholders + production sheet (exact fal.ai requests)
 *  - "fal":        REAL fal.ai calls on the Bina account (default, needs FAL_KEY)
 *
 * VIDEO_PROVIDER (real mode only, default "fal"):
 *  - "runway":     clips go to Runway instead of fal; images, voice, cut-outs and
 *                  timestamps stay on fal, which Runway does not offer.
 *                  Benchmark lane, not the default — see BLUEPRINT.md.
 */
export function isMockMode(): boolean {
  const mode = providerMode();
  return mode === "mock" || mode === "dryrun";
}

export function videoProviderName(): "fal" | "runway" {
  const name = process.env.VIDEO_PROVIDER ?? "fal";
  if (name !== "fal" && name !== "runway") {
    throw new Error(`Unknown VIDEO_PROVIDER "${name}" — use fal or runway.`);
  }
  return name;
}

function realVideoProvider(): VideoGenProvider {
  return videoProviderName() === "runway" ? runwayVideo : falVideo;
}

export function getProviders(): ProviderSet {
  const mode = providerMode();
  if (mode === "mock" || mode === "dryrun") {
    return { image: mockImage, video: mockVideo, tts: mockTts, cutout: mockCutout, transcribe: mockTranscribe };
  }
  if (mode === "fal") {
    return { image: falImage, video: realVideoProvider(), tts: falTts, cutout: falCutout, transcribe: falTranscribe };
  }
  throw new Error(`Unknown PROVIDER_MODE "${mode}" — use mock, dryrun or fal.`);
}
