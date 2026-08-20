import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://cam:cam@localhost:5433/cam_video_app",
});

export const db = drizzle(pool, { schema });
export { schema };
