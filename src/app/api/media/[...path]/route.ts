import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

const STORAGE = path.join(process.cwd(), "storage");

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const filePath = path.join(STORAGE, ...segments);
  // No path traversal outside storage/.
  if (!path.resolve(filePath).startsWith(path.resolve(STORAGE) + path.sep)) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const info = await stat(filePath);
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
    return new Response(stream, {
      headers: {
        "Content-Type": MIME[path.extname(filePath)] ?? "application/octet-stream",
        "Content-Length": String(info.size),
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
