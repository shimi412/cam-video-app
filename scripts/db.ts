/**
 * Local embedded PostgreSQL, no system install required.
 * Usage: pnpm db:start | pnpm db:stop | pnpm db:status
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { Client } from "pg";

const DATA_DIR = path.join(process.cwd(), ".pg-data");
const PORT = 5433;
const USER = "cam";
const DB_NAME = "cam_video_app";

async function binPath(bin: "initdb" | "pg_ctl" | "postgres"): Promise<string> {
  const req = createRequire(require.resolve("embedded-postgres"));
  const bins = await import(req.resolve("@embedded-postgres/darwin-arm64"));
  return bins[bin];
}

async function run(bin: "initdb" | "pg_ctl" | "postgres", args: string[]) {
  execFileSync(await binPath(bin), args, { stdio: "inherit" });
}

async function ensureDatabase() {
  const client = new Client({
    host: "localhost",
    port: PORT,
    user: USER,
    database: "postgres",
  });
  await client.connect();
  const exists = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [DB_NAME],
  );
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE ${DB_NAME}`);
    console.log(`Database ${DB_NAME} created.`);
  }
  await client.end();
}

async function main() {
  const cmd = process.argv[2];
  switch (cmd) {
    case "start": {
      if (!existsSync(DATA_DIR)) {
        // Trust auth: local development only, the client VPS uses password auth.
        await run("initdb", ["-D", DATA_DIR, "-U", USER, "-A", "trust"]);
      }
      await run("pg_ctl", [
        "-D",
        DATA_DIR,
        "-o",
        `-p ${PORT}`,
        "-l",
        path.join(DATA_DIR, "postgres.log"),
        "start",
      ]);
      await ensureDatabase();
      console.log(`PostgreSQL ready on port ${PORT} (db: ${DB_NAME}).`);
      break;
    }
    case "stop":
      await run("pg_ctl", ["-D", DATA_DIR, "stop"]);
      break;
    case "status":
      await run("pg_ctl", ["-D", DATA_DIR, "status"]);
      break;
    default:
      console.error("Usage: tsx scripts/db.ts start|stop|status");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
