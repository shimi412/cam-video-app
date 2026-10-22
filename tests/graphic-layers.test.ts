import { expect, it } from "vitest";
import sharp from "sharp";
import { graphicLayersSvg } from "../src/lib/concept/graphic-layers";
import type { GraphicLayer } from "../src/lib/concept/types";

it("keeps material definitions independent between scenes and resolves every local SVG reference", () => {
  const layers: GraphicLayer[] = [
    { kind: "symbol", symbol: "crescent", position: "top-left" },
    { kind: "symbol", symbol: "star-of-david", position: "top-center" },
    { kind: "symbol", symbol: "cross", position: "top-right" },
  ];
  const sceneOne = graphicLayersSvg(layers, 1080, 1920, "scene-1");
  const sceneTwo = graphicLayersSvg(layers, 1080, 1920, "scene-2");
  const combined = sceneOne + sceneTwo;
  const ids = [...combined.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  expect(new Set(ids).size).toBe(ids.length);
  for (const reference of combined.matchAll(/(?:href="#|url\(#)([^"\)]+)/g)) {
    expect(ids).toContain(reference[1]);
  }
  // Montage animation must still address each complete badge independently.
  expect(sceneOne).toContain('id="scene-1-0"');
  expect(sceneOne).toContain('id="scene-1-2"');
});

it("rasterizes every sculpted symbol with a transparent surround and visible relief", async () => {
  const symbols: GraphicLayer["symbol"][] = ["crescent", "star-of-david", "cross", "hospital", "book", "scales", "people", "globe"];
  for (const symbol of symbols) {
    const svg = graphicLayersSvg([{ kind: "symbol", symbol, position: "top-center" }], 800, 800)
      .replace('width="100%" height="100%"', 'width="800" height="800"');
    const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(800);
    expect(info.height).toBe(800);
    expect(data[3]).toBe(0);
    let blueReliefPixels = 0;
    let warmClayPixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] < 240) continue;
      if (data[index + 2] > data[index] + 10) blueReliefPixels++;
      if (data[index] > data[index + 2] + 25) warmClayPixels++;
    }
    expect(blueReliefPixels, `${symbol} relief must render`).toBeGreaterThan(250);
    expect(warmClayPixels, `${symbol} clay support must render`).toBeGreaterThan(3000);
  }
});
