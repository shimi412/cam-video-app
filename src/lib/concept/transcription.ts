import { z } from "zod";
import { assertTransportMode, type JsonRequest, type QueueRequest, type TransportMode } from "./provider-transports";
import { Hash, sha256 } from "./checkpoints";

export const ALIGNMENT_ENDPOINT = "fal-ai/whisper";
export const TranscriptionRequest = z.object({ audio_url: z.url().refine((u) => new URL(u).protocol === "https:"), task: z.literal("transcribe"), chunk_level: z.literal("word"), diarize: z.literal(false) }).strict();

/** Queue result is a JSON transcript, never a URL or final voice approval.
 * The input audio hash is part of the fingerprint used by the caller's journal.
 */
export function transcriptionFingerprint(audioSha256: string, scriptSha256: string) {
  return sha256(JSON.stringify({ model: ALIGNMENT_ENDPOINT, audio: Hash.parse(audioSha256), script: Hash.parse(scriptSha256), chunk_level: "word", diarize: false }));
}
export function transcriptionQueue(input: Record<string, unknown>, mode: TransportMode, request: JsonRequest): QueueRequest {
  const payload = TranscriptionRequest.parse(input);
  const id = z.string().min(1).max(200).regex(/^[a-zA-Z0-9_-]+$/);
  const base = `https://queue.fal.run/${ALIGNMENT_ENDPOINT}`;
  const call: JsonRequest = async (url, init) => { assertTransportMode(mode); return request(url, init); };
  return { mode,
    async submit() {
      const response = z.object({ request_id: id }).parse(await call(base, { method: "POST", body: JSON.stringify(payload) }));
      return { requestId: response.request_id };
    },
    async poll(requestId) {
      id.parse(requestId);
      const state = z.object({ status: z.enum(["IN_QUEUE", "IN_PROGRESS", "COMPLETED"]), request_id: id.optional(), error: z.unknown().optional() }).parse(await call(`${base}/requests/${requestId}/status`, { method: "GET" }));
      if (state.request_id && state.request_id !== requestId) throw new Error("Transcript request ID mismatch.");
      if (state.status !== "COMPLETED") return { state: "pending" };
      if (state.error) return { state: "failed" };
      const result = z.record(z.string(), z.unknown()).parse(await call(`${base}/requests/${requestId}`, { method: "GET" }));
      if (result.error || result.detail) return { state: "failed" };
      return { state: "complete", output: JSON.stringify(result) };
    },
  };
}
