import { readFile } from "node:fs/promises";
import { lockedAssets } from "./assets";
import { downloadResult, uploadReference, type AssetTransport } from "./media-transfers";
import { sha256 } from "./checkpoints";
import { CAM_VOICE } from "./cam-voice";
import { alignmentHash, scriptHash, whisperAlignment } from "./voice-alignment";
import { alignedGenerationPlan } from "./aligned-plan";
import type { ProductionParams } from "../brain";
import type { ConceptBoard } from "./types";
import type { generationPlan } from "./generation-plan";
import type { rehearseGeneration } from "./rehearsal";
import { assertTransportMode } from "./provider-transports";

/** Exercise transfer + synchronization with existing local bytes. These files
 * are QA fixtures, never assigned to the production's scenes or labelled Bram.
 */
export async function rehearseDelivery(input: { jobId: string; directory: string; voiceFile: string; script: string; params: ProductionParams; board: ConceptBoard;
  plan: ReturnType<typeof generationPlan>; rehearsal: Awaited<ReturnType<typeof rehearseGeneration>>; assertOwned: () => Promise<void> }) {
  assertTransportMode("simulation");
  const references = await lockedAssets(), wav = await readFile(input.voiceFile);
  const narrator = references.find((r) => r.id === "narrator")!, image = await readFile(narrator.filePath);
  let uploads = 0, downloads = 0;
  const transport: AssetTransport = { mode: "simulation",
    upload: async (bytes) => { uploads++; return { url: `https://simulation.invalid/uploads/${sha256(bytes)}`, expiresAt: Date.now() + 365 * 86400_000 }; },
    download: async (url) => { downloads++; return new Response(new Uint8Array(url.endsWith("/voice") ? wav : image)); },
  };
  const context = { directory: input.directory, transport, assertOwned: input.assertOwned };
  const uploaded = [];
  for (const ref of references.filter((r) => r.id !== "logo")) uploaded.push(await uploadReference({ ...context, file: ref.filePath, sha256: ref.sha256, contentType: "image/png" }));
  const voice = await downloadResult({ ...context, jobId: input.jobId, fingerprint: sha256(`voice-fixture:${sha256(wav)}`), kind: "audio", provider: "higgsfield", url: "https://simulation.invalid/voice" });
  const visual = await downloadResult({ ...context, jobId: input.jobId, fingerprint: sha256(`image-fixture:${narrator.sha256}`), kind: "image", provider: "fal", url: "https://simulation.invalid/image" });
  const aligned = input.rehearsal.operations.find((op) => op.operation === "voice-alignment");
  if (!aligned?.output || !aligned.requestId || !voice.audio) throw new Error("Missing simulated voice or transcript.");
  const alignment = whisperAlignment(JSON.parse(aligned.output), { audioSha256: voice.audio.sha256, scriptSha256: scriptHash(input.board.shots.map((s) => s.narration)),
    voiceId: CAM_VOICE.voiceId, requestId: aligned.requestId, source: "simulation-fixture" });
  const result = alignedGenerationPlan({ script: input.script, params: input.params, board: input.board, references, audio: voice.audio, alignment, mode: "simulation",
    approval: { mode: "simulation", approved: true, voiceId: CAM_VOICE.voiceId, audioSha256: voice.audio.sha256, scriptSha256: alignment.scriptSha256, alignmentSha256: alignmentHash(alignment) } });
  return { mode: "simulation", mediaSource: "local-test-fixtures", finalBramVoiceApproved: false, paidRequests: 0, costUsd: 0,
    uploads, downloads, reusedVoice: voice.reused, reusedImage: visual.reused, referenceHashes: uploaded.map((r) => r.sha256),
    audioSha256: voice.audio.sha256, alignmentSha256: alignmentHash(alignment), synchronizedDuration: result.timing.duration,
    timingBasis: "test-voice-with-estimated-word-timestamps", synchronizedPlan: result.plan,
  };
}
