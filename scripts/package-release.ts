import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { verifyExistingAssets } from "../src/lib/concept/existing";

const exec = promisify(execFile);
async function fingerprint(file: string) {
  const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk);
  return { bytes: (await stat(file)).size, sha256: hash.digest("hex") };
}
async function main() {
  const { stdout: dirty } = await exec("git", ["status", "--porcelain"]);
  if (dirty.trim()) throw new Error("Commit and review the release changes before packaging.");
  const commit = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  const manifest = await verifyExistingAssets();
  const directory = path.join("release", `cam-preview-${new Date().toISOString().slice(0, 10)}-${commit.slice(0, 8)}`);
  await mkdir("release", { recursive: true }); await mkdir(directory);
  const sourceName = "cam-preview-source.tar.gz", mediaName = "cam-example-media.tar.gz";
  await exec("git", ["archive", "--format=tar.gz", "--prefix=cam-video-app/", `--output=${path.join(directory, sourceName)}`, commit]);
  const members = manifest.assets.map((asset) => `${manifest.source.replace(/^storage\//, "")}/${asset.file}`);
  if (members.some((name) => name.includes("..") || name.startsWith("/") || name.startsWith("-"))) throw new Error("Unsafe media manifest.");
  await exec("tar", ["-czf", path.join(directory, mediaName), "-C", "storage", ...members], { timeout: 120_000, env: { ...process.env, COPYFILE_DISABLE: "1" } });
  const files = { [sourceName]: await fingerprint(path.join(directory, sourceName)), [mediaName]: await fingerprint(path.join(directory, mediaName)) };
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ kind: "CAM first preview version", createdAt: new Date().toISOString(), commit, files,
    providerMode: "dryrun", brainMode: "mock", paidGenerationEnabled: false, historicalVoice: "Dylan", targetVoice: "Bram (new reading not supplied)",
    remoteDeploymentVerified: false, dockerRuntimeVerified: false, backupRestoreOnHostVerified: false,
    sourceIncludes: "Committed code, installation instructions and client guide. No environment secrets, database, QA logs or user uploads.",
    mediaIncludes: "Only the 15 files pinned by the historical CAM Clay media manifest.",
    verification: { installation: JSON.parse(await readFile("storage/qa/cam-installation-proof.json", "utf8")),
      exports: JSON.parse(await readFile("storage/qa/cam-format-exports-proof.json", "utf8")),
      accounts: JSON.parse(await readFile("storage/qa/cam-access-production-proof.json", "utf8")) } }, null, 2));
  console.log(`Release assembled locally at ${directory}. No upload, deployment or paid call.`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Packaging failed."); process.exitCode = 1; });
