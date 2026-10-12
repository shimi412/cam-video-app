import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import manifest from "./assets-manifest.json";

/** Files are validated once in the October production, then pinned by content. */
export async function lockedAssets() {
  return Promise.all(manifest.map(async (asset) => {
    const filePath = path.join(process.cwd(), "public/recipes/cam-clay", `${asset.id}.png`);
    const hash = createHash("sha256").update(await readFile(filePath)).digest("hex");
    if (hash !== asset.sha256) throw new Error(`Locked reference changed: ${asset.id}. Review it before production.`);
    return { ...asset, filePath, url: asset.path.replace(/^public/, "") };
  }));
}
