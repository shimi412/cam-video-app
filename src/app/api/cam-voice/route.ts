import { withAccess } from "@/lib/access";
import { camVoiceRecording } from "@/lib/concept/cam-voice";
import { mediaRange } from "@/lib/media-range";

// Fixed, hash-checked local recording. Listening never invokes a voice provider.
async function handleGET(request: Request) {
  try {
    const data = await camVoiceRecording();
    const requested = request.headers.get("range");
    const range = requested ? mediaRange(requested, data.length) : null;
    if (requested && !range) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${data.length}` } });
    const headers = new Headers({ "Content-Type": "audio/wav", "Accept-Ranges": "bytes", "Cache-Control": "private, no-cache" });
    headers.set("Content-Length", String(range ? range.end - range.start + 1 : data.length));
    if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${data.length}`);
    return new Response(request.method === "HEAD" ? null : new Uint8Array(range ? data.subarray(range.start, range.end + 1) : data), { status: range ? 206 : 200, headers });
  } catch {
    return Response.json({ error: "Restore the original CAM voice recording to listen to it." }, { status: 404 });
  }
}


export const GET = withAccess(handleGET);
export const HEAD = GET;
