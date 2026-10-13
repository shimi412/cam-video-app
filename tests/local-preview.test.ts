import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import os from "node:os";
import path from "node:path";
import { measuredPhraseTiming } from "../src/lib/concept/timing";
import { captionGroups, writeMontage } from "../src/lib/concept/montage";
import { validateTiming } from "../src/lib/concept/controls";
import { planConcept } from "../src/lib/concept/storyboard";
import { getRecipe } from "../src/lib/recipes";
import { SceneMediaSchema, PreviewVoiceSchema, mediaFile } from "../src/lib/concept/preview-inputs";
import { importSceneMedia, verifiedSceneMedia } from "../src/lib/concept/imported-media";
import { localNarration } from "../src/lib/concept/local-voice";

afterEach(() => vi.unstubAllEnvs());

it("uses recorded scene lengths, preserves pauses and captions every word", () => {
  const phrases = ["Read the original passage before sharing it.", "Check the source and compare the surrounding context."];
  const timing = measuredPhraseTiming(phrases, [6.2, 4.7]);
  expect(timing.phrases.map((p) => [p.start, p.end])).toEqual([[.4, 6.6], [6.95, 11.65]]);
  expect(timing.duration).toBe(12.65);
  expect(timing.estimated).toBe(true); // Word alignment is still approximate.
  const captions = captionGroups(timing);
  expect(() => validateTiming(timing, captions)).not.toThrow();
  expect(captions.map((c) => c.text).join(" ")).toBe(phrases.join(" "));
  expect(() => measuredPhraseTiming(phrases, [6.2])).toThrow();
});

it("keeps imported media in the assigned scene and preserves visible placeholders elsewhere", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cam-import-compose-"));
  try {
    await mkdir(path.join(root, "assets"));
    const board = planConcept("First scene has an image. Second scene has a clip. Third scene needs an illustration.", getRecipe("cam-clay")!, "16:9");
    const timing = measuredPhraseTiming(board.shots.map((s) => s.narration), [3, 4, 5]);
    for (const aspect of ["16:9", "9:16", "1:1"] as const) {
      const result = await writeMontage(root, board, timing, aspect, {
        1: { kind: "image", file: "assets/scene-1.png", heldSeconds: 0 },
        2: { kind: "video", file: "assets/scene-2.mp4", heldSeconds: 2 },
      });
      const html = await readFile(path.join(root, "index.html"), "utf8");
      expect(html).toContain('<video id="scene-1"');
      expect(html).toContain('src="assets/scene-1.png"');
      expect(html.match(/PLACEHOLDER VISUAL/g)).toHaveLength(1);
      expect(html).toContain("object-fit:contain");
      expect(result.cues[1]).toMatchObject({ start: 3.75, media: { heldSeconds: 2 } });
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("rejects paths and paid voice IDs in preview input", () => {
  expect(PreviewVoiceSchema.safeParse("elevenlabs/dylan").success).toBe(false);
  expect(SceneMediaSchema.safeParse({ id: "../../outside", kind: "image", sha256: "a".repeat(64), width: 10, height: 10 }).success).toBe(false);
});

it("blocks local synthesis outside the offline preview mode", async () => {
  vi.stubEnv("PROVIDER_MODE", "fal");
  await expect(localNarration("/unused", ["This must never run."], "local-en")).rejects.toThrow("unavailable");
});

it("rejects changed imported pixels before they reach a montage", async () => {
  const id = randomUUID(), dir = path.join(process.cwd(), "storage/imports", id);
  try {
    const pixels = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#123456" } }).png().toBuffer();
    const media = await importSceneMedia(id, pixels);
    expect((await verifiedSceneMedia(id, media)).media.width).toBe(16);
    await writeFile(path.join(dir, mediaFile(media)), "changed after import");
    await expect(verifiedSceneMedia(id, media)).rejects.toThrow("changed");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it("refuses active image formats and disguised files without rasterizing them", async () => {
  const id = randomUUID(), dir = path.join(process.cwd(), "storage/imports", id);
  try {
    await expect(importSceneMedia(id, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>bad</script></svg>'))).rejects.toThrow("still PNG");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
