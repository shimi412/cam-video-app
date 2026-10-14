/** No secrets or configured values are included in diagnostics. */
export function releaseConfigErrors(env: Record<string, string | undefined>): string[] {
  const errors: string[] = [];
  if (env.CAM_RELEASE !== "preview") errors.push("CAM_RELEASE must be preview for this release.");
  if (!["mock", "dryrun"].includes(env.PROVIDER_MODE ?? "")) errors.push("PROVIDER_MODE must be dryrun or mock.");
  if (env.BRAIN_MODE !== "mock") errors.push("BRAIN_MODE must be mock.");
  if (env.CAM_AUTH_MODE !== "required") errors.push("CAM_AUTH_MODE must be required.");
  if ((env.AUTH_SECRET?.length ?? 0) < 32) errors.push("AUTH_SECRET needs at least 32 random characters.");
  try {
    const url = new URL(env.APP_URL ?? "");
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      (url.protocol !== "https:" && !(loopback && url.protocol === "http:"))) throw new Error();
    if (env.AUTH_URL !== url.origin || env.APP_URL !== url.origin) throw new Error();
  } catch { errors.push("APP_URL and AUTH_URL must be the same HTTPS origin (HTTP allowed only on loopback)."); }
  try {
    if (!["postgres:", "postgresql:"].includes(new URL(env.DATABASE_URL ?? "").protocol)) throw new Error();
  } catch { errors.push("DATABASE_URL must point to PostgreSQL."); }
  return errors;
}
