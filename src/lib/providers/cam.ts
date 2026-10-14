import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { assertCamLiveExecution, type JsonRequest, type McpCall } from "../concept/provider-transports";
import { assertCamConfigured } from "./live-policy";
import { higgsfieldAccessToken } from "./higgsfield-auth";

/** Network wiring for a persisted, explicitly approved production or read-only quote.
 * Its execution gate runs before reading credentials or connecting.
 * No OAuth login, subscription selection, trial activation or POST retry.
 */
export async function connectCamProviders(purpose: "generation" | "quote" = "generation"): Promise<{ fal: JsonRequest; higgsfield: McpCall; close: () => Promise<void> }> {
  if (purpose === "generation") assertCamLiveExecution(); else assertCamConfigured();
  const falKey = process.env.FAL_KEY;
  const higgsfieldToken = await higgsfieldAccessToken();
  if (!falKey || !higgsfieldToken) throw new Error("CAM provider credentials are missing.");
  const guardedFetch: typeof fetch = async (input, init) => {
    if (purpose === "generation") assertCamLiveExecution(); else assertCamConfigured();
    return fetch(input, { ...init, redirect: "error", signal: init?.signal ?? AbortSignal.timeout(20_000) });
  };
  const client = new Client({ name: "cam-video-app", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL("https://mcp.higgsfield.ai/mcp"), {
    fetch: guardedFetch, requestInit: { headers: { Authorization: `Bearer ${higgsfieldToken}` } },
    reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 },
  });
  try { await client.connect(transport); }
  catch { await client.close().catch(() => {}); throw new Error("Could not connect the CAM voice provider."); }
  return {
    async fal(url, init) {
      const parsed = new URL(url);
      const pricing = parsed.origin === "https://api.fal.ai" && ["/v1/models/pricing", "/v1/models/pricing/estimate", "/v1/models/billing-events"].includes(parsed.pathname);
      if ((!pricing && (purpose === "quote" || parsed.origin !== "https://queue.fal.run")) || parsed.username || parsed.password) throw new Error("Unexpected fal URL.");
      if (pricing && init.method !== (parsed.pathname.endsWith("/estimate") ? "POST" : "GET")) throw new Error("Unsupported pricing method.");
      const response = await guardedFetch(url, { ...init, headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" } });
      // Do not log provider error bodies or credentials. A failed POST stays
      // ambiguous in the journal, even on a timeout or a 5xx response.
      if (!response.ok) throw new Error(`fal queue HTTP ${response.status}.`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Empty provider response.");
      const parts: Uint8Array[] = []; let bytes = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw new Error("Provider response too large."); }
          parts.push(value);
        }
      } finally { reader.releaseLock(); }
      return JSON.parse(Buffer.concat(parts).toString("utf8"));
    },
    async higgsfield(name, args) {
      if (purpose === "generation") assertCamLiveExecution(); else assertCamConfigured();
      const quote = name === "generate_audio" && typeof args.params === "object" && args.params !== null && "get_cost" in args.params && args.params.get_cost === true;
      if (purpose === "quote" && !quote && !["models_explore", "balance", "transactions"].includes(name)) throw new Error("This connection can only read provider configuration and quotes.");
      if (!["generate_audio", "jobs_wait", "models_explore", "balance", "transactions"].includes(name)) throw new Error("Unsupported CAM voice operation.");
      try { return await client.callTool({ name, arguments: args }, undefined, { timeout: 20_000 }); }
      catch { throw new Error("CAM voice provider call failed. Reconcile submissions or resume the saved request ID."); }
    },
    close: () => client.close(),
  };
}
