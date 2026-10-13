import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveParams } from "../src/lib/brain";
import { getRecipe } from "../src/lib/recipes";
import { planConcept } from "../src/lib/concept/storyboard";
import { placeholderTiming } from "../src/lib/concept/timing";
import { generationPlan } from "../src/lib/concept/generation-plan";
import { sceneWorkflow, attachStage, reviewStage, type Stage } from "../src/lib/concept/scene-workflow";
import { prepareQuote, saveQuoteDraft, microAmount, decimalAmount } from "../src/lib/concept/quote-preparation";
import type { SceneMedia } from "../src/lib/concept/preview-inputs";

const references = [{ id: "narrator", url: "/narrator.png", sha256: "a".repeat(64) }];
function fixture(end = true) {
  const script = "Check the original source.", jobId = randomUUID(), { params } = resolveParams(script, "auto");
  const board = planConcept(script, getRecipe("cam-clay")!, params.aspectRatio);
  if (end) board.shots[0].endImagePrompt = board.shots[0].imagePrompt;
  else board.shots[0].endImagePrompt = null;
  const context = { jobId, params, shot: board.shots[0], references };
  const view = () => sceneWorkflow(context);
  const step = (stage: Stage) => view().stages.find((s) => s.stage === stage)!;
  const review = (stage: Stage, decision: "approved" | "rejected" = "approved", note = "Offline unit fixture") => {
    params.sceneWorkflow = { 1: reviewStage(context, { stage, target: step(stage).target, decision, note }) };
  };
  const media = (stage: Stage): SceneMedia => ({ id: randomUUID(), kind: stage === "clip" ? "video" : "image", width: 100, height: 100, sha256: "b".repeat(64), ...(stage === "clip" ? { duration: 4 } : {}) });
  const upload = (stage: "start" | "end" | "clip") => {
    params.sceneWorkflow = { 1: attachStage(context, stage, step(stage).uploadTarget!, media(stage)) };
  };
  const quote = (now = 1000) => prepareQuote(jobId, generationPlan(script, params, board, placeholderTiming([script]), references), [view()], params, now);
  return { script, jobId, params, board, context, view, step, review, media, upload, quote };
}

describe("sequential scene review", () => {
  it("requires direction, then start, optional end and animation in order", () => {
    const f = fixture();
    expect(f.step("direction").status).toBe("pending"); expect(f.step("start").status).toBe("blocked");
    expect(() => f.upload("start")).toThrow("previous step");
    f.review("direction"); f.upload("start");
    expect(f.step("start").status).toBe("pending"); expect(() => f.upload("end")).toThrow("previous step");
    f.review("start"); f.upload("end"); f.review("end"); f.upload("clip"); f.review("clip");
    expect(f.view().completed).toBe(4); expect(f.view().paidGenerationAuthorized).toBe(false);
    f.review("start", "rejected");
    expect(f.step("end").status).toBe("stale"); expect(f.step("clip").status).toBe("stale");
    expect(() => f.review("clip")).toThrow("previous step");
    f.review("start");
    expect(f.step("end").status).toBe("stale"); // Approval revoked then restored does not resurrect its old children.
  });

  it("rejects stale tabs, wrong media kinds and attempts to skip the optional end decision", () => {
    const f = fixture(); f.review("direction"); const old = f.step("start").uploadTarget!;
    f.context.shot.scene += " Changed.";
    expect(f.step("direction").status).toBe("stale");
    expect(() => attachStage(f.context, "start", old, f.media("start"))).toThrow();
    f.review("direction");
    expect(() => attachStage(f.context, "start", f.step("start").uploadTarget!, f.media("clip"))).toThrow("still image");
    f.upload("start"); f.review("start");
    expect(() => f.upload("clip")).toThrow("previous step");
    const noEnd = fixture(false); noEnd.review("direction"); noEnd.upload("start"); noEnd.review("start");
    expect(noEnd.step("end").status).toBe("not-needed"); expect(() => noEnd.upload("end")).toThrow();
    noEnd.upload("clip"); noEnd.review("clip"); expect(noEnd.view().completed).toBe(3);
  });

  it("invalidates downstream images when the same bytes are replaced and keeps repeated decisions idempotent", () => {
    const f = fixture(); f.review("direction"); f.upload("start"); f.review("start"); f.upload("end"); f.review("end");
    const old = f.step("start").target, token = f.step("start").token;
    f.review("start"); expect(f.step("start").token).toBe(token); expect(f.step("end").status).toBe("approved");
    f.upload("start"); expect(f.step("start").target).not.toBe(old); expect(f.step("start").status).toBe("stale");
    expect(() => reviewStage(f.context, { stage: "start", target: old, decision: "approved", note: "" })).toThrow();
    expect(f.step("end").status).toBe("stale");
  });
});

