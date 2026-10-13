import { afterEach, expect, it, vi } from "vitest";
import { resolveParams } from "../src/lib/brain";
import { prepareConcept } from "../src/lib/concept/preparation";
import { getRecipe } from "../src/lib/recipes";
import { normalizedText } from "../src/lib/concept/text";
import { DEMO_SCRIPT } from "../src/lib/concept/existing";

afterEach(() => vi.unstubAllGlobals());
it("prepares a new script without spending, changing words or claiming its voice is ready", async () => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected external call"); }));
  const script = "Read the whole passage before sharing it. Check the source, then compare the context.";
  for (const aspectRatio of ["9:16", "16:9", "1:1"] as const) {
    const { params } = resolveParams(script, "auto", { aspectRatio });
    const preparation = await prepareConcept(script, params, getRecipe(params.templateSlug)!);
    expect(normalizedText(preparation.shots.map((s) => s.narration).join(" "))).toBe(normalizedText(script));
    expect(preparation.shots.every((s) => s.editorialStatus === "suggested-draft")).toBe(true);
    expect(preparation.durationSeconds).toBeGreaterThan(preparation.shots.at(-1)!.end);
    expect(preparation.canGenerate).toBe(false);
    expect(preparation.voice.status).toBe("identity-verified");
    expect(preparation.voice.cam.finalVoiceApproved).toBe(false);
    expect(preparation.voice.preview).toBe("silent");
    expect(preparation.references.every((r) => /^[0-9a-f]{64}$/.test(r.sha256))).toBe(true);
  }
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps the example's editorial plan distinct from voice approval for a new generation", async () => {
  const { params } = resolveParams(DEMO_SCRIPT, "auto");
  const preparation = await prepareConcept(DEMO_SCRIPT, params, getRecipe(params.templateSlug)!);
  expect(preparation.source).toBe("validated-example");
  expect(preparation.shots).toHaveLength(14);
  expect(preparation.voice.status).toBe("identity-verified");
  expect(preparation.canGenerate).toBe(false);
});
