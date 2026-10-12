import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brainMode, providerMode } from "../src/lib/providers/mode";
import { falImage, falVideo, falTts, falCutout, falTranscribe } from "../src/lib/providers/fal";
import { runwayVideo } from "../src/lib/providers/runway";
import { directStoryboard, sanitizeScene } from "../src/lib/director";
import { directScore } from "../src/lib/collage/score";
import { requestCliObject } from "../src/lib/providers/brain";
import { resolveParams } from "../src/lib/brain";
import { getRecipe } from "../src/lib/recipes";
import { z } from "zod";

describe("offline execution boundary", () => {
  beforeEach(() => {
    vi.stubEnv("PROVIDER_MODE", "dryrun");
    vi.stubEnv("BRAIN_MODE", "api");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-must-never-be-used");
    vi.stubEnv("FAL_KEY", "test-key-must-never-be-used");
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network call"); }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("explicit mock wins over the legacy live flag", () => {
    vi.stubEnv("PROVIDER_MODE", "mock");
    vi.stubEnv("MOCK_MODE", "false");
    expect(providerMode()).toBe("mock");
    expect(brainMode()).toBe("mock");
  });

  it("rejects an unknown media mode instead of falling back to live", () => {
    vi.stubEnv("PROVIDER_MODE", "dry-run");
    vi.stubEnv("MOCK_MODE", "false");
    expect(() => providerMode()).toThrow("Unknown PROVIDER_MODE");
  });

  it("keeps all storyboard and rewrite paths offline even with API credentials", async () => {
    const script = "A book opens. The pages show the full context. Read the whole passage.";
    const recipe = getRecipe("cartoon-flat-vector")!;
    const { params } = resolveParams(script, "manual", { templateSlug: recipe.slug }, { allowArchived: true });
    const story = await directStoryboard(script, recipe, params);
    expect(story.brain).toBe("fallback");
    expect(story.shots.map((shot) => shot.narration).join(" ")).toBe(script);
    expect((await directScore(script, getRecipe("whiteboard-vox-collage")!, params)).brain).toBe("fallback");
    expect(await sanitizeScene("An old book", recipe)).toBeNull();
    vi.stubEnv("BRAIN_MODE", "cli");
    expect(await requestCliObject("do not execute", z.object({ ok: z.boolean() }))).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("blocks direct live provider calls before upload or inference", async () => {
    await expect(falImage.generateImage({ prompt: "book", aspectRatio: "9:16" })).rejects.toThrow("disabled");
    const clip = { prompt: "book", keyframePath: "/missing", durationSeconds: 5, tier: "standard" as const };
    await expect(falVideo.generateClip(clip)).rejects.toThrow("disabled");
    await expect(runwayVideo.generateClip(clip)).rejects.toThrow("disabled");
    await expect(falTts.synthesize({ text: "test", voiceId: "test", language: "en" })).rejects.toThrow("disabled");
    await expect(falCutout.generateCutout({ prompt: "book" })).rejects.toThrow("disabled");
    await expect(falTranscribe.transcribe({ audioPath: "/missing", language: "en" })).rejects.toThrow("disabled");
    expect(fetch).not.toHaveBeenCalled();
  });
});
