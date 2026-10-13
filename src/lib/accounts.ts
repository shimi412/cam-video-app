import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from "node:crypto";
import { and, eq, isNull, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";

export const Email = z.email().trim().toLowerCase().max(254);
export const Password = z.string().min(12).max(128);
export const Role = z.enum(["client", "admin"]);
export const secretHash = (value: string) => createHash("sha256").update(value).digest("hex");
const key = (password: string, salt: Buffer): Promise<Buffer> => new Promise((resolve, reject) => derive(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, result) => error ? reject(error) : resolve(result)));
export async function hashPassword(password: string) {
  Password.parse(password); const salt = randomBytes(16);
  return `scrypt-v1:${salt.toString("hex")}:${(await key(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const match = /^scrypt-v1:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(stored);
  if (!match || !Password.safeParse(password).success) return false;
  return timingSafeEqual(await key(password, Buffer.from(match[1], "hex")), Buffer.from(match[2], "hex"));
}
/** Atomic across processes. Buckets contain hashes, never credentials. */
export async function allowAttempt(identity: string, maximum = 5, windowSeconds = 900) {
  const result = await db.execute(sql`INSERT INTO auth_limits (key, count, expires_at) VALUES (${secretHash(identity)}, 1, now() + ${windowSeconds} * interval '1 second')
    ON CONFLICT (key) DO UPDATE SET count = CASE WHEN auth_limits.expires_at <= now() THEN 1 ELSE auth_limits.count + 1 END,
    expires_at = CASE WHEN auth_limits.expires_at <= now() THEN now() + ${windowSeconds} * interval '1 second' ELSE auth_limits.expires_at END RETURNING count`);
  return Number(result.rows[0]?.count) <= maximum;
}
export async function authenticate(email: unknown, password: unknown) {
  const parsed = z.object({ email: Email, password: Password }).safeParse({ email, password }); if (!parsed.success) return null;
  if (!await allowAttempt("login-global", 100) || !await allowAttempt(`login:${parsed.data.email}`)) return null;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, parsed.data.email));
  const dummy = `scrypt-v1:${"0".repeat(32)}:${"0".repeat(128)}`;
  const matches = await verifyPassword(parsed.data.password, user?.passwordHash ?? dummy);
  if (!user || !matches || user.disabled || !Role.safeParse(user.role).success) return null;
  return { id: user.id, email: user.email, name: user.name, role: Role.parse(user.role), sessionVersion: user.sessionVersion };
}
export async function invite(input: { email: string; role: "admin" | "client"; createdBy?: string }) {
  const email = Email.parse(input.email), role = Role.parse(input.role), token = randomBytes(32).toString("hex");
  const [row] = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`invite:${email}`}, 0))`);
    await tx.update(schema.invitations).set({ consumedAt: new Date() }).where(and(eq(schema.invitations.email, email), isNull(schema.invitations.consumedAt)));
    return tx.insert(schema.invitations).values({ email, role, createdBy: input.createdBy, tokenHash: secretHash(token), expiresAt: new Date(Date.now() + 48 * 3600_000) }).returning({ id: schema.invitations.id });
  });
  return { id: row.id, token };
}
export async function acceptInvitation(input: { token: string; password: string; name: string }) {
  const parsed = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: Password, name: z.string().trim().min(1).max(100) }).parse(input);
  const passwordHash = await hashPassword(parsed.password);
  return db.transaction(async (tx) => {
    const [candidate] = await tx.select({ email: schema.invitations.email }).from(schema.invitations).where(eq(schema.invitations.tokenHash, secretHash(parsed.token)));
    if (!candidate) throw new Error("This invitation is expired or already used.");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`invite:${candidate.email}`}, 0))`);
    const [invitation] = await tx.update(schema.invitations).set({ consumedAt: new Date() }).where(and(eq(schema.invitations.tokenHash, secretHash(parsed.token)), isNull(schema.invitations.consumedAt), gt(schema.invitations.expiresAt, new Date()))).returning();
    if (!invitation) throw new Error("This invitation is expired or already used.");
    const [existing] = await tx.select().from(schema.users).where(eq(schema.users.email, invitation.email));
    // An invitation can reset access, but cannot change an existing user's role or re-enable a disabled account.
    if (existing?.disabled) throw new Error("This account is disabled. Contact your administrator.");
    if (existing) await tx.update(schema.users).set({ passwordHash, name: parsed.name, sessionVersion: existing.sessionVersion + 1 }).where(eq(schema.users.id, existing.id));
    else await tx.insert(schema.users).values({ email: invitation.email, name: parsed.name, passwordHash, role: Role.parse(invitation.role) });
    return { email: invitation.email };
  });
}
