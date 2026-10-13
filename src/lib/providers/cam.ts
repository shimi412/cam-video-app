import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { assertCamLiveExecution, type JsonRequest, type McpCall } from "../concept/provider-transports";

/** Network wiring for a future authorized run. No route calls this factory;
 * its unconditional gate runs before reading credentials or connecting.
 * No OAuth login, subscription selection, trial activation or POST retry.
 */
export async function connectCamProviders(): Promise<{ fal: JsonRequest; higgsfield: McpCall; close: () => Promise<void> }> {
  assertCamLiveExecution();
  const falKey = process.env.FAL_KEY;
  const higgsfieldToken = process.env.CAM_HIGGSFIELD_ACCESS_TOKEN;
  if (!falKey || !higgsfieldToken) throw new Error("CAM provider credentials are missing.");
  const guardedFetch: typeof fetch = async (input, init) => {
    assertCamLiveExecution();
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
      if (parsed.origin !== "https://queue.fal.run" || parsed.username || parsed.password) throw new Error("Unexpected fal queue URL.");
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
      assertCamLiveExecution();
      if (name !== "generate_audio" && name !== "jobs_wait") throw new Error("Unsupported CAM voice operation.");
      try { return await client.callTool({ name, arguments: args }, undefined, { timeout: 20_000 }); }
      catch { throw new Error("CAM voice provider call failed. Reconcile submissions or resume the saved request ID."); }
    },
    close: () => client.close(),
  };
}
