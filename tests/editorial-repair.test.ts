import { expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getRecipe } from "../src/lib/recipes";
import { resolveParams } from "../src/lib/brain";
import { planConcept } from "../src/lib/concept/storyboard";
import { loadDirectorMemory, parseDirectorMemory } from "../src/lib/concept/director-memory";
import { editorialDirectionIssues, repairEditorialDirections } from "../src/lib/concept/editorial-method";
import { prepareStoryboardDirections, suggestDirection } from "../src/lib/concept/direction";
import { physicalDirectionIssues } from "../src/lib/concept/physical-direction";
import { camFrameComposition } from "../src/lib/concept/frame-composition";
import type { SceneDirection } from "../src/lib/concept/types";
import { generationPlan, IMAGE_ENDPOINT } from "../src/lib/concept/generation-plan";
import { priceCamPlan } from "../src/lib/providers/cam-pricing";
import { placeholderTiming } from "../src/lib/concept/timing";
import { validatePresenterText } from "../src/lib/concept/presenter-text";

const brain = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/providers/brain", () => ({ requestBrainObject: brain }));
import { directConcept, normalizeDirectorScene } from "../src/lib/concept/ai-direction";

const script = "A Muslim, a Jew, and a Christian walk into a hospital. No, this isn't the beginning of a joke. They're all doctors. And they're saving lives together. Welcome to Israel. A country where over two million Arab citizens live, vote, run businesses, and serve in parliament and serve in the Israel Defence Forces. Where a Muslim can command a Jewish soldier in the military. Where an Arab judge can sentence a Jewish president to prison. And where Jews, Muslims, Christians, and Druze share hospitals, universities, and neighborhoods. The world keeps talking about coexistence like it's some impossible dream. But in Israel, coexistence isn't a dream. It's a reality. And maybe the world has something to learn from it.";
const recipe = getRecipe("cam-clay")!;

it("prepares concrete subjects and a varied sequence instead of eleven generic portraits", () => {
  const board = planConcept(script, recipe, "9:16");
  expect(board.shots.filter(shot => shot.visualMode === "presenter-text").length).toBeLessThan(board.shots.length / 2);
  expect(board.shots[0].scene).toContain("hospital entrance");
  expect(board.shots.every(shot => !shot.graphicLayers?.length)).toBe(true);
  expect(board.shots.find(shot => /judge/.test(shot.narration))?.scene).toContain("courtroom");
  expect(board.shots.find(shot => /command/.test(shot.narration))?.scene).toContain("briefing desk");
  expect(board.shots.some(shot => /over-the-shoulder/.test(shot.scene))).toBe(true);
  expect(board.shots.some(shot => /High three-quarter/.test(shot.scene))).toBe(true);
  expect(new Set(board.shots.map(shot => shot.scene)).size).toBeGreaterThan(7);
  expect(board.shots.flatMap(physicalDirectionIssues)).toEqual([]);
  expect(board.shots.every(shot => shot.references.join() === "narrator")).toBe(true);
  expect(board.shots.every(shot => !shot.endImagePrompt)).toBe(true);
});

it("uses an extra image only for a concrete planned transformation", () => {
  const board = planConcept("Explore the history. Check the source.", recipe, "9:16");
  expect(board.shots.map(shot => Boolean(shot.endImagePrompt))).toEqual([true, false]);
  expect(board.shots[0].scene).toContain("closed");
  expect(board.shots[0].endScene).toContain("upright");
  expect(board.shots.flatMap(physicalDirectionIssues)).toEqual([]);
});