describe("quote preparation", () => {
  it("keeps missing prices distinct from zero and never mixes dollars with provider credits", () => {
    const f = fixture(), q = f.quote();
    expect(q.lines.length).toBe(5); expect(q.missingPrices).toBe(5);
    expect(q.totals.every((t) => t.total === null)).toBe(true);
    const voice = q.lines.find((line) => line.id === "voice")!, image = q.lines.find((line) => line.id === "scene-1-start")!;
    f.params.quoteDraft = saveQuoteDraft(q, { basis: q.basis, amounts: { [voice.fingerprint]: "0.15", [image.fingerprint]: "0" }, caps: { usd: "5", "higgsfield-credit": "0.1" }, note: "Artificial offline amounts" }, 1000);
    const priced = f.quote(); expect(priced.missingPrices).toBe(3);
    expect(priced.totals[0].total).toBeNull(); expect(priced.totals[0].subtotal).toBe(0);
    expect(priced.totals[1]).toMatchObject({ subtotal: 150000, total: 150000, overCap: true });
    expect(priced.providerQuoteComplete).toBe(false); expect(priced.canReserve).toBe(false); expect(priced.paidGenerationAuthorized).toBe(false);
  });

  it("prices only remaining generation and invalidates quotes after file or approval changes", () => {
    const f = fixture(), q = f.quote();
    f.params.quoteDraft = saveQuoteDraft(q, { basis: q.basis, amounts: Object.fromEntries(q.lines.map((l) => [l.fingerprint, "1.000001"])), caps: { usd: "100", "higgsfield-credit": "100" }, note: "Fixture" }, 1000);
    expect(f.quote().missingPrices).toBe(0);
    f.review("direction"); f.upload("start"); f.review("start");
    const changed = f.quote(); expect(changed.state).toBe("stale");
    expect(changed.lines.find((l) => l.id === "scene-1-start")).toMatchObject({ amount: 0, quantity: 0, reuse: true });
    expect(changed.lines.find((l) => l.id === "voice")!.amount).toBeNull();
    expect(changed.previousEstimate).not.toBeNull();
    expect(() => saveQuoteDraft(changed, { basis: q.basis, amounts: {}, caps: { usd: "", "higgsfield-credit": "" }, note: "" })).toThrow("changed");
    expect(() => saveQuoteDraft(changed, { basis: changed.basis, amounts: { [changed.lines.find((l) => l.reuse)!.fingerprint]: "1" }, caps: { usd: "", "higgsfield-credit": "" }, note: "wrong" })).toThrow("reused");
  });

  it("rejects malformed amounts and unsourced prices, and expires stored estimates without authorizing a payment", () => {
    for (const text of ["-1", "NaN", "Infinity", "1e6", "1,20", "0.0000001", "1000001"]) expect(() => microAmount(text)).toThrow();
    expect(microAmount("")).toBeNull(); expect(microAmount("0")).toBe(0); expect(microAmount("12.345678")).toBe(12345678);
    expect(decimalAmount(100_000_000)).toBe("100"); expect(decimalAmount(1)).toBe("0.000001"); expect(decimalAmount(0)).toBe("0");
    const f = fixture(), q = f.quote(), amounts = { [q.lines[0].fingerprint]: "1" }, caps = { usd: "", "higgsfield-credit": "" };
    expect(() => saveQuoteDraft(q, { basis: q.basis, amounts, caps, note: "" })).toThrow("source");
    f.params.quoteDraft = saveQuoteDraft(q, { basis: q.basis, amounts, caps, note: "Fixture" }, 1000);
    const expired = f.quote(86401_000); expect(expired.state).toBe("expired"); expect(expired.lines[0].amount).toBeNull();
  });
});
