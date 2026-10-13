import { readFile } from "node:fs/promises";
import path from "node:path";
import demo from "./demo/manifest.json";
import { assertAssetHash } from "./existing";

/** Same preset in the October source manifest and the read-only live catalogue.
 * Identity is established; a new reading and its pacing have NOT been approved.
 * This is a Higgsfield MCP model, not an invented fal/ElevenLabs endpoint.
 */
export const CAM_VOICE = {
  name: "Dylan", provider: "Higgsfield", model: "seed_audio",
  voiceType: "preset", voiceId: "b847bc29-f184-583a-8ad9-d1f1e16d1a60",
  identityVerifiedAt: "2026-10-13", status: "identity-verified",
  candidateSpeechRate: demo.voice.speechRate,
  pacingStatus: "new-reading-needs-review",
  finalVoiceApproved: false,
} as const;

export async function camVoiceRecording() {
  const asset = demo.assets.find((asset) => asset.file === demo.voice.file)!;
  const data = await readFile(path.join(process.cwd(), "storage/cam-oct05-v2/concept-1-pate-a-modeler/montage/assets/narration.wav"));
  assertAssetHash(data, asset);
  return data;
}

export async function camVoiceReference() {
  try {
    await camVoiceRecording();
    return { ...CAM_VOICE, referenceUrl: "/api/cam-voice", referenceAvailable: true };
  } catch {
    return { ...CAM_VOICE, referenceUrl: null, referenceAvailable: false };
  }
}
