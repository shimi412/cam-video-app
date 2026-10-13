import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export const connectionString = process.env.DATABASE_URL ?? "postgres://cam:cam@localhost:5433/cam_video_app";
export const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });
export { schema };

export type Database = NodePgDatabase<typeof schema>;
