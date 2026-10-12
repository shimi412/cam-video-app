import { afterEach, expect, it, vi } from "vitest";
import { checkAnthropic, checkRunway } from "../src/lib/providers/health";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("checks Anthropic with a model lookup, never a paid completion", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-only");
  const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  expect((await checkAnthropic("claude-sonnet-5")).ok).toBe(true);
  expect(fetcher).toHaveBeenCalledWith("https://api.anthropic.com/v1/models/claude-sonnet-5", expect.not.objectContaining({ method: "POST" }));
});

it("does not mistake a server error for working credentials", async () => {
  vi.stubEnv("RUNWAYML_API_SECRET", "test-only");
  vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
  expect((await checkRunway()).ok).toBe(false);
});
