import { pool } from "@/db";
import { BudgetBookSchema, type BudgetStore } from "./budget";
import { assertTransportMode, type TransportMode } from "./provider-transports";

/** One transaction lock per provider account, across processes and jobs. Uses
 * the existing settings table; simulation never touches the customer ledger.
 */
export function postgresBudgetStore(mode: TransportMode, scope = "cam-provider-account"): BudgetStore {
  if (!/^[a-z0-9-]{1,80}$/.test(scope)) throw new Error("Invalid budget scope.");
  const key = `cam-budget:${mode}:${scope}`;
  return { mode, async transaction(update) {
    assertTransportMode(mode);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
      const existing = await client.query("SELECT value FROM settings WHERE key = $1", [key]);
      const { book, result } = update(existing.rows[0] ? BudgetBookSchema.parse(existing.rows[0].value) : null);
      await client.query("INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", [key, JSON.stringify(book)]);
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
  } };
}
