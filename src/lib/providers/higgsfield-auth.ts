import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

let refresh: Promise<string> | undefined;
/** Reuse the explicitly configured local OAuth grant. Never open a checkout,
 * register a new client, print a token or start an interactive login. */
export async function higgsfieldAccessToken() {
  if (process.env.CAM_HIGGSFIELD_ACCESS_TOKEN) return process.env.CAM_HIGGSFIELD_ACCESS_TOKEN;
  const file = process.env.CAM_HIGGSFIELD_AUTH_FILE;
  if (!file || !path.isAbsolute(file) || !file.endsWith("_tokens.json")) throw new Error("Connect Higgsfield to use the Bram voice.");
  if (refresh) return refresh;
  refresh = (async () => {
    const tokens = JSON.parse(await readFile(file, "utf8"));
    if (tokens.access_token && Number(tokens.expires_at) > Date.now() + 60_000) return String(tokens.access_token);
    if (!tokens.refresh_token) throw new Error("Reconnect Higgsfield; the saved access has expired.");
    const client = JSON.parse(await readFile(file.replace(/_tokens\.json$/, "_client_info.json"), "utf8"));
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: String(tokens.refresh_token), client_id: String(client.client_id) });
    if (client.client_secret) body.set("client_secret", String(client.client_secret));
    const response = await fetch("https://mcp.higgsfield.ai/oauth2/token", { method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    if (!response.ok) throw new Error("Reconnect Higgsfield; the saved authorization could not be renewed.");
    const renewed = z.object({ access_token: z.string().min(1), refresh_token: z.string().optional(), expires_in: z.number().positive() }).passthrough().parse(await response.json());
    const updated = { ...tokens, ...renewed, refresh_token: renewed.refresh_token ?? tokens.refresh_token, expires_at: Date.now() + renewed.expires_in * 1000 };
    const temporary = `${file}.cam-${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(updated), { mode: 0o600 }); await rename(temporary, file);
    return renewed.access_token;
  })();
  try { return await refresh; } finally { refresh = undefined; }
}
