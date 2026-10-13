import { expect, it } from "vitest";
import eyal from "../src/lib/concept/eyal-phrases.json";
import { conceptPhrases, normalizedText } from "../src/lib/concept/text";
import { assertNarrationPreserved, planConcept } from "../src/lib/concept/storyboard";
import { placeholderTiming, speechSegments, breathingCuts, shiftTiming } from "../src/lib/concept/timing";
import { captionGroups, conceptCanvas, escapeHtml } from "../src/lib/concept/montage";
import { validateTiming } from "../src/lib/concept/controls";
import { getRecipe } from "../src/lib/recipes";
import { estimateProduction } from "../src/lib/pricing";
import { resolveParams } from "../src/lib/brain";

it("preserves the approved 14 beats and the board-to-phone end frame", () => {
  const script = eyal.join(" ");
  const board = planConcept(script, getRecipe("cam-clay")!, "9:16");
  expect(conceptPhrases(script)).toHaveLength(14);
  expect(board.shots).toHaveLength(14);
  expect(board.shots[12].endImagePrompt).toContain("smartphone");
  expect(board.shots[0].strike).toBe(true);
  expect(board.shots.every((s)=>s.clipSeconds>=5&&s.clipSeconds<=15)).toBe(true);
  expect(normalizedText(board.shots.map((s)=>s.narration).join(" "))).toBe(normalizedText(script));
  expect(() => assertNarrationPreserved(script, ["A rewritten script."])).toThrow("changed the script");
});

it("does not apply Eyal's scenes to an unrelated script, or silently lose long sentences", () => {
  const script = "Evidence helps people understand an issue. "+Array(65).fill("context").join(" ")+".";
  const board = planConcept(script, getRecipe("cam-clay")!, "1:1");
  expect(board.source).toBe("offline-draft");
  expect(board.shots.every((s)=>s.overlay===null)).toBe(true);
  expect(normalizedText(board.shots.map((s)=>s.narration).join(" "))).toBe(normalizedText(script));
});

it("keeps words ordered, preserves breathing gaps and prevents flashing captions", () => {
  const timing = placeholderTiming(eyal);
  const captions = captionGroups(timing);
  expect(() => validateTiming(timing, captions)).not.toThrow();
  expect(normalizedText(captions.map((c)=>c.text).join(" "))).toBe(normalizedText(eyal.join(" ")));
  expect(() => validateTiming(timing, [{text:"flash",start:1,end:1.1,phrase:1}])).toThrow("flashes");
});

it("finds true silence and inserts breaths only in gaps between phrases", () => {
  expect(speechSegments("silence_start: 0\nsilence_end: 0.4\nsilence_start: 2\nsilence_end: 2.5\nsilence_start: 4", 5)).toEqual([[.4,2],[2.5,4]]);
  expect(speechSegments("silence_start: 0\nsilence_end: 5",5)).toEqual([]);
  const timing = { estimated:false, duration:5, words:[{word:"One.",start:.4,end:2},{word:"Two.",start:2.5,end:4}], phrases:[{phrase:1,text:"One.",start:.4,end:2},{phrase:2,text:"Two.",start:2.5,end:4}] };
  const cuts = breathingCuts(timing, [[.4,2],[2.5,4]]);
  expect(cuts).toEqual([{at:2.25,seconds:.35}]);
  expect(shiftTiming(timing,cuts).words[1].start).toBe(2.85);
  expect(breathingCuts(timing,[[0,5]])).toEqual([]);
});

it("budgets the new video model, end frames and retries; uses 1080 canvases", () => {
  const { params } = resolveParams(eyal.join("\n"),"auto");
  const estimate = estimateProduction(params,2.5);
  expect(params.shotCount).toBe(14);
  expect(estimate.lines.find((l)=>l.label==="Animation (seconds)")?.realUnitUsd).toBe(.112);
  expect(estimate.lines.some((l)=>l.label.includes("30%"))).toBe(true);
  expect(conceptCanvas("9:16")).toEqual({width:1080,height:1920});
  expect(conceptCanvas("16:9")).toEqual({width:1920,height:1080});
  expect(conceptCanvas("1:1")).toEqual({width:1080,height:1080});
  expect(escapeHtml('<script>"&')).toBe("&lt;script&gt;&quot;&amp;");
});
