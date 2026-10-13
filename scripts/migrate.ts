import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pool } from "../src/db";
async function main() {
  const client = await pool.connect();
  try { await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtextextended('cam-migrations',0))");
    await client.query("CREATE TABLE IF NOT EXISTS app_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamp NOT NULL DEFAULT now())");
    for (const file of (await readdir("migrations")).filter((name) => name.endsWith(".sql")).sort()) {
      const text = await readFile(path.join("migrations", file), "utf8"), hash = createHash("sha256").update(text).digest("hex");
      const old = await client.query("SELECT sha256 FROM app_migrations WHERE name=$1", [file]);
      if (old.rows.length) { if (old.rows[0].sha256 !== hash) throw new Error(`Applied migration changed: ${file}`); continue; }
      await client.query(text); await client.query("INSERT INTO app_migrations(name,sha256) VALUES($1,$2)", [file,hash]); console.log(`Applied ${file}`);
    } await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); await pool.end(); }
}
main().catch(() => { console.error("Migration failed; transaction rolled back. Check the database configuration and migration checksums."); process.exitCode = 1; });
