import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { pool } from "../src/db";
import { releaseConfigErrors } from "../src/lib/release-policy";
import { lockedAssets } from "../src/lib/concept/assets";
import { verifyExistingAssets } from "../src/lib/concept/existing";

const exec = promisify(execFile);
async function main() {
  const errors = releaseConfigErrors(process.env), warnings: string[] = [];
  if (Number(process.versions.node.split(".")[0]) < 22) errors.push("Node.js 22 or newer is required.");
  for (const tool of ["ffmpeg", "ffprobe"]) {
    try { await exec(tool, ["-version"], { timeout: 5000 }); }
    catch { errors.push(`${tool} is unavailable.`); }
  }
  try {
    const browser = process.env.HYPERFRAMES_BROWSER_PATH;
    if (!browser || !path.isAbsolute(browser)) throw new Error();
    await access(browser);
  } catch { errors.push("Set HYPERFRAMES_BROWSER_PATH to the installed render browser. No browser was downloaded by this check."); }
  try { await lockedAssets(); } catch { errors.push("The approved CAM character files are missing or changed."); }
  try { await verifyExistingAssets(); } catch { warnings.push("The optional historical film pack is unavailable. New imported-media previews remain available."); }
  try {
    await access(".next/BUILD_ID");
  } catch { errors.push("Run the production build before starting CAM."); }
  const probe = path.join("storage", `.installation-${randomUUID()}`);
  try { await mkdir("storage", { recursive: true }); await writeFile(probe, "check", { flag: "wx", mode: 0o600 }); }
  catch { errors.push("The persistent media directory is not writable."); }
  finally { await rm(probe, { force: true }); }
  try {
    const { rows } = await pool.query("SELECT name, sha256 FROM app_migrations");
    for (const file of (await readdir("migrations")).filter((name) => name.endsWith(".sql"))) {
      const hash = createHash("sha256").update(await readFile(path.join("migrations", file))).digest("hex");
      if (!rows.some((r) => r.name === file && r.sha256 === hash)) errors.push(`Apply the unchanged database migration ${file}.`);
    }
    const active = await pool.query("SELECT count(*) FROM templates WHERE slug='cam-clay' AND status='active'");
    if (Number(active.rows[0].count) !== 1) errors.push("Run db:seed to install the CAM style.");
    const admins = await pool.query("SELECT count(*) FROM app_users WHERE role='admin' AND NOT disabled");
    if (Number(admins.rows[0].count) === 0) warnings.push("Create and accept the first administrator invitation before sharing access.");
  } catch { errors.push("The database is unavailable or incomplete. Check DATABASE_URL and run db:migrate."); }
  console.log(JSON.stringify({ ready: errors.length === 0, mode: "preview", errors, warnings, providerRequests: 0 }, null, 2));
  if (errors.length) process.exitCode = 1;
}
main().catch(() => { console.error("Installation check failed. No credentials were printed."); process.exitCode = 1; }).finally(() => pool.end());
