import { readFile } from "node:fs/promises";
import path from "node:path";
import demo from "./demo/manifest.json";
import { assertAssetHash } from "./existing";

/** Bram selected by Shimi on 2026-10-13. The provider sample is not a CAM reading.
 * Do not reuse Dylan's speed settings or label the historical film as Bram.
 */
export const CAM_VOICE = {
  name: "Bram", provider: "Higgsfield", model: "text2speech_v2", variant: "elevenlabs",
  voiceType: "preset", voiceId: "549ff70a-3ee7-4f04-a4d9-89a24fab7709",
  identityVerifiedAt: "2026-10-13", status: "identity-verified",
  engineStatus: "quote-only-not-generated",
  pacingStatus: "new-reading-needs-review",
  finalVoiceApproved: false,
  sampleUrl: "https://cdn.higgsfield.ai/audio_voice/92b784d6-f194-414b-8d78-fb7108ba4d5a.wav",
} as const;

export async function camVoiceRecording() {
  const asset = demo.assets.find((asset) => asset.file === demo.voice.file)!;
  const data = await readFile(path.join(process.cwd(), "storage/cam-oct05-v2/concept-1-pate-a-modeler/montage/assets/narration.wav"));
  assertAssetHash(data, asset);
  return data;
}

export async function camVoiceReference() {
  // preload=none in the Studio: this public catalogue sample loads only on play.
  return { ...CAM_VOICE, referenceUrl: CAM_VOICE.sampleUrl, referenceAvailable: true, referenceKind: "provider-sample" as const };
}
