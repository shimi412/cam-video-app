import path from "node:path";
import { realpath, stat } from "node:fs/promises";

/** Return a playable URL only for a present file inside local storage. */
export async function storedVideoUrl(file: string | null) {
  if (!file) return null;
  const root = path.join(process.cwd(), "storage"), relative = path.relative(root, file);
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || path.extname(file) !== ".mp4") return null;
  try {
    if (!(await realpath(file)).startsWith(await realpath(root) + path.sep) || !(await stat(file)).isFile()) return null;
    return `/api/media/${relative.split(path.sep).map(encodeURIComponent).join("/")}`;
  } catch { return null; }
}
