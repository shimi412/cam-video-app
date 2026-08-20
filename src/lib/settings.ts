import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { DEFAULT_MARGIN_MULTIPLIER } from "./credits";

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
  return row?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } });
}

export async function getMarginMultiplier(): Promise<number> {
  const value = await getSetting<number>("margin_multiplier");
  return typeof value === "number" && value > 0 ? value : DEFAULT_MARGIN_MULTIPLIER;
}
