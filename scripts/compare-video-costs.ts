/**
 * Cost comparison between the clip engines, with no API call and no spend.
 *   pnpm compare:video [totalSeconds] [clipSeconds] [retryRate]
 *   e.g. pnpm compare:video 30 5 0.3
 *
 * Reads the same price tables the metering uses (FAL_PRICES, Runway MODELS),
 * so the table cannot drift from what the app actually bills.
 *
 * Reference grid (devis V3, 19/08): real cost target 3 to 5 $ for a 30 s
 * standard video, sold 8 to 12 $; premium sold 30 to 50 $.
 */
import { FAL_PRICES } from "../src/lib/providers/fal";
import { MODELS, clipCostUsd, type RunwayModelKey } from "../src/lib/providers/runway";

const totalSeconds = Number(process.argv[2] ?? 30);
const clipSeconds = Number(process.argv[3] ?? 5);
const retryRate = Number(process.argv[4] ?? 0.3);

const clips = Math.ceil(totalSeconds / clipSeconds);
const billedClips = clips * (1 + retryRate);

type Row = { engine: string; perClip: number; perVideo: number; note: string };

const rows: Row[] = [];

for (const res of ["480p", "720p", "1080p"] as const) {
  const perClip = Number((clipSeconds * FAL_PRICES.wanUsdPerSec[res]).toFixed(4));
  rows.push({ engine: `fal · Wan 2.5 ${res}`, perClip, perVideo: perClip * billedClips, note: "standard actuel" });
}
const klingPerClip = Number(
  (FAL_PRICES.klingBaseUsd + Math.max(0, clipSeconds - 5) * FAL_PRICES.klingExtraUsdPerSec).toFixed(4),
);
rows.push({ engine: "fal · Kling 2.5 Turbo Pro", perClip: klingPerClip, perVideo: klingPerClip * billedClips, note: "premium actuel" });

for (const key of Object.keys(MODELS) as RunwayModelKey[]) {
  const perClip = clipCostUsd(key, clipSeconds);
  rows.push({ engine: `runway · ${MODELS[key].label}`, perClip, perVideo: perClip * billedClips, note: "" });
}

rows.sort((a, b) => a.perVideo - b.perVideo);

const usd = (n: number) => `$${n.toFixed(2)}`;
const pad = (s: string, n: number) => s.padEnd(n);

console.log(
  `\nVidéo de ${totalSeconds}s — ${clips} plans de ${clipSeconds}s, ${Math.round(retryRate * 100)}% de retries (${billedClips.toFixed(1)} plans facturés)\n`,
);
console.log(`${pad("Moteur", 32)}${pad("par plan", 12)}${pad("par vidéo", 12)}Repère`);
console.log("-".repeat(70));
for (const r of rows) {
  const flag =
    r.perVideo <= 5 ? "dans la cible standard (≤ 5 $)"
    : r.perVideo <= 20 ? "tier premium"
    : "hors grille";
  console.log(`${pad(r.engine, 32)}${pad(usd(r.perClip), 12)}${pad(usd(r.perVideo), 12)}${r.note || flag}`);
}
console.log("\nClips seuls : ni keyframes, ni voix, ni rendu. Grille devis : standard vendu 8 à 12 $, premium 30 à 50 $.\n");
