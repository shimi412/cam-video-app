import { SubmissionRejectedError } from "../providers/network";
import { VIDEO_MODELS, HF_SEEDANCE, SEEDANCE_COMPLETE } from "./model-selection";
import { z } from "zod";
import { BramRequestSchema, ImageRequestSchema, parseVideoRequest, IMAGE_ENDPOINT, type GenerationOperation } from "./generation-plan";
import { isSimulation } from "../providers/mode";
import { assertAuthorizedExecution } from "../providers/live-policy";

export type TransportMode = "simulation" | "live";
export type QueueRequest = {
  mode: TransportMode;
  prepare?: () => Promise<void>; // Free preflight, before a paid submission is journalled.
  submit: () => Promise<{ requestId: string }>;
  poll: (requestId: string) => Promise<{ state: "pending" | "complete" | "failed"; output?: string; draftId?: string; failureReason?: string }>;
};
export type JsonRequest = (url: string, init: { method: "GET" | "POST"; body?: string }) => Promise<unknown>;
export type McpCall = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export function assertCamLiveExecution(): void {
  assertAuthorizedExecution();
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
  // Higgsfield's completed audio jobs also use this CloudFront distribution
  // (verified through jobs_wait). Never trust arbitrary CloudFront tenants.
  const audioCdn = provider === "higgsfield" && host === "d8j0ntlcm91z4.cloudfront.net";
  if (mode === "simulation" && host === "simulation.invalid") return url;
  if (!audioCdn && !domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) throw new Error("Unexpected provider media host.");
  return url;
}

/** Single POST, then status/result GETs by the acknowledged ID. Unlike the fal
 * SDK queue.submit default, this adapter never automatically retries a POST.
 * Transport functions are injected: offline rehearsals use in-memory fixtures.
 */
export function falQueue(operation: GenerationOperation, input: Record<string, unknown>, mode: TransportMode, request: JsonRequest): QueueRequest {
  if ((operation.kind === "image" && operation.model !== IMAGE_ENDPOINT) || (operation.kind === "video" && operation.model !== SEEDANCE_COMPLETE && !VIDEO_MODELS.some(model => model === operation.model)) || !["image", "video"].includes(operation.kind) || operation.transport !== "fal-queue") throw new Error("Unsupported CAM scene model.");
  const payload = operation.kind === "image" ? ImageRequestSchema.parse(input) : parseVideoRequest(operation.model, input);
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
      if (result.error || result.detail) return { state: "failed", failureReason:result.error==="content_policy_violation"?"content_policy_violation":"result_rejected" };
      if (Array.isArray(result.has_nsfw_concepts) && result.has_nsfw_concepts.some(Boolean)) return { state: "failed" };
      const output = operation.kind === "image"
        ? z.object({ images: z.array(z.object({ url: z.string() })).length(1) }).parse(result).images[0].url
        : z.object({ video: z.object({ url: z.string() }) }).parse(result).video.url;
      return { state: "complete", output: providerOutputUrl(output, "fal", mode), ...(payload && "draft" in payload && payload.draft === true ? {draftId:z.string().min(1).parse(result.draft_id)} : {}) };
    },
  };
}

/** MCP may return structuredContent or JSON text. Never mistake an estimate,
 * upgrade offer or an error for an acknowledged audio generation request.
 */
