import { withAccess } from "@/lib/access";
import { createReadStream } from "node:fs";
import { stat, realpath } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { mediaRange } from "@/lib/media-range";

const STORAGE = path.join(process.cwd(), "storage");

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json",
  ".srt": "application/x-subrip; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
};

async function handleGET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const filePath = path.join(STORAGE, ...segments);
  // No path traversal outside storage/.
  if (!path.resolve(filePath).startsWith(path.resolve(STORAGE) + path.sep)) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const resolved = await realpath(filePath);
    if (!resolved.startsWith(await realpath(STORAGE) + path.sep)) return new Response("Forbidden", { status: 403 });
    const info = await stat(resolved);
    if (!info.isFile()) return new Response("Not found", { status: 404 });
    const headers = new Headers({ "Content-Type": MIME[path.extname(resolved)] ?? "application/octet-stream", "Accept-Ranges": "bytes" });
    if (path.extname(resolved) === ".srt") headers.set("Content-Disposition", 'attachment; filename="captions.srt"');
    const requested = request.headers.get("range");
    const range = requested ? mediaRange(requested, info.size) : null;
    if (requested && !range) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
    headers.set("Content-Length", String(range ? range.end - range.start + 1 : info.size));
    if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${info.size}`);
    const stream = request.method === "HEAD" ? null : Readable.toWeb(createReadStream(resolved, range ?? undefined)) as ReadableStream;
    return new Response(stream, { status: range ? 206 : 200, headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}



export const GET = withAccess(handleGET);
export const HEAD = GET;
