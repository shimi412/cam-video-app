import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import manifest from "./assets-manifest.json";
import sheets from "./character-sheets.json";

/** Files are validated once in the October production, then pinned by content. */
export async function lockedAssets() {
  return Promise.all(manifest.map(async (asset) => {
    const sheet = sheets.find(s => s.id === asset.id && s.status === "approved");
    const active = sheet?.path && sheet.sha256 ? {...asset,path:sheet.path,sha256:sheet.sha256} : asset;
    if(active.path !== `public/recipes/cam-clay/${path.basename(active.path)}`)throw new Error("Invalid character asset path.");
    const filePath = path.join(process.cwd(), "public/recipes/cam-clay", path.basename(active.path));
    const hash = createHash("sha256").update(await readFile(filePath)).digest("hex");
    if (hash !== active.sha256) throw new Error(`Locked reference changed: ${asset.id}. Review it before production.`);
    return { ...active, filePath, url: active.path.replace(/^public/, ""), characterSheet: sheet ? {status:sheet.status,sha256:sheet.sha256!,approvedAt:sheet.approvedAt!} : undefined };
  }));
}
