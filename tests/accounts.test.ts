import { describe, it, expect, afterEach, vi } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/accounts";
import { allowedOrigin, localAccess, safeReturn } from "../src/lib/auth-policy";
afterEach(() => vi.unstubAllEnvs());
describe("Workspace access boundaries", () => {
  it("local access cannot open production or a non-loopback host", () => {
    vi.stubEnv("CAM_AUTH_MODE", "local"); vi.stubEnv("PROVIDER_MODE", "dryrun"); vi.stubEnv("NODE_ENV", "development");
    expect(localAccess("localhost")).toBe(true); expect(localAccess("cam.example")).toBe(false);
    vi.stubEnv("NODE_ENV", "production"); expect(localAccess("localhost")).toBe(false);
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("PROVIDER_MODE", "fal"); expect(localAccess("localhost")).toBe(false);
    vi.stubEnv("PROVIDER_MODE", "dryrun"); vi.stubEnv("CAM_AUTH_MODE", "required"); expect(localAccess("localhost")).toBe(false);
  });
  it("protected writes reject other origins and missing origins", () => {
    vi.stubEnv("CAM_AUTH_MODE", "required"); vi.stubEnv("APP_URL", "https://cam.example");
    expect(allowedOrigin(new Request("https://cam.example/api/account", { method: "POST" }))).toBe(false);
    expect(allowedOrigin(new Request("https://cam.example/api/account", { method: "POST", headers: { origin: "https://attacker.example" } }))).toBe(false);
    expect(allowedOrigin(new Request("https://cam.example/api/account", { method: "POST", headers: { origin: "https://cam.example" } }))).toBe(true);
  });
  it("return paths cannot redirect off site", () => {
    expect(safeReturn("//evil.example")).toBe("/"); expect(safeReturn("/\\evil.example")).toBe("/"); expect(safeReturn("https://evil.example")).toBe("/"); expect(safeReturn("/productions?q=test")).toBe("/productions?q=test");
  });
  it("salted passwords verify only the original password", async () => {
    const password = "offline-test-password-only", one = await hashPassword(password), two = await hashPassword(password);
    expect(one).not.toBe(two); expect(await verifyPassword(password, one)).toBe(true); expect(await verifyPassword("different-password", one)).toBe(false); expect(await verifyPassword(password, "malformed")).toBe(false);
  });
});
