import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { actorFor, withAccess } from "@/lib/access";
import { Email, Role, invite } from "@/lib/accounts";
import { smallJson } from "@/lib/http";
export const GET = withAccess(async () => Response.json({ users: await db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role, disabled: schema.users.disabled, createdAt: schema.users.createdAt }).from(schema.users) }, { headers: { "Cache-Control": "no-store" } }), "admin");
export const POST = withAccess(async (request) => {
  try { const data = z.object({ email: Email, role: Role }).strict().parse(await smallJson(request)); const actor = await actorFor(request);
    const invitation = await invite({ ...data, createdBy: actor?.local ? undefined : actor?.id });
    // Fragment keeps the one-use secret out of HTTP access logs and referrers.
    return Response.json({ url: `${new URL("/accept-invitation", process.env.APP_URL ?? request.url)}#${invitation.token}`, expiresInHours: 48, emailSent: false }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Could not prepare this invitation. Check the email and role." }, { status: 400 }); }
}, "admin");
export const PATCH = withAccess(async (request) => {
  try { const data = z.object({ id: z.uuid(), disabled: z.boolean() }).strict().parse(await smallJson(request));
    const actor = await actorFor(request); if (data.id === actor?.id) return Response.json({ error: "You cannot disable your own account." }, { status: 409 });
    await db.transaction(async (tx) => { await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('cam-users', 0))`);
      const users = await tx.select().from(schema.users), current = users.find((u) => u.id === data.id);
      if (!current) throw new Error("Account not found.");
      if (data.disabled && current.role === "admin" && users.filter((u) => u.role === "admin" && !u.disabled).length <= 1) throw new Error("Keep at least one active administrator.");
      await tx.update(schema.users).set({ disabled: data.disabled, sessionVersion: current.sessionVersion + 1 }).where(eq(schema.users.id, data.id));
    }); return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof z.ZodError ? "Invalid account." : error instanceof Error && ["Account not found.", "Keep at least one active administrator."].includes(error.message) ? error.message : "Could not update the account." }, { status: 409 }); }
}, "admin");
