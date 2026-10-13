import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { narrationTarget, withWordTimings, reviewNarration, type Narration } from "../src/lib/concept/narration";
import { scriptHash } from "../src/lib/concept/voice-alignment";
import { visualReview } from "../src/lib/concept/visual-review";
import { resolveParams } from "../src/lib/brain";
import { getRecipe } from "../src/lib/recipes";
import { planConcept } from "../src/lib/concept/storyboard";
import { attachStage, reviewStage, sceneWorkflow } from "../src/lib/concept/scene-workflow";
import { generationPlan } from "../src/lib/concept/generation-plan";
import { alignmentHash, alignVoice } from "../src/lib/concept/voice-alignment";
import { prepareQuote, saveQuoteDraft } from "../src/lib/concept/quote-preparation";

const phrases = ["Offline voice test."], jobId = randomUUID();
function fixture(): Narration { return { id: randomUUID(), audio: { kind: "audio", file: "narration.wav", sha256: "a".repeat(64), sourceSha256: "b".repeat(64), duration: 4 }, speaker: "test", sourceNote: "Offline fixture only", reviews: [] }; }
const words = [{ word: "Offline", start: .3, end: .8 }, { word: "voice", start: .9, end: 1.4 }, { word: "test.", start: 1.5, end: 2 }];
const timing = { audioSha256: "a".repeat(64), scriptSha256: scriptHash(phrases), words };
it("keeps recording targets stable across database JSON key reordering", () => {
  const voice = fixture(), reversed = { ...voice, audio: Object.fromEntries(Object.entries(voice.audio).reverse()) } as Narration;
  expect(narrationTarget(jobId, phrases, reversed)).toBe(narrationTarget(jobId, phrases, voice));
});
function approved(n: Narration) { return reviewNarration(jobId, phrases, n, { target: narrationTarget(jobId, phrases, n), decision: "approved", note: "QA only", listened: true, checkedWords: true }); }
it("rejects missing, extra, overlapping, out-of-range and mismatched word timings", () => {
  for (const invalid of [{ ...timing, audioSha256: "c".repeat(64) }, { ...timing, scriptSha256: "c".repeat(64) },
    { ...timing, words: words.slice(1) }, { ...timing, words: [...words, { word: "extra", start: 2.1, end: 3 }] },
    { ...timing, words: [{ ...words[0], end: 1.2 }, ...words.slice(1)] },
    { ...timing, words: [...words.slice(0, 2), { ...words[2], end: 5 }] }]) expect(() => withWordTimings(fixture(), phrases, invalid)).toThrow();
});
it("requires an explicit listening and word check before approval", () => {
  const n = withWordTimings(fixture(), phrases, timing), target = narrationTarget(jobId, phrases, n);
  for (const check of [{ listened: false, checkedWords: true }, { listened: true, checkedWords: false }]) expect(() => reviewNarration(jobId, phrases, n, { target, decision: "approved", note: "", ...check })).toThrow(/Listen/);
  expect(() => approved(fixture())).toThrow();
});
it("keeps reviews idempotent and invalidates them when recording, timings or declared speaker changes", () => {
  const n = approved(withWordTimings(fixture(), phrases, timing));
  expect(approved(n).reviews).toEqual(n.reviews);
  for (const changed of [{ ...n, id: randomUUID() }, { ...n, speaker: "bram" as const },
    withWordTimings(n, phrases, { ...timing, words: [{ ...words[0], start: .4 }, ...words.slice(1)] })]) {
    expect(visualReview(narrationTarget(jobId, phrases, changed), changed.reviews).status).toBe("stale");
  }
});
it("does not accept a review from another job, another script, or an old browser", () => {
  const n = withWordTimings(fixture(), phrases, timing);
  for (const target of [narrationTarget(randomUUID(), phrases, n), narrationTarget(jobId, ["Changed text."], n), "f".repeat(64)])
    expect(() => reviewNarration(jobId, phrases, n, { target, decision: "approved", note: "", listened: true, checkedWords: true })).toThrow(/Reload/);
});
it("requires a reason for rejection and preserves decision history", () => {
  const n = approved(withWordTimings(fixture(), phrases, timing)), target = narrationTarget(jobId, phrases, n);
  expect(() => reviewNarration(jobId, phrases, n, { target, decision: "rejected", note: "", listened: false, checkedWords: false })).toThrow(/reason/);
  const rejected = reviewNarration(jobId, phrases, n, { target, decision: "rejected", note: "Timing needs repair", listened: false, checkedWords: false });
  expect(rejected.reviews).toHaveLength(2); expect(visualReview(target, rejected.reviews).status).toBe("rejected");
});
it("changes an animation's approval dependency when the selected recording changes, keeping image reviews", () => {
  const script = phrases.join(" "), { params } = resolveParams(script, "auto"), recipe = getRecipe(params.templateSlug)!;
  const shot = planConcept(script, recipe, params.aspectRatio).shots[0], context = { jobId, shot, params, references: [] };
  const view = () => sceneWorkflow(context), stage = (name: string) => view().stages.find((s) => s.stage === name)!;
  params.sceneWorkflow = { 1: reviewStage(context, { stage: "direction", target: stage("direction").target, decision: "approved", note: "QA" }) };
  params.sceneWorkflow[1] = attachStage(context, "start", stage("start").uploadTarget!, { id: randomUUID(), kind: "image", sha256: "a".repeat(64), width: 640, height: 360 });
  params.sceneWorkflow[1] = reviewStage(context, { stage: "start", target: stage("start").target, decision: "approved", note: "QA" });
  const original = stage("clip").uploadTarget;
  params.narration = approved(withWordTimings(fixture(), phrases, timing)); params.useImportedNarration = true;
  expect(stage("clip").uploadTarget).not.toBe(original); expect(stage("start").status).toBe("approved");
});
it("invalidates the quote when a voice approval is renewed, even with unchanged recording bytes", () => {
  const script = phrases.join(" "), { params } = resolveParams(script, "auto"), recipe = getRecipe(params.templateSlug)!;
  const board = planConcept(script, recipe, params.aspectRatio), references = [{ id: "narrator", sha256: "b".repeat(64), url: "/narrator.png" }];
  params.narration = approved(withWordTimings(fixture(), phrases, timing)); params.useImportedNarration = true;
  const audio = params.narration.audio, alignment = params.narration.alignment!;
  const plan = () => generationPlan(script, params, board, alignVoice(phrases, audio, alignment, "simulation"), references, { audioSha256: audio.sha256, alignmentSha256: alignmentHash(alignment), source: "reviewed" });
  const quote = prepareQuote(jobId, plan(), [], params);
  params.quoteDraft = saveQuoteDraft(quote, { basis: quote.basis, amounts: {}, caps: { usd: "", "higgsfield-credit": "" }, note: "" });
  expect(prepareQuote(jobId, plan(), [], params).state).toBe("current");
  params.narration.reviews[0] = { ...params.narration.reviews[0], id: randomUUID() };
  expect(prepareQuote(jobId, plan(), [], params).state).toBe("stale");
});
