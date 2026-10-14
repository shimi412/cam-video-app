/** Creates only disposable loopback databases. Never resets the working CAM database. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, cp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";

const exec = promisify(execFile), root = process.cwd();
async function main() {
  const source = new URL(process.env.DATABASE_URL ?? "postgres://cam:cam@localhost:5433/cam_video_app");
  assert(["localhost", "127.0.0.1", "[::1]"].includes(source.hostname), "This test only supports a loopback database.");
  const name = `cam_install_${randomUUID().replaceAll("-", "")}`;
  const adminURL = new URL(source); adminURL.pathname = "/postgres";
  const admin = new Client({ connectionString: adminURL.toString() }); await admin.connect();
  const testURL = new URL(source); testURL.pathname = `/${name}`;
  const client = new Client({ connectionString: testURL.toString() });
  const temporary = await mkdtemp(path.join(tmpdir(), "cam-installation-"));
  let created = false, connected = false;
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: testURL.toString(), PROVIDER_MODE: "dryrun", BRAIN_MODE: "mock", NODE_ENV: "production" };
  const run = (script: string, cwd = root, args: string[] = []) => exec(process.execPath,
    [path.join(root, "node_modules/tsx/dist/cli.mjs"), path.join(root, script), ...args], { cwd, env, timeout: 30_000 });
  try {
    await admin.query(`CREATE DATABASE ${name}`); created = true; await client.connect(); connected = true;
    await run("scripts/migrate.ts"); await run("scripts/seed.ts");
    const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
    for (const table of ["templates", "conversations", "messages", "jobs", "api_calls", "credit_ledger", "settings", "app_users", "app_invitations", "auth_limits", "campaigns", "campaign_briefs", "conversation_attachments", "app_migrations"]) {
      assert(tables.rows.some((r) => r.tablename === table), `Missing table ${table}`);
    }
    assert.equal((await client.query("SELECT * FROM credit_ledger")).rowCount, 0, "Fresh installations must not grant invented credit.");
    assert.equal((await client.query("SELECT * FROM app_users")).rowCount, 0);
    assert.equal((await client.query("SELECT * FROM templates WHERE slug='cam-clay' AND status='active'")).rowCount, 1);
    const conversation = randomUUID(); await client.query("INSERT INTO conversations(id,title) VALUES($1,'Installation proof')", [conversation]);
    await run("scripts/migrate.ts"); await run("scripts/seed.ts");
    assert.equal((await client.query("SELECT * FROM conversations WHERE id=$1", [conversation])).rowCount, 1, "An upgrade must preserve projects.");
    await assert.rejects(() => run("scripts/seed.ts", root, ["--demo-credits"]));
    assert.equal((await client.query("SELECT * FROM credit_ledger")).rowCount, 0);
    // A future broken migration must roll back its preceding DDL.
    await cp(path.join(root, "migrations"), path.join(temporary, "migrations"), { recursive: true });
    await writeFile(path.join(temporary, "migrations/999-failure.sql"), "CREATE TABLE rollback_probe(id integer); SELECT missing_cam_function();");
    await assert.rejects(() => run("scripts/migrate.ts", temporary));
    assert.equal((await client.query("SELECT to_regclass('rollback_probe') AS t")).rows[0].t, null);
    await rm(path.join(temporary, "migrations/999-failure.sql"));
    await writeFile(path.join(temporary, "migrations/000-core.sql"), "-- changed applied baseline");
    await assert.rejects(() => run("scripts/migrate.ts", temporary));
    assert.equal((await client.query("SELECT * FROM conversations WHERE id=$1", [conversation])).rowCount, 1);
    await mkdir("storage/qa", { recursive: true });
    const proof = { checkedAt: new Date().toISOString(), freshInstall: true, repeatableUpgrade: true, projectsPreserved: true,
      migrationRollback: true, changedMigrationRejected: true, initialBalance: 0, providerRequests: 0,
      migrationCount: (await client.query("SELECT * FROM app_migrations")).rowCount, dockerRuntimeTested: false };
    await writeFile("storage/qa/cam-installation-proof.json", JSON.stringify(proof, null, 2));
    console.log(await readFile("storage/qa/cam-installation-proof.json", "utf8"));
  } finally {
    if (connected) await client.end();
    if (created) await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end(); await rm(temporary, { recursive: true, force: true });
  }
}
main().catch(() => { console.error("Fresh installation check failed. Inspect the migrations and local PostgreSQL; credentials were not printed."); process.exitCode = 1; });
