/**
 * Price estimation shown to the client BEFORE launch (mandatory confirmation).
 * Unit costs = real fal.ai prices (verified 2026-08-20), times the admin margin.
 * The client sees dollars per line item, never tokens.
 */
import type { ProductionParams } from "./brain";
import { billedFromRealCost } from "./credits";

export type EstimateLine = {
  label: string;
  quantity: number;
  realUnitUsd: number;
  billedUsd: number;
};

export type Estimate = {
  lines: EstimateLine[];
  unpriced?: string[];
  totalRealUsd: number;
  totalBilledUsd: number;
};

export const UNIT = {
  imageUsd: 0.15, // Nano Banana Pro, 2K
  videoStandardUsdPerSec: 0.1, // Wan 2.5 720p
  videoPremiumUsdPer5s: 0.35, // Kling 2.5 Turbo Pro, 5 s clip
  ttsUsdPer1000Chars: 0.1, // MiniMax Speech-02 HD
  cutoutUsd: 0.018, // Bria background removal
  hyperframesRenderUsd: 0.05, // CPU render, near-zero real cost buffer
  kling3UsdPerSecond: 0.112, // fal Kling 3 Pro, native audio OFF, verified 2026-10-12
  elevenV3UsdPer1000Chars: 0.1, // fal Eleven v3, verified 2026-10-12
};

export function estimateProduction(params: ProductionParams, marginMultiplier: number): Estimate {
  if (params.previewSource === "existing") return {
    lines: [{ label: "Reuse existing CAM clips, voice & local montage", quantity: 1, realUnitUsd: 0, billedUsd: 0 }],
    totalRealUsd: 0, totalBilledUsd: 0,
  };
  const lines: EstimateLine[] = [];
  const { shotCount, shotSeconds, family, tier, characterCount } = params;

  const push = (label: string, quantity: number, realUnitUsd: number) => {
    const real = quantity * realUnitUsd;
    lines.push({
      label,
      quantity,
      realUnitUsd,
      billedUsd: billedFromRealCost(real, marginMultiplier),
    });
  };

  if (params.concept) {
    push("Images (including possible end frames)", params.concept.imageCount, UNIT.imageUsd);
    push("Animation (seconds)", params.concept.videoSeconds, UNIT.kling3UsdPerSecond);
    // Dylan is a Higgsfield Seed Audio preset. An ElevenLabs price is not its quote.
    const media = lines.reduce((sum, line) => sum + line.quantity * line.realUnitUsd, 0);
    push("Allowance for retries (30%)", 1, media * .3);
    // Budget allowance, not a claimed unit price. Exact metering is not yet wired.
    push("Planning, transcription & rendering allowance", 1, 1);
    return { lines, unpriced: ["Dylan voice · quote required"], totalRealUsd: Number(lines.reduce((sum,l) => sum+l.quantity*l.realUnitUsd,0).toFixed(4)), totalBilledUsd: Number(lines.reduce((sum,l)=>sum+l.billedUsd,0).toFixed(2)) };
  }

  if (family === "whiteboard") {
    // Collage engine: ~2.2 cut-out elements per sentence (generated + background removed), reused across sentences.
    push("Cut-out elements", Math.ceil(shotCount * 2.2), UNIT.imageUsd + UNIT.cutoutUsd);
  } else {
    push("Keyframes / visuals", shotCount, UNIT.imageUsd);
  }

  if (family === "cartoon") {
    // Clips are 5 s; a narration segment that runs long needs a 10 s clip. Budget 25% of them.
    const LONG_SHOT_SHARE = 0.25;
    const perClip =
      tier === "premium" ? UNIT.videoPremiumUsdPer5s : UNIT.videoStandardUsdPerSec * shotSeconds;
    push(`Animated clips (${tier})`, shotCount, Number((perClip * (1 + LONG_SHOT_SHARE)).toFixed(4)));
  }

  push("Voice-over", 1, (characterCount / 1000) * UNIT.ttsUsdPer1000Chars);
  push("Montage & packaging", 1, UNIT.hyperframesRenderUsd);

  const totalRealUsd = lines.reduce((s, l) => s + l.quantity * l.realUnitUsd, 0);
  const totalBilledUsd = Number(lines.reduce((s, l) => s + l.billedUsd, 0).toFixed(2));
  return { lines, totalRealUsd: Number(totalRealUsd.toFixed(4)), totalBilledUsd };
}
