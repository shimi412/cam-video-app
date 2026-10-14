import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { writeMontage } from "../src/lib/concept/montage";
import { planConcept } from "../src/lib/concept/storyboard";
import { measuredPhraseTiming } from "../src/lib/concept/timing";
import { getRecipe } from "../src/lib/recipes";

it("adds the original CAM logo in all three formats without extending speech, captions or generated scenes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cam-ending-"));
  try {
    const board = planConcept("Context can change everything.", getRecipe("cam-clay")!, "9:16");
    const timing = measuredPhraseTiming(board.shots.map((s) => s.narration), [3]);
    const before = JSON.stringify(timing);
    for (const aspect of ["9:16", "1:1", "16:9"] as const) {
      const result = await writeMontage(root, board, timing, aspect);
      const html = await readFile(path.join(root, "index.html"), "utf8");
      expect(result.duration).toBeCloseTo(timing.duration + 3.4);
      expect(result.brandEnding!.start).toBeCloseTo(timing.duration + .8);
      expect(result.cues.at(-1)!.end).toBe(result.duration);
      expect(result.captions.every((c) => c.end <= timing.duration)).toBe(true);
      expect(html).toContain(`id="voice" src="assets/narration.wav" data-start="0" data-duration="${timing.duration}"`);
      expect(html).toContain('id="cam-ending"');
      expect(await readFile(path.join(root, "assets/cam-logo.png"))).toEqual(await readFile("public/recipes/cam-clay/logo.png"));
    }
    expect(JSON.stringify(timing)).toBe(before);
    // An export of a saved older film keeps its original ending and duration.
    const old = await writeMontage(root, board, timing, "1:1", {}, { brandEnding: false });
    expect(old.duration).toBe(timing.duration);
    expect(old.brandEnding).toBeNull();
    expect(await readFile(path.join(root, "index.html"), "utf8")).not.toContain('id="cam-ending"');
  } finally { await rm(root, { recursive: true, force: true }); }
});
