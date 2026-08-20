/**
 * Price estimation shown to the client BEFORE launch (mandatory confirmation).
 * Based on the simulated/real unit costs and the admin margin multiplier.
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
  totalRealUsd: number;
  totalBilledUsd: number;
};

const UNIT = {
  imageUsd: 0.13,
  videoStandardUsdPerSec: 0.1,
  videoPremiumUsdPerSec: 0.15,
  ttsUsdPerMinute: 0.1,
  hyperframesRenderUsd: 0.05, // CPU render, near-zero real cost buffer
};

export function estimateProduction(params: ProductionParams, marginMultiplier: number): Estimate {
  const lines: EstimateLine[] = [];
  const { shotCount, shotSeconds, durationSeconds, templateSlug, tier } = params;

  const push = (label: string, quantity: number, realUnitUsd: number) => {
    const real = quantity * realUnitUsd;
    lines.push({
      label,
      quantity,
      realUnitUsd,
      billedUsd: billedFromRealCost(real, marginMultiplier),
    });
  };

  push("Keyframes / visuals", shotCount, UNIT.imageUsd);

  if (templateSlug === "cartoon") {
    const perSec = tier === "premium" ? UNIT.videoPremiumUsdPerSec : UNIT.videoStandardUsdPerSec;
    push(`Animated clips (${tier})`, shotCount, perSec * shotSeconds);
  }

  push("Voice-over", 1, (durationSeconds / 60) * UNIT.ttsUsdPerMinute);
  push("Montage & packaging", 1, UNIT.hyperframesRenderUsd);

  const totalRealUsd = lines.reduce((s, l) => s + l.quantity * l.realUnitUsd, 0);
  const totalBilledUsd = Number(lines.reduce((s, l) => s + l.billedUsd, 0).toFixed(2));
  return { lines, totalRealUsd: Number(totalRealUsd.toFixed(4)), totalBilledUsd };
}
