import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { pool, schema, connectionString } from "@/db";

// Waiting renders cannot exhaust the request/query pool used by Studio polling.
const workers = new Pool({ connectionString, max: 2 });

/** Session locks survive awaits, span processes and release when a worker dies.
 * All job writes use this same connection: a disconnected worker cannot publish
 * success through a replacement pooled connection after another worker takes over.
 */
export async function acquireJobLock(jobId: string) {
  const client = await workers.connect();
  let lost: Error | null = null;
  const onError = (error: Error) => { lost = error; };
  client.on("error", onError);
  try {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked", [`cam-job:${jobId}`],
    );
    if (!result.rows[0].locked) {
      client.removeListener("error", onError);
      client.release();
      return null;
    }
    return {
      db: drizzle(client, { schema }),
      async assertOwned() {
        if (lost) throw new Error("The production lost its database connection. Resume it from the Studio.");
        await client.query("SELECT 1");
      },
      async release() {
        try {
          if (!lost) await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [`cam-job:${jobId}`]);
        } catch (error) { lost = error as Error; }
        finally { client.removeListener("error", onError); client.release(lost ?? undefined); }
      },
    };
  } catch (error) {
    client.removeListener("error", onError);
    client.release(error as Error);
    throw error;
  }
}

export async function jobWorkerActive(jobId: string) {
  // Read without taking a lock: UI polling must never steal a worker's claim.
  // PostgreSQL documents bigint advisory keys as (classid << 32) | objid.
  const result = await pool.query<{ active: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM pg_locks
      WHERE locktype = 'advisory' AND granted AND objsubid = 1
        AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
        AND ((classid::bigint << 32) | objid::bigint) = hashtextextended($1, 0)
    ) AS active`, [`cam-job:${jobId}`]);
  return result.rows[0].active;
}
