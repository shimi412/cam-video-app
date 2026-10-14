import { expect, it, vi } from "vitest";
import { captionGroups } from "../src/lib/concept/montage";
import { measuredPhraseTiming } from "../src/lib/concept/timing";
import { validateTiming } from "../src/lib/concept/controls";
import { finishingBoard } from "../src/lib/concept/finishing";
import { planConcept } from "../src/lib/concept/storyboard";
import { getRecipe } from "../src/lib/recipes";
import { resolveParams } from "../src/lib/brain";

const brain = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/providers/brain", () => ({ requestBrainObject: brain }));
import { directConcept, narrationOverlay } from "../src/lib/concept/ai-direction";

it("keeps the short source-check sentence together and preserves every spoken word", () => {
  const phrase = "Before sharing a claim, check the original source.";
  const timing = measuredPhraseTiming([phrase], [3.08]);
  const captions = captionGroups(timing);
  expect(captions).toHaveLength(1);
  expect(captions[0].text).toBe(phrase);
  expect(() => validateTiming(timing, captions)).not.toThrow();
});

it("balances a long caption without leaving its last word alone or changing timing order", () => {
  const phrase = "Before sharing a claim with anyone, always check the original source.";
  const timing = measuredPhraseTiming([phrase], [6]);
  const captions = captionGroups(timing);
  expect(captions.length).toBeGreaterThan(1);
  expect(captions.at(-1)!.text.split(/\s+/).length).toBeGreaterThanOrEqual(3);
  expect(captions.map((c) => c.text).join(" ")).toBe(phrase);
  expect(captions.every((c, i) => !i || c.start >= captions[i - 1].end)).toBe(true);
  expect(() => validateTiming(timing, captions)).not.toThrow();
});

it("drops a translated AI title while preserving the generated scene and motion", async () => {
  const script = "Read the full passage.";
  const direction = { index: 1, scene: "A clay narrator reads a scroll.", motion: "He unrolls the scroll.",
    references: ["narrator"], endScene: null, overlay: "Leggi il testo per intero", strike: true };
  brain.mockResolvedValueOnce({ scenes: [direction] });
  const result = await directConcept(script, resolveParams(script, "auto").params, getRecipe("cam-clay")!);
  expect(result[1]).toMatchObject({ scene: direction.scene, motion: direction.motion, overlay: null, strike: false });
  expect(narrationOverlay("The full passage", script)).toBe("The full passage");
  expect(narrationOverlay("full pass", script)).toBeNull();
});

it("records finishing separately without rewriting the approved board or its visual prompts", () => {
  const board = planConcept("Read the full passage.", getRecipe("cam-clay")!, "9:16");
  board.shots[0].overlay = "Leggi il testo per intero";
  const before = JSON.stringify(board);
  const finished = finishingBoard(board, { hideTitles: true, reason: "Wrong-language title", reviewedBy: "editor" });
  expect(JSON.stringify(board)).toBe(before);
  expect(finished.shots[0].overlay).toBeNull();
  expect(finished.shots[0].narration).toBe(board.shots[0].narration);
  expect(finished.shots[0].imagePrompt).toBe(board.shots[0].imagePrompt);
  expect(finished.shots[0].motionPrompt).toBe(board.shots[0].motionPrompt);
  expect(() => finishingBoard(board, { hideTitles: true, reason: "", reviewedBy: "editor" })).toThrow();
});
