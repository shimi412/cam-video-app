import { z } from "zod";
import { assertCamLiveExecution, assertTransportMode, providerOutputUrl, type TransportMode } from "../concept/provider-transports";
import { boundedMedia, UploadNotStartedError, type AssetTransport } from "../concept/media-transfers";

/** fal CDN v3's initiate + PUT contract, matching the installed fal client.
 * No generation, no retry loop, no credentials forwarded to object storage.
 */
export function assetTransport(mode: TransportMode, request: typeof fetch, falKey: string): AssetTransport {
  const call: typeof fetch = (url, init) => {
    assertTransportMode(mode);
    return request(url, { ...init, redirect: "error", signal: AbortSignal.timeout(30_000) });
  };
  return {
    mode,
    async upload(bytes, name, contentType) {
      if (bytes.length > 64 * 1024 * 1024 || !/^[a-f0-9]{64}\.(png|wav)$/.test(name) || !["image/png", "audio/wav"].includes(contentType)) throw new Error("Invalid CAM upload.");
      const initiated = await call("https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", {
        method: "POST", headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json", "X-Fal-Object-Lifecycle": JSON.stringify({ expiration_duration_seconds: 86400 }) },
        body: JSON.stringify({ content_type: contentType, file_name: name }),
      });
      if ([400, 401, 403, 404, 422, 429].includes(initiated.status) && !initiated.redirected) {
        // Parse only a bounded error; never expose raw provider bodies or keys.
        let exhausted = false;
        try {
          const error = JSON.parse((await boundedMedia(new Response(initiated.body), 65536)).toString("utf8"));
          exhausted = initiated.status === 403 && typeof error.detail === "string" && error.detail.includes("Exhausted balance");
        } catch { /* The explicit rejection still proves no upload started. */ }
        throw new UploadNotStartedError(exhausted
          ? "Your fal.ai balance is empty. Add credits in your fal.ai account, then resume here. Your Bram recording is saved and will not be generated again."
          : `File transfer was not started (fal HTTP ${initiated.status}). Check your provider access, then resume.`);
      }
      const result = z.object({ upload_url: z.url(), file_url: z.url() }).parse(JSON.parse((await boundedMedia(initiated, 65536)).toString("utf8")));
      const url = providerOutputUrl(result.file_url, "fal", mode), upload = new URL(result.upload_url);
      const allowedHost = upload.hostname.endsWith(".fal.media") || upload.hostname === "fal.media" || upload.hostname === "storage.googleapis.com" || (mode === "simulation" && upload.hostname === "simulation.invalid");
      if (upload.protocol !== "https:" || upload.username || upload.password || upload.port || !allowedHost) throw new Error("Unexpected object storage upload URL.");
      const put = await call(upload, { method: "PUT", headers: { "Content-Type": contentType }, body: new Uint8Array(bytes) });
      if (!put.ok || put.redirected) { await put.body?.cancel(); throw new Error("Reference upload failed."); }
      await put.body?.cancel();
      // Conservative local reuse window below the requested provider lifetime.
      return { url, expiresAt: Date.now() + 23 * 3600_000 };
    },
    async download(url, provider) {
      return call(providerOutputUrl(url, provider, mode), { method: "GET" });
    },
  };
}

export function connectCamAssets() {
  assertCamLiveExecution();
  if (!process.env.FAL_KEY) throw new Error("CAM asset credentials are missing.");
  return assetTransport("live", fetch, process.env.FAL_KEY);
}
