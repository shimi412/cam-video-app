import { afterEach, describe, expect, it, vi } from "vitest";
import { assertAssetHash, assertExistingSelection, DEMO_SCRIPT, DEMO_DURATION, demoTiming, existingParams, sha256 } from "../src/lib/concept/existing";
import { existingCaptions, existingCaptionPosition, existingShots } from "../src/lib/concept/existing-montage";
import { subtitleFile } from "../src/lib/concept/existing-run";
import { normalizedText } from "../src/lib/concept/text";
import { validateTiming } from "../src/lib/concept/controls";
import { resolveParams } from "../src/lib/brain";
import { estimateProduction } from "../src/lib/pricing";
import { repairCollapsedWords } from "../src/lib/concept/word-timing";

afterEach(() => vi.unstubAllEnvs());

describe("existing CAM film", () => {
  const selection = { templateSlug: "cam-clay", aspectRatio: "9:16" as const };
  it("only accepts its unchanged script, recipe and reviewed format in offline mode", () => {
    vi.stubEnv("PROVIDER_MODE", "dryrun");
    expect(() => assertExistingSelection(DEMO_SCRIPT.replace(/\n/g, "  "), selection)).not.toThrow();
    expect(() => assertExistingSelection(DEMO_SCRIPT.replace("dangerous", "harmless"), selection)).toThrow("unchanged");
    expect(() => assertExistingSelection(DEMO_SCRIPT, { ...selection, aspectRatio: "16:9" })).toThrow("vertical");
    expect(() => assertExistingSelection(DEMO_SCRIPT, { ...selection, templateSlug: "another" })).toThrow("Clay");
    vi.stubEnv("PROVIDER_MODE", "fal");
    expect(() => assertExistingSelection(DEMO_SCRIPT, selection)).toThrow("offline");
  });

  it("detects a replaced recording even if its size is unchanged", () => {
    const approved = Buffer.from("voice one");
    const asset = { file: "assets/narration.wav", bytes: approved.length, sha256: sha256(approved) };
    expect(() => assertAssetHash(approved, asset)).not.toThrow();
    expect(() => assertAssetHash(Buffer.from("voice two"), asset)).toThrow("changed");
    expect(() => assertAssetHash(Buffer.from("short"), asset)).toThrow("changed");
  });

  it("covers every spoken word, including titles and the full last sentence", () => {
    const caps = existingCaptions();
    expect(normalizedText(caps.map((c) => c.text).join(" "))).toBe(normalizedText(DEMO_SCRIPT));
    expect(() => validateTiming(demoTiming, caps)).not.toThrow();
    expect(caps.find((c) => c.text.includes("legitimate question"))).toBeDefined();
    for (let i = 1; i < caps.length; i++) expect(caps[i].start).toBeGreaterThanOrEqual(caps[i - 1].end);
  });

  it("retimes picture only, with no source overruns or gaps between its 12 shots", () => {
    const shots = existingShots();
    expect(shots).toHaveLength(12);
    expect(shots[0].start).toBe(0);
    expect(shots.at(-1)!.end).toBe(DEMO_DURATION);
    for (const [i, s] of shots.entries()) {
      expect(s.mediaStart + (s.end - s.start) * s.rate).toBeLessThan(s.sourceDuration);
      if (i > 0) expect(s.start).toBe(shots[i - 1].end);
      const position = existingCaptionPosition(s.shot);
      expect(position.left).toBeGreaterThanOrEqual(100);
      expect(position.left + position.width).toBeLessThanOrEqual(940);
      expect(position.top).toBeGreaterThanOrEqual(230);
      expect(position.top + 2 * position.fontSize * 1.32 + 20).toBeLessThanOrEqual(1498);
    }
  });

  it("quotes zero and exports the actual voice timestamps", () => {
    const { params } = resolveParams(DEMO_SCRIPT, "manual", selection);
    const reused = existingParams(params);
    expect(reused.durationSeconds).toBe(DEMO_DURATION);
    expect(estimateProduction(reused, 250).totalBilledUsd).toBe(0);
    expect(subtitleFile(existingCaptions(), "vtt")).toMatch(/^WEBVTT\n\n1\n00:00:00.197 -->/);
    expect(subtitleFile(existingCaptions(), "srt")).toContain("00:00:49,793 --> 00:00:50,655");
  });

  it("repairs collapsed word estimates without moving the surrounding speech boundaries", () => {
    const input = [{ word: "legal", start: 17.966, end: 18.184 }, { word: "text,", start: 18.184, end: 18.184 }];
    const fixed = repairCollapsedWords(input);
    expect(fixed.words[0].start).toBe(17.966);
    expect(fixed.words[1].end).toBe(18.184);
    expect(fixed.words[1].start).toBe(fixed.words[0].end);
    expect(fixed.words[1].start).toBeLessThan(18.184);
    expect(input[0].end).toBe(18.184);
    expect(() => repairCollapsedWords([input[1]])).toThrow("cannot be repaired");
  });
});
