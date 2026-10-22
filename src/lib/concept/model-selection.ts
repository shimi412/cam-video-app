import { z } from "zod";

export const KLING_PRO = "fal-ai/kling-video/v3/pro/image-to-video";
export const KLING_STANDARD = "fal-ai/kling-video/v3/standard/image-to-video";
export const KLING_TURBO = "fal-ai/kling-video/v3/turbo/pro/image-to-video";
export const SEEDANCE = "bytedance/seedance-2.5/image-to-video";
export const SEEDANCE_COMPLETE = "bytedance/seedance-2.5/draft/complete";
export const MINIMAX = "minimax/h3/image-to-video";
export const HF_SEEDANCE = "seedance_2_5";
export const HF_MINIMAX = "minimax_h3";
export const VIDEO_MODELS = [KLING_PRO, KLING_STANDARD, KLING_TURBO, SEEDANCE, MINIMAX, HF_SEEDANCE, HF_MINIMAX] as const;
export const isHiggsfieldVideo = (model: string) => model === HF_SEEDANCE || model === HF_MINIMAX;
export type VideoWorkflow = "direct" | "draft-first" | "whimsical";
export type VideoOffer = { model: string; resolution: string; seconds: number; unit: "usd" | "higgsfield-credit"; final: number; draft?: number };
export const draftOperationId = (id: string) => id.replace(/-clip$/, "-draft");
export const VideoModelSchema = z.enum(VIDEO_MODELS);
export type VideoModels = Record<string, z.infer<typeof VideoModelSchema>>;
export type SelectionOptions = { minimumResolution?: "1080p" | "720p"; lockedModels?: VideoModels; newOperations?: string[]; workflow?: VideoWorkflow; offers?: VideoOffer[]; higgsfieldCreditUsd?: number };
export const SelectionSchema = z.object({
  version: z.literal(1), minimumResolution: z.enum(["1080p", "720p"]),
  method: z.literal("capabilities-and-live-prices"),
  workflow: z.enum(["direct", "draft-first", "whimsical"]).optional(),
  scenes: z.array(z.object({
    operation: z.string(), scene: z.number(), selected: VideoModelSchema, reason: z.string(),
    candidates: z.array(z.object({model: VideoModelSchema, label: z.string(), resolution: z.string(),
      eligible: z.boolean(), reason: z.string(), maximumUsdMicros: z.number().int().nonnegative().nullable(),
      unit: z.enum(["usd","higgsfield-credit"]).optional(), final: z.number().nonnegative().optional(), draft: z.number().nonnegative().optional()})),
    localText: z.boolean(),
  })),
  notes: z.array(z.string()),
});
export type Selection = z.infer<typeof SelectionSchema>;
/** Request a supported source length; the montage keeps its own narration timing. */
export function videoRequestSeconds(model:string, seconds:number) {
 return Math.max(model===SEEDANCE||model===HF_SEEDANCE||model===HF_MINIMAX?4:model===MINIMAX?5:3,seconds);
}
export type SceneNeeds = { operation: string; scene: number; seconds: number; quoteSeconds?: number; endFrame: boolean; complex: boolean; localText: boolean };
export type ModelPrice = { endpoint_id: string; unit_price: number; unit: string; currency: string };

/** Versioned, conservative routing policy, not a learned quality score. No inference
 * or upload: the full board is analysed inside CAM. Missing prices never mean free.
 * Standard is an explicit 720p opt-in; complex actions retain the existing Pro path.
 */
