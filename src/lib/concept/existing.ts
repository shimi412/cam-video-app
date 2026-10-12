import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import manifest from "./demo/manifest.json";
import aligned from "./demo/timing.json";
import eyal from "./eyal-phrases.json";
import { isSimulation } from "../providers/mode";
import type { ProductionParams } from "../brain";
import type { ConceptTiming } from "./types";
import { normalizedText } from "./text";
import { repairCollapsedWords } from "./word-timing";

export const DEMO_ID = manifest.id;
export const DEMO_SCRIPT = eyal.join("\n");
export const DEMO_DURATION = Math.round((aligned.duration + 1.6) * 100) / 100;
export const DEMO_VOICE = `${manifest.voice.name} · ${manifest.voice.provider} · existing recording`;
const repaired = repairCollapsedWords(aligned.words);
export const demoTiming: ConceptTiming = { ...aligned, words: repaired.words };
export const wordTimingRepairs = repaired.repairs;
const canonical = (s: string) => s.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();

/** Only the approved recording's exact script and framing may reuse these media. */
export function assertExistingSelection(script: string, params: Pick<ProductionParams, "templateSlug" | "aspectRatio">) {
  if (!isSimulation()) throw new Error("Existing-media previews are only available in offline mode.");
  if (params.templateSlug !== "cam-clay" || params.aspectRatio !== "9:16") throw new Error("The existing CAM film uses Clay in vertical 9:16. Choose a planning preview for another format.");
  if (canonical(script) !== canonical(DEMO_SCRIPT)) throw new Error("This recording belongs to the unchanged CAM example. Choose a planning preview for a new script.");
  if (normalizedText(aligned.words.map((w) => w.word).join(" ")) !== normalizedText(script)) throw new Error("The recording transcript does not match the script.");
}

export const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
export function assertAssetHash(data: Buffer, asset: { file: string; bytes: number; sha256: string }) {
  if (data.length !== asset.bytes || sha256(data) !== asset.sha256) throw new Error(`Existing CAM media changed: ${asset.file}. Restore the approved file before rendering.`);
}

/** Paths come exclusively from the checked-in manifest, never from the request. */
export async function verifyExistingAssets(destination?: string) {
  for (const asset of manifest.assets) {
    // Keep the storage boundary literal so Next does not trace the whole repository.
    const source = path.join(process.cwd(), "storage/cam-oct05-v2/concept-1-pate-a-modeler/montage/assets", asset.file.replace(/^assets\//, ""));
    let data: Buffer;
    try { data = await readFile(source); }
    catch { throw new Error(`Existing CAM media missing: ${asset.file}. Restore the local CAM media pack.`); }
    assertAssetHash(data, asset);
    if (destination) {
      const target = path.join(destination, asset.file);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
      // Detect a source changed between verification and copy.
      assertAssetHash(await readFile(target), asset);
    }
  }
  return manifest;
}

export function existingParams(params: ProductionParams): ProductionParams {
  return { ...params, previewSource: "existing", voiceId: DEMO_ID, durationSeconds: DEMO_DURATION, shotCount: 12, tone: "serious", tier: "premium" };
}

export function existingMediaSummary() {
  return { id: DEMO_ID, label: "CAM Clay · existing film", voice: DEMO_VOICE, duration: DEMO_DURATION, shots: 12, source: "existing" as const };
}

export async function existingAvailability() {
  try {
    if (!isSimulation()) throw new Error("Start the local preview server to use the existing film.");
    await verifyExistingAssets();
    return { ...existingMediaSummary(), available: true, reason: null, script: DEMO_SCRIPT,
      voiceUrl: `/api/media/${manifest.source.replace(/^storage\//, "")}/${manifest.voice.file}` };
  } catch (error) {
    return { ...existingMediaSummary(), available: false, reason: error instanceof Error ? error.message : "Existing media unavailable.", script: DEMO_SCRIPT, voiceUrl: null };
  }
}
