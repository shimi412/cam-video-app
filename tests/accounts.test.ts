import { describe, it, expect, afterEach, vi } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/accounts";
import { allowedOrigin, localAccess, localRequestOrigin, safeReturn } from "../src/lib/auth-policy";
import { actorFor, withAccess } from "../src/lib/access";
afterEach(() => vi.unstubAllEnvs());
describe("Workspace access boundaries", () => {
  it("the local presentation has client permissions and cannot administer accounts", async () => {
    vi.stubEnv("CAM_LOCAL_DEMO", "1"); vi.stubEnv("CAM_AUTH_MODE", "local");
    vi.stubEnv("PROVIDER_MODE", "dryrun"); vi.stubEnv("NODE_ENV", "development");
    const request = new Request("http://127.0.0.1:3107/api/account");
    expect((await actorFor(request))?.role).toBe("client");
    const handler = vi.fn(async () => Response.json({ ok: true }));
    expect((await withAccess(handler, "admin")(request)).status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
    vi.stubEnv("CAM_LOCAL_DEMO", "0"); expect((await actorFor(request))?.role).toBe("admin");
  });
  it("the presentation flag never enables anonymous access in production", async () => {
    vi.stubEnv("CAM_LOCAL_DEMO", "1"); vi.stubEnv("CAM_AUTH_MODE", "local");
    vi.stubEnv("PROVIDER_MODE", "dryrun"); vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", ""); vi.stubEnv("NEXTAUTH_SECRET", "");
    expect(await actorFor(new Request("http://127.0.0.1:3107/api/account"))).toBeNull();
  });
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
  it("loopback previews use their own origin even when APP_URL points to deployment", () => {
    vi.stubEnv("CAM_AUTH_MODE", "local"); vi.stubEnv("PROVIDER_MODE", "dryrun"); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("APP_URL", "https://cam.example");
    const write = (origin: string) => new Request("http://127.0.0.1:3106/api/campaigns", { method: "POST", headers: { origin } });
    expect(allowedOrigin(write("http://127.0.0.1:3106"))).toBe(true);
    expect(allowedOrigin(write("http://127.0.0.1:3107"))).toBe(false);
    expect(allowedOrigin(write("https://cam.example"))).toBe(false);
    const normalized = new Request("http://localhost:3106/api/test", { method: "POST", headers: { host: "127.0.0.1:3106", origin: "http://127.0.0.1:3106" } });
    expect(allowedOrigin(normalized)).toBe(true);
    expect(localRequestOrigin(new Request("http://localhost:3106/api/test", { headers: { host: "external.example" } }))).toBe(null);
  });
  it("salted passwords verify only the original password", async () => {
    const password = "offline-test-password-only", one = await hashPassword(password), two = await hashPassword(password);
    expect(one).not.toBe(two); expect(await verifyPassword(password, one)).toBe(true); expect(await verifyPassword("different-password", one)).toBe(false); expect(await verifyPassword(password, "malformed")).toBe(false);
  });
});