it("removes the conflicting portrait placements and forbids square images padded into portrait", () => {
  for (const aspect of ["9:16", "1:1", "16:9"] as const) {
    const board = planConcept("Context can change everything.", recipe, aspect);
    const prompt = board.shots[0].imagePrompt;
    expect(prompt).toContain(`Native ${aspect === "9:16" ? "vertical" : aspect === "1:1" ? "square" : "horizontal"} ${aspect}`);
    expect(prompt).toContain("one continuous scene fills the complete canvas");
    expect(prompt).toContain("Never embed a square image");
    expect(prompt).not.toContain("subject centered in the upper two thirds");
    expect(prompt).not.toContain("lower third of the frame left empty");
    expect(prompt).toContain("upper 38 percent");
    expect(prompt).toContain("never their standing pose, flat lighting");
  }
  expect(camFrameComposition("9:16")).not.toContain("upper 38 percent");
});

it("repairs a repetitive machine board locally while preserving its disclosed image roles", () => {
  const narrations = ["A Muslim, a Jew, and a Christian walk into a hospital.", "They're all doctors.", "Where an Arab judge can sentence a Jewish president to prison."];
  const prepared = prepareStoryboardDirections(narrations);
  const directions = Object.fromEntries(narrations.map((narration, index) => [index + 1, { ...suggestDirection("Context can change everything."), overlay: narration }]));
  expect(editorialDirectionIssues(Object.values(directions))).toContain("presenter-repetition");
  const repaired = repairEditorialDirections(directions, prepared);
  expect(Object.values(repaired).map(d => d.treatment)).toEqual(["literal-action", "literal-action", "literal-action"]);
  expect(Object.values(repaired).every(d => !d.endScene)).toBe(true);
  expect(repaired[3].scene).toContain("courtroom");
  expect(directions[3].scene).not.toContain("courtroom");
});

it("does not rewrite a meaningful machine direction or approved custom directions", () => {
  const phrase = "Check the source.", prepared = prepareStoryboardDirections([phrase]);
  const custom: SceneDirection = { ...prepared[1], scene: "Macro view of the narrator's hand over the source book, with a long side shadow." };
  expect(repairEditorialDirections({ 1: custom }, prepared)[1]).toBe(custom);
  const edited = planConcept(phrase, recipe, "9:16", { 1: custom });
  expect(edited.shots[0].scene).toBe(custom.scene);
});

it("uses the prepared action rather than hiding an unquoted object transformation", () => {
  const prepared = prepareStoryboardDirections(["Read the full passage."]);
  const bad = { ...prepared[1], motion: "He unrolls the scroll.", stateChange: true };
  const repaired = repairEditorialDirections({ 1: bad }, prepared);
  expect(repaired[1]).toEqual(prepared[1]);
  expect(physicalDirectionIssues(repaired[1])).toEqual([]);
});

it("keeps presenter typography readable without discarding a deliberate non-presenter rejection", () => {
  const phrase = "Context can change everything.", prepared = prepareStoryboardDirections([phrase]);
  const presenter = normalizeDirectorScene({ ...prepared[1], strike: true }, phrase);
  expect(presenter.strike).toBe(false);
  expect(() => validatePresenterText(presenter, phrase)).not.toThrow();
  const board = planConcept(phrase, recipe, "9:16", { 1: presenter });
  expect(board.shots[0].narration).toBe(phrase);
  expect(board.shots[0].endImagePrompt).toBeNull();
  expect(board.shots[0].overlay).toBe(phrase);
  const rejection = normalizeDirectorScene({ ...prepared[1], visualMode: "metaphor", treatment: "metaphor", strike: true }, phrase);
  expect(rejection.strike).toBe(true);
});

