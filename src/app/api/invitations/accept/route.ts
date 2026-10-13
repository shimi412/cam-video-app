import { acceptInvitation, allowAttempt } from "@/lib/accounts";
import { allowedOrigin } from "@/lib/auth-policy";
import { smallJson } from "@/lib/http";
import { z } from "zod";
export async function POST(request: Request) {
  if (!allowedOrigin(request)) return Response.json({ error: "Open the invitation in this workspace." }, { status: 403 });
  try { const input = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(12).max(128), name: z.string().trim().min(1).max(100) }).strict().parse(await smallJson(request));
    if (!await allowAttempt("invitation-global", 100) || !await allowAttempt(`invite:${input.token}`, 5)) return Response.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
    await acceptInvitation(input); return Response.json({ ok: true });
  } catch { return Response.json({ error: "The invitation is invalid, expired or unavailable. Use a name and a password of 12–128 characters, or request a new invitation." }, { status: 400 }); }
}
