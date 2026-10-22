import { afterEach, beforeEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { inspectImageQuality } from "../src/lib/concept/image-quality";
import { downloadResult } from "../src/lib/concept/media-transfers";
import { sha256 } from "../src/lib/concept/checkpoints";
import { importSceneMedia, verifiedSceneMedia } from "../src/lib/concept/imported-media";

let directory: string, jobId: string;
beforeEach(async () => {
  vi.stubEnv("PROVIDER_MODE", "dryrun");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden"); }));
  directory = await mkdtemp(path.join(os.tmpdir(), "cam-image-quality-")); jobId = randomUUID();
});
afterEach(async () => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllEnvs(); vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
  await rm(path.join(process.cwd(), "storage/imports", jobId), { recursive: true, force: true });
});

async function picture(mode: "padded" | "smooth" | "horizon" = "padded") {
  const width = 144, height = 256, bytes = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const outer = y < 56 || y >= 200;
    let color = [240 - x / 30, 218 - y / 80, 178];
    if (mode === "padded" && !outer) color = [216 + (x + y) % 11, 190 + (x + y) % 11, 143 + (x + y) % 11];
    if (mode === "horizon" && y >= 80) color = [200 + x / 30, 169, 124];
    // A central subject never occupies the entire image width.
    if (((x - 72) / 25) ** 2 + ((y - 140) / 50) ** 2 < 1) color = [105 + (x + y) % 17, 70 + y / 20, 40];
    for (let c = 0; c < 3; c++) bytes[(y * width + x) * 3 + c] = color[c];
  }
  return sharp(bytes, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

it("flags paired horizontal padding seams while keeping the full original composition intact", async () => {
  const original = await picture();
  const before = sha256(original);
  const report = await inspectImageQuality(original, "9:16");
  expect(report.issues).toEqual([expect.objectContaining({ code: "suspected-padding", axis: "horizontal", boundaries: [.2188, .7813] })]);
  expect(sha256(original)).toBe(before);
  const media = await importSceneMedia(jobId, original, { expectedAspectRatio: "9:16" });
  expect(media.quality).toEqual(report);
  expect(media).toMatchObject({ width: 144, height: 256 });
  const normalized = await verifiedSceneMedia(jobId, media);
  expect(await sharp(normalized.bytes).raw().toBuffer()).toEqual(await sharp(original).raw().toBuffer());
});

it("detects the equivalent side padding in a landscape image", async () => {
  const original = await sharp(await picture()).rotate(90).png().toBuffer();
  const report = await inspectImageQuality(original, "16:9");
  expect(report.issues).toEqual([expect.objectContaining({ code: "suspected-padding", axis: "vertical" })]);
});

it("does not treat intentional quiet space, gradients or a single horizon as padded borders", async () => {
  expect((await inspectImageQuality(await picture("smooth"), "9:16")).issues).toEqual([]);
  expect((await inspectImageQuality(await picture("horizon"), "9:16")).issues).toEqual([]);
  const solid = await sharp({ create: { width: 144, height: 256, channels: 3, background: "#f4e2d0" } }).png().toBuffer();
  expect((await inspectImageQuality(solid, "9:16")).issues).toEqual([]);
});

it("flags a square result for a vertical film, but tolerates ordinary pixel rounding", async () => {
  const square = await sharp({ create: { width: 128, height: 128, channels: 3, background: "#555555" } }).png().toBuffer();
  expect((await inspectImageQuality(square, "9:16")).issues.map(issue => issue.code)).toEqual(["wrong-aspect-ratio"]);
  const rounded = await sharp({ create: { width: 1072, height: 1920, channels: 3, background: "#555555" } }).png().toBuffer();
  expect((await inspectImageQuality(rounded, "9:16")).issues).toEqual([]);
});

it("preserves provider originals and warning evidence across download retries without submitting anything", async () => {
  const original = await picture();
  const download = vi.fn(async () => new Response(new Uint8Array(original)));
  const input = {
    directory, jobId, fingerprint: "a".repeat(64), kind: "image" as const, provider: "fal" as const,
    url: "https://simulation.invalid/image.png", expectedAspectRatio: "9:16" as const,
    transport: { mode: "simulation" as const, download, upload: vi.fn(() => { throw new Error("No upload expected"); }) },
    assertOwned: async () => {},
  };
  const first = await downloadResult(input);
  expect(first.media?.quality?.issues[0]?.code).toBe("suspected-padding");
  const saved = path.join(first.directory, "source-image");
  expect(await readFile(saved)).toEqual(original);
  const second = await downloadResult(input);
  expect(second.media?.quality).toEqual(first.media?.quality);
  expect(second.reused).toBe(true); expect(download).toHaveBeenCalledTimes(1);
  expect(input.transport.upload).not.toHaveBeenCalled();
  await writeFile(saved, "changed original");
  await expect(downloadResult(input)).rejects.toThrow("Original downloaded image changed");
  expect(download).toHaveBeenCalledTimes(1);
});
