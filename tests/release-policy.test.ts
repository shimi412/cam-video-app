import { afterEach, describe, expect, it, vi } from "vitest";
import { releaseConfigErrors } from "../src/lib/release-policy";
import { providerMode } from "../src/lib/providers/mode";

const valid = { CAM_RELEASE: "preview", PROVIDER_MODE: "dryrun", BRAIN_MODE: "mock", CAM_AUTH_MODE: "required", AUTH_SECRET: "a".repeat(48), APP_URL: "https://cam.example.test", AUTH_URL: "https://cam.example.test", DATABASE_URL: "postgres://cam:secret@db/cam" };
afterEach(() => vi.unstubAllEnvs());
describe("first client release", () => {
  it("accepts a protected offline installation and local rehearsal", () => {
    expect(releaseConfigErrors(valid)).toEqual([]);
    expect(releaseConfigErrors({ ...valid, APP_URL: "http://127.0.0.1:3197", AUTH_URL: "http://127.0.0.1:3197" })).toEqual([]);
  });
  it("refuses live generation, local bypass and incomplete configuration", () => {
    expect(releaseConfigErrors({ ...valid, PROVIDER_MODE: "fal", BRAIN_MODE: "api", CAM_AUTH_MODE: "local", AUTH_SECRET: "short" })).toHaveLength(4);
    expect(releaseConfigErrors({})).toHaveLength(7);
  });
  it.each(["http://cam.example.test", "https://cam.example.test/path", "https://cam.example.test?x=1", "https://user:secret@cam.example.test", "https://cam.example.test/"])("refuses an unsafe or ambiguous origin: %s", (origin) => {
    expect(releaseConfigErrors({ ...valid, APP_URL: origin, AUTH_URL: origin })).toHaveLength(1);
  });
  it("does not expose configured secrets in failures", () => {
    expect(JSON.stringify(releaseConfigErrors({ ...valid, DATABASE_URL: "private-invalid-secret", AUTH_URL: "https://other.test" }))).not.toContain("private-invalid-secret");
  });
  it("blocks an accidental live-mode switch after deployment", () => {
    vi.stubEnv("CAM_RELEASE", "preview"); vi.stubEnv("PROVIDER_MODE", "fal");
    expect(() => providerMode()).toThrow("offline");
    vi.stubEnv("PROVIDER_MODE", ""); vi.stubEnv("MOCK_MODE", "false");
    expect(() => providerMode()).toThrow("offline");
    vi.stubEnv("PROVIDER_MODE", "dryrun"); expect(providerMode()).toBe("dryrun");
  });
});