export function mcpData(value: unknown) {
  const envelope = object.parse(value);
  if (envelope.isError) {
    // The tool's own words travel with the refusal: a definitive provider rejection is journaled as a failed
    // request with its reason, which routes the scene to the automatic replacement (live Clay 2026-10-23,
    // a Seedance continuation refused with a bare "tool returned an error" stopped the film for the client).
    const detail = z.array(z.object({ type: z.string(), text: z.string().optional() })).safeParse(envelope.content);
    const text = detail.success ? detail.data.filter((item) => item.type === "text" && item.text).map((item) => item.text!).join(" ").replace(/\s+/g, " ").slice(0, 300) : "";
    throw new SubmissionRejectedError(400, `Higgsfield refused the request: ${text || "no detail"}`);
  }
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
      const result = object.parse(await call("generate_audio", { params: { ...payload, use_unlim: false } }));
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

/** Importing image references is free; a completed import cache is reused on
 * resume. No generation POST is retried and no free-trial choice is activated. */
export function higgsfieldVideoQueue(operation: GenerationOperation, input: Record<string, unknown>, mode: TransportMode, callTool: McpCall, maximumCredits: number, imports: {read:(url:string)=>Promise<string|null>;save:(url:string,id:string)=>Promise<void>}): QueueRequest {
  const payload = parseVideoRequest(operation.model,input) as Record<string,unknown>;
  const call = async (name:string,args:Record<string,unknown>) => {assertTransportMode(mode);return mcpData(await callTool(name,args));};
  let prepared:Record<string,unknown>|undefined;
  return {mode, async prepare() {
    const params:Record<string,unknown> = {...payload,use_unlim:false};
    const medias:{role:string;value:string}[]=[];
    for (const role of ["start_image","end_image"]) {
      const key=`${role}_url`, url=params[key];
      if(typeof url!=="string") continue;
      let id=await imports.read(url);
      if(!id){const imported=z.object({media_id:z.string().min(1),error:z.unknown().optional()}).parse(await call("media_import_url",{url,type:"image"}));if(imported.error)throw new Error("Higgsfield image import failed.");id=imported.media_id;await imports.save(url,id);}
      medias.push({role,value:id});delete params[key];
    }
    if(medias.length)params.medias=medias;
    // Reprice exact finalization inputs before sending its single paid POST.
    let quoted=await call("generate_video",{params:{...params,get_cost:true}});
    // A keyword match can return a preset offer instead of a price. The human
    // approved this literal storyboard, never a provider's unrelated effect.
    // Accept only the documented decline identifier, not arbitrary retry data.
    const recommendation=z.object({notice:z.object({type:z.literal("preset_recommendation"),data:z.object({
      preset:z.object({id:z.uuid()}),retry_literal_with:z.object({declined_preset_id:z.uuid()}).strict(),
    })})}).safeParse(quoted);
    if(recommendation.success){
      const notice=recommendation.data.notice.data;
      if(notice.preset.id!==notice.retry_literal_with.declined_preset_id)throw new Error("Animation pricing returned a conflicting suggestion. No animation was submitted.");
      params.declined_preset_id=notice.preset.id;
      quoted=await call("generate_video",{params:{...params,get_cost:true}});
    }
    const parsed=z.object({adjustments:z.record(z.string(),z.unknown()).optional(),cost:z.object({credits:z.number().finite().nonnegative(),credits_exact:z.number().finite().nonnegative().optional()})}).safeParse(quoted);
    if(!parsed.success)throw new Error("Animation pricing could not confirm the approved scene. No animation was submitted. Your completed scenes are saved.");
    const estimate=parsed.data;
    if(Object.keys(estimate.adjustments??{}).length)throw new Error("Higgsfield changed the requested settings during estimation. No animation was submitted.");
    if((estimate.cost.credits_exact??estimate.cost.credits)>maximumCredits)throw new Error("The exact Higgsfield quote exceeds the approved reservation. No animation was submitted.");
    prepared=params;
  }, async submit() {
    if(!prepared)throw new Error("Prepare the exact Higgsfield request before submission.");
    const result=z.object({adjustments:z.record(z.string(),z.unknown()).optional(),results:z.array(z.object({id:requestIdSchema,model:z.string(),type:z.literal("video")})).length(1)}).parse(await call("generate_video",{params:prepared}));
    if(result.results[0].model!==operation.model || Object.keys(result.adjustments??{}).length)throw new Error("Higgsfield changed the requested model or settings. Reconcile this submission before continuing.");
    return {requestId:result.results[0].id};
  }, async poll(id) {
    const requestId=requestIdSchema.parse(id);
    const result=z.object({jobs:z.array(z.object({job_id:requestIdSchema,index:z.number(),status:z.string(),type:z.string().optional(),model:z.string().optional(),result_url:z.string().optional()})).length(1)}).parse(await call("jobs_wait",{jobs:[{index:0,job_id:requestId}],timeout_seconds:0}));
    const job=result.jobs[0];
    if(job.job_id!==requestId || job.index!==0 || job.model&&job.model!==operation.model)throw new Error("Higgsfield returned a different video job.");
    // Seedance can label pending/failed video jobs as images. Identity and model
    // remain mandatory; only a completed result must identify itself as video.
    if(job.status==="completed"){
      if(job.type&&job.type!=="video")throw new Error("Higgsfield completed job did not identify a video result.");
      return {state:"complete",output:providerOutputUrl(job.result_url,"higgsfield",mode),...(operation.model===HF_SEEDANCE&&payload.draft===true?{draftId:requestId}:{})};
    }
    if(["canceled","failed","nsfw","ip_detected"].includes(job.status))return {state:"failed",failureReason:job.status};
    if(["pending","waiting","queued","dna","script","visuals","vision","flow","in_progress","ip_detect"].includes(job.status))return {state:"pending"};
    throw new Error("Cannot determine Higgsfield video status. Resume the saved job ID.");
  }};
}
