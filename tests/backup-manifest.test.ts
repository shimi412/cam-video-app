import { afterEach, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile), directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "cam-backup-test-")); directories.push(dir);
  await writeFile(path.join(dir, "database.dump"), "database fixture"); await writeFile(path.join(dir, "media.tar.gz"), "media fixture");
  const run = (command: string) => exec(process.execPath, ["scripts/backup-manifest.mjs", command, dir]);
  return { dir, run };
}
it("verifies both backup files and rejects later corruption without replacing its manifest", async () => {
  const { dir, run } = await fixture(); await run("create"); await run("verify");
  await expect(run("create")).rejects.toThrow();
  await writeFile(path.join(dir, "media.tar.gz"), "changed"); await expect(run("verify")).rejects.toThrow();
});
it("refuses a partial or empty backup", async () => {
  const { dir, run } = await fixture(); await expect(run("verify")).rejects.toThrow();
  await writeFile(path.join(dir, "database.dump"), ""); await expect(run("create")).rejects.toThrow();
});
