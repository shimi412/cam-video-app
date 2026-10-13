import { isSimulation } from "./providers/mode";

export type Actor = { id: string; email: string; name: string; role: "admin" | "client"; local: boolean };
export function localAccess(host = "localhost") {
  const configured = process.env.CAM_AUTH_MODE;
  if (configured && !["local", "required"].includes(configured)) return false;
  return configured !== "required" && process.env.NODE_ENV !== "production" && isSimulation() && ["localhost", "127.0.0.1", "[::1]"].includes(host);
}
export function allowedOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  if (!origin) return localAccess(new URL(request.url).hostname);
  try { return new URL(origin).origin === new URL(process.env.APP_URL ?? request.url).origin; } catch { return false; }
}
export function safeReturn(value: string | null) { return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/"; }
export const localActor: Actor = { id: "local", email: "local@cam.invalid", name: "Local workspace", role: "admin", local: true };
