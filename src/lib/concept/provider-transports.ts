import { z } from "zod";
import { BramRequestSchema, ImageRequestSchema, VideoRequestSchema, IMAGE_ENDPOINT, VIDEO_ENDPOINT, type GenerationOperation } from "./generation-plan";
import { isSimulation } from "../providers/mode";

export type TransportMode = "simulation" | "live";
export type QueueRequest = {
  mode: TransportMode;
  submit: () => Promise<{ requestId: string }>;
  poll: (requestId: string) => Promise<{ state: "pending" | "complete" | "failed"; output?: string }>;
};
export type JsonRequest = (url: string, init: { method: "GET" | "POST"; body?: string }) => Promise<unknown>;
export type McpCall = (name: string, args: Record<string, unknown>) => Promise<unknown>;

/** Deliberately independent of credentials, environment flags and subscription
 * status. Opening this gate requires implementing budget reservation, approval
 * and final voice alignment, plus explicit authorization for paid execution.
 */
export function assertCamLiveExecution(): void {
  throw new Error("CAM paid generation is disabled. No paid request or trial is authorized.");
}

export function assertTransportMode(mode: TransportMode) {
  if (mode === "live") { assertCamLiveExecution(); return; }
  if (mode !== "simulation" || !isSimulation()) throw new Error("Provider rehearsal only runs offline.");
}

const requestIdSchema = z.string().min(1).max(200).regex(/^[a-zA-Z0-9_-]+$/);
const object = z.record(z.string(), z.unknown());
const httpsUrl = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && !url.port;
}, "Expected an HTTPS media URL without credentials.");

export function providerOutputUrl(value: unknown, provider: "fal" | "higgsfield", mode: TransportMode) {
  const url = httpsUrl.parse(value);
  const host = new URL(url).hostname;
  const domains = provider === "fal" ? ["fal.media"] : ["higgsfield.ai"];
  if (mode === "simulation" && host === "simulation.invalid") return url;
  if (!domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) throw new Error("Unexpected provider media host.");
  return url;
}

/** Single POST, then status/result GETs by the acknowledged ID. Unlike the fal
 * SDK queue.submit default, this adapter never automatically retries a POST.
 * Transport functions are injected: offline rehearsals use in-memory fixtures.
 */
export function falQueue(operation: GenerationOperation, input: Record<string, unknown>, mode: TransportMode, request: JsonRequest): QueueRequest {
  if ((operation.kind === "image" && operation.model !== IMAGE_ENDPOINT) || (operation.kind === "video" && operation.model !== VIDEO_ENDPOINT) || !["image", "video"].includes(operation.kind) || operation.transport !== "fal-queue") throw new Error("Unsupported CAM scene model.");
  const payload = operation.kind === "image" ? ImageRequestSchema.parse(input) : VideoRequestSchema.parse(input);
  // Queue retrieval uses the owner/alias, without the endpoint's subpath.
  const base = `https://queue.fal.run/${operation.model.split("/").slice(0, 2).join("/")}`;
  const call: JsonRequest = async (url, init) => { assertTransportMode(mode); return request(url, init); };
  return {
    mode,
    async submit() {
      const result = z.object({ request_id: requestIdSchema }).parse(await call(`https://queue.fal.run/${operation.model}`, { method: "POST", body: JSON.stringify(payload) }));
      return { requestId: result.request_id };
    },
    async poll(id) {
      const requestId = requestIdSchema.parse(id);
      const status = z.object({ status: z.enum(["IN_QUEUE", "IN_PROGRESS", "COMPLETED"]), request_id: requestIdSchema.optional(), error: z.unknown().optional() })
        .parse(await call(`${base}/requests/${requestId}/status`, { method: "GET" }));
      if (status.request_id && status.request_id !== requestId) throw new Error("Provider returned a different request ID.");
      if (status.status !== "COMPLETED") return { state: "pending" };
      if (status.error) return { state: "failed" };
      const result = object.parse(await call(`${base}/requests/${requestId}`, { method: "GET" }));
      if (result.error || result.detail) return { state: "failed" };
      if (Array.isArray(result.has_nsfw_concepts) && result.has_nsfw_concepts.some(Boolean)) return { state: "failed" };
      const output = operation.kind === "image"
        ? z.object({ images: z.array(z.object({ url: z.string() })).length(1) }).parse(result).images[0].url
        : z.object({ video: z.object({ url: z.string() }) }).parse(result).video.url;
      return { state: "complete", output: providerOutputUrl(output, "fal", mode) };
    },
  };
}

/** MCP may return structuredContent or JSON text. Never mistake an estimate,
 * upgrade offer or an error for an acknowledged audio generation request.
 */
function mcpData(value: unknown) {
  const envelope = object.parse(value);
  if (envelope.isError) throw new Error("Higgsfield tool returned an error.");
  if (envelope.structuredContent) return object.parse(envelope.structuredContent);
  const content = z.array(z.object({ type: z.string(), text: z.string().optional() })).parse(envelope.content);
  const texts = content.filter((item) => item.type === "text" && item.text);
  if (texts.length !== 1) throw new Error("Ambiguous Higgsfield response.");
  return object.parse(JSON.parse(texts[0].text!));
}

export function bramQueue(input: Record<string, unknown>, mode: TransportMode, callTool: McpCall): QueueRequest {
  const payload = BramRequestSchema.parse(input);
  const call: McpCall = async (name, args) => { assertTransportMode(mode); return mcpData(await callTool(name, args)); };
  return {
    mode,
    async submit() {
      const result = object.parse(await call("generate_audio", { params: payload }));
      const parsed = z.object({ results: z.array(z.object({ id: requestIdSchema, type: z.literal("audio").optional(), model: z.literal("text2speech_v2").optional() })).length(1) }).safeParse(result);
      if (!parsed.success) throw new Error("No unique Bram request ID. Reconcile before retrying; no plan or trial will be selected automatically.");
      return { requestId: parsed.data.results[0].id };
    },
    async poll(id) {
      const requestId = requestIdSchema.parse(id);
      const result = z.object({ jobs: z.array(z.object({ job_id: requestIdSchema, index: z.number(), status: z.string(), type: z.string().optional(), model: z.string().optional(), result_url: z.string().optional() })).length(1) })
        .parse(await call("jobs_wait", { jobs: [{ index: 0, job_id: requestId }], timeout_seconds: 0 }));
      const job = result.jobs[0];
      if (job.job_id !== requestId || job.index !== 0 || (job.type && job.type !== "audio") || (job.model && job.model !== "text2speech_v2")) throw new Error("Higgsfield returned a different job.");
      if (job.status === "completed") return { state: "complete", output: providerOutputUrl(job.result_url, "higgsfield", mode) };
      if (["canceled", "failed", "nsfw", "ip_detected"].includes(job.status)) return { state: "failed" };
      if (["pending", "waiting", "queued", "dna", "script", "visuals", "vision", "flow", "in_progress", "ip_detect"].includes(job.status)) return { state: "pending" };
      // lookup_failed is not proof the original generation failed. Keep its ID.
      throw new Error("Cannot determine Higgsfield job status. Resume polling the saved request ID.");
    },
  };
}
