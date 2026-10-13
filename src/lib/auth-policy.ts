import { isSimulation } from "./providers/mode";

export type Actor = { id: string; email: string; name: string; role: "admin" | "client"; local: boolean };
export function localAccess(host = "localhost") {
  const configured = process.env.CAM_AUTH_MODE;
  if (configured && !["local", "required"].includes(configured)) return false;
  return configured !== "required" && process.env.NODE_ENV !== "production" && isSimulation() && ["localhost", "127.0.0.1", "[::1]"].includes(host);
}
/** Next can normalize request.url to localhost; preserve the exact loopback Host. */
export function localRequestOrigin(request: Request): string | null {
  const url = new URL(request.url);
  if (!localAccess(url.hostname)) return null;
  const host = request.headers.get("host");
  if (!host) return url.origin;
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/i.test(host)) return null;
  try { return new URL(`${url.protocol}//${host}`).origin; } catch { return null; }
}
export function allowedOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("origin"), localOrigin = localRequestOrigin(request);
  if (!origin) return Boolean(localOrigin);
  try { return new URL(origin).origin === new URL(localOrigin ?? process.env.APP_URL ?? request.url).origin; } catch { return false; }
}
export function safeReturn(value: string | null) { return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/"; }
export const localActor: Actor = { id: "local", email: "local@cam.invalid", name: "Local workspace", role: "admin", local: true };