it.each(["short-action", "identical-endpoints"] as const)("keeps %s model output quotable within the exact original image manifest", async (fault) => {
  const phrase = "Explore the history.", params = resolveParams(phrase, "auto").params;
  const prepared = prepareStoryboardDirections([phrase]), original = prepared[1];
  const generated = fault === "short-action"
    ? { ...original, stateChange: false, actionSeconds: 3 }
    : { ...original, endScene: original.scene };
  const normalized = normalizeDirectorScene(generated, phrase);
  if (fault === "short-action") expect(normalized.actionSeconds).toBe(4);
  const repaired = repairEditorialDirections({ 1: normalized }, prepared);
  expect(physicalDirectionIssues(repaired[1])).toEqual([]);
  const board = planConcept(phrase, recipe, "9:16", repaired);
  const refs = [{ id: "narrator", url: "https://example.com/reference.png", sha256: "a".repeat(64), characterSheet: { status: "approved", sha256: "a".repeat(64), approvedAt: "2026-10-15" } }];
  const plan = generationPlan(phrase, params, board, placeholderTiming([phrase]), refs);
  const imageIds = plan.operations.filter(op => op.kind === "image").map(op => op.id);
  expect(imageIds).toEqual(["scene-1-start", "scene-1-end"]);
  const fal = vi.fn(async (url: string) => {
    expect(url).toContain("models/pricing");
    return { prices: [{ endpoint_id: IMAGE_ENDPOINT, unit_price: .15, unit: "images", currency: "USD" }] };
  });
  const higgsfield = vi.fn(async () => { throw new Error("No voice/video call allowed"); });
  const quote = await priceCamPlan(plan, { fal, higgsfield }, Date.now(), { scope: "storyboard" });
  expect(quote.lines.map(line => line.id)).toEqual(imageIds);
  expect(quote.caps.usd).toBe(300_000);
  expect(fal).toHaveBeenCalledOnce();
  expect(fal.mock.calls[0]?.[0]).toContain("models/pricing");
  expect(higgsfield).not.toHaveBeenCalled();
});

it("reads only the bounded reviewed memory section and detects malformed or oversized guidance", async () => {
  const document = "private history must not travel\n<!-- CAM_DIRECTOR_RULES_START -->\nUseful composition rule.\n<!-- CAM_DIRECTOR_RULES_END -->\nimplementation secrets stay out";
  expect(parseDirectorMemory(document).rules).toBe("Useful composition rule.");
  expect(() => parseDirectorMemory("no markers")).toThrow(/guidance is unavailable/);
  expect(() => parseDirectorMemory(document + "<!-- CAM_DIRECTOR_RULES_START -->")).toThrow();
  expect(() => parseDirectorMemory(document.replace("Useful composition rule.", "a".repeat(12_001)))).toThrow();
  const root = await mkdtemp(path.join(os.tmpdir(), "cam-director-memory-"));
  try {
    await writeFile(path.join(root, "MEMORY.md"), document);
    const first = await loadDirectorMemory(root);
    await writeFile(path.join(root, "MEMORY.md"), document.replace("Useful", "Updated"));
    const second = await loadDirectorMemory(root);
    expect(first.sha256).not.toBe(second.sha256);
    expect(second.rules).toContain("Updated");
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("actually injects the checked-in memory and exact image slots into the one mocked director request", async () => {
  const phrase = "Explore the history. Check the source.";
  const baseline = planConcept(phrase, recipe, "9:16");
  const directions = baseline.shots.map(({ index, scene, motion, references, endScene, overlay, strike, visualMode, metaphor, stateChange, actionSeconds, breathBefore }) => ({ index, scene, motion, references, endScene, overlay, strike, visualMode, metaphor, stateChange, actionSeconds, breathBefore }));
  brain.mockResolvedValueOnce({ scenes: directions });
  const before = brain.mock.calls.length;
  const result = await directConcept(phrase, resolveParams(phrase, "auto").params, recipe);
  expect(brain.mock.calls.length).toBe(before + 1);
  const input = brain.mock.calls.at(-1)![0];
  const memory = await loadDirectorMemory();
  expect(input.system).toContain(memory.rules);
  expect(input.system).toContain("show both subjects and their relationship");
  expect(input.system).toContain("national flags explicitly needed");
  expect(input.system).toContain(memory.sha256);
  expect(input.system).not.toContain("Findings from the interrupted client test");
  expect(JSON.parse(input.prompt).imageManifest.map((item: { endImageAllowed: boolean }) => item.endImageAllowed)).toEqual([true, false]);
  expect(Object.values(result).map(d => Boolean(d.endScene))).toEqual([true, false]);
});