export function selectVideoModels(needs: SceneNeeds[], prices: ModelPrice[], options: SelectionOptions = {}): Selection {
  const minimumResolution = options.minimumResolution ?? "1080p";
  const verifiedUnitPrice = (model:string,unit:string) => {
    const rows=prices.filter(price=>price.endpoint_id===model);
    return rows.length===1&&rows[0].unit===unit&&rows[0].currency==="USD"&&Number.isFinite(rows[0].unit_price)&&rows[0].unit_price>=0?rows[0].unit_price:undefined;
  };
  return SelectionSchema.parse({version: 1, minimumResolution, workflow: options.workflow ?? "direct", method: "capabilities-and-live-prices",
    scenes: needs.map(need => {
      if (!Number.isFinite(need.seconds) || need.seconds < 3 || need.seconds > 15) throw new Error(`Scene ${need.scene}: split the action into clips of 3–15 seconds before quoting.`);
      const workflow = options.workflow ?? "direct";
      const candidates = VIDEO_MODELS.map(model => {
        const standard = model === KLING_STANDARD, turbo = model === KLING_TURBO;
        const seedance = model === SEEDANCE || model === HF_SEEDANCE;
        const minimax = model === MINIMAX || model === HF_MINIMAX;
        const klingFinal = model === KLING_PRO;
        const hf = isHiggsfieldVideo(model);
        const resolution = standard ? "720p" : minimax ? (hf ? "2K (upscaled from 768p)" : "768p") : "1080p";
        const rows = prices.filter(p => p.endpoint_id === model);
        // A generic endpoint price cannot price resolution variants or token billing.
        const price = !seedance && !minimax && rows.length === 1 && rows[0].unit === "seconds" && rows[0].currency === "USD" && Number.isFinite(rows[0].unit_price) && rows[0].unit_price >= 0 ? rows[0] : null;
        const offers = (options.offers ?? []).filter(o => o.model === model && o.seconds === videoRequestSeconds(model,need.quoteSeconds ?? need.seconds) && o.resolution === resolution);
        const offer = offers.length === 1 ? offers[0] : undefined;
        const final = offer?.final ?? (price ? price.unit_price * (need.quoteSeconds ?? need.seconds) : undefined);
        // Kling Standard and Pro preserve both storyboard frames. Each is a
        // separately billed generation; Standard is not a final-ID continuation.
        const draftRate = klingFinal ? verifiedUnitPrice(KLING_STANDARD,"seconds") : undefined;
        const draft = workflow === "whimsical" ? klingFinal?0:offer?.draft : workflow === "draft-first" ? klingFinal ? draftRate===undefined?undefined:draftRate*(need.quoteSeconds??need.seconds) : offer?.draft : undefined;
        const unit = offer?.unit ?? "usd";
        const priced = final !== undefined && Number.isFinite(final) && final >= 0 && (workflow === "direct" || draft !== undefined && Number.isFinite(draft) && draft >= 0);
        const reason = (workflow === "draft-first" || workflow === "whimsical") && !seedance && !klingFinal ? "No qualified draft-to-final continuation in this adapter."
          : (workflow === "draft-first" || workflow === "whimsical") && klingFinal && need.complex && options.lockedModels?.[need.operation]!==KLING_PRO ? "Complex actions use the qualified Seedance draft workflow."
          : (standard || minimax) && minimumResolution === "1080p" ? "Native source resolution is below the requested 1080p minimum; upscaling does not add native detail."
          : turbo && need.endFrame ? "This adapter has no end-frame input; the required final image must be preserved."
          : (standard || turbo) && need.complex ? "Conservative CAM policy: retain Pro for transformations, multiple characters or unclassified actions."
          : !priced ? "Current resolution-specific price unavailable; token rates and subscription credits are never assumed to be per-second dollar prices."
          : "Supports the requested duration and required image inputs; narration is supplied separately.";
        const eligible = reason.startsWith("Supports");
        const rate = unit === "usd" ? 1 : options.higgsfieldCreditUsd;
        const total = priced ? final! + (draft ?? 0) : undefined;
        return {model, label: standard ? "Kling 3.0 Standard · fal" : turbo ? "Kling 3.0 Turbo Pro · fal" : seedance ? `Seedance 2.5 · ${hf ? "Higgsfield" : "fal"}` : minimax ? `MiniMax H3 · ${hf ? "Higgsfield" : "fal"}` : "Kling 3.0 Pro · fal", resolution,
          eligible, reason, unit, final, draft,
          maximumUsdMicros: total !== undefined && rate !== undefined && Number.isFinite(rate) && rate > 0 ? Math.ceil(Number((total * rate * 1e6).toPrecision(12))) : null};
      });
      const locked = options.lockedModels?.[need.operation];
      if (options.lockedModels && !locked && !options.newOperations?.includes(need.operation)) throw new Error("An approved scene model is missing. Create a new production version.");
      const eligible = candidates.filter(c => c.eligible).sort((a,b) => {
        if((workflow==="draft-first"||workflow==="whimsical")&&(a.model===KLING_PRO||b.model===KLING_PRO))return a.model===KLING_PRO?-1:1;
        if (a.maximumUsdMicros !== null && b.maximumUsdMicros !== null) return a.maximumUsdMicros - b.maximumUsdMicros;
        if (a.unit === b.unit) return (a.final! + (a.draft ?? 0)) - (b.final! + (b.draft ?? 0));
        return a.maximumUsdMicros !== null ? -1 : 1;
      });
      const selected = locked ? candidates.find(c => c.model === locked && c.eligible) : eligible[0];
      if (!selected) throw new Error(`Scene ${need.scene}: no eligible model with a verified price. No generation started.`);
      return {operation: need.operation, scene: need.scene, selected: selected.model, candidates, localText: need.localText,
        reason: locked ? "Keep the model from the approved budget; no automatic substitution."
          : (workflow==="draft-first"||workflow==="whimsical")&&selected.model===KLING_PRO ? "Kling is preferred for compatible storyboard actions; both start and end frames are preserved. The Whimsical route reuses the completed Kling clip after visual approval."
          : eligible.some(c=>c.maximumUsdMicros===null) ? "Lowest quoted cost within the selected currency. No USD/credit equivalence is assumed without a configured conversion."
          : eligible.length > 1 ? "Lowest current quoted cost among models allowed for this scene and resolution."
          : "Only eligible model under the requested resolution and conservative CAM scene policy."};
    }),
    notes: ["Rule-based compatibility analysis, not a visual quality guarantee. Review the complete storyboard before animation.",
      "Direct mode includes one final attempt. Draft-first includes one draft plus one final. Kling uses separate Standard and Pro requests with the same approved start/end frames; Seedance continues its 480p draft at 1080p. No automatic retries.",
      "Text animation, logo and editing are local. Existing imported scenes are excluded from generation.",
      "Catalogue: Kling, Seedance 2.5 and MiniMax H3; fal and Higgsfield are compared separately. Unavailable or ambiguous prices exclude a route. Native resolution and upscaled resolution are distinguished.",
      "API dollars and subscription credits are separate. Web unlimited offers are not assumed to apply to API calls."]});
}
export function selectedModels(lines: {id: string; kind: string; model: string}[]): VideoModels {
  return Object.fromEntries(lines.filter(l => l.kind === "video" && l.id.endsWith("-clip")).map(l => [l.id, VideoModelSchema.parse(l.model)]));
}
