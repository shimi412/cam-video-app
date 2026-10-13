import { actorFor, withAccess } from "@/lib/access";
import { getBalanceUsd } from "@/lib/credits";
export const GET = withAccess(async (request) => Response.json({ user: await actorFor(request), balance: await getBalanceUsd() }, { headers: { "Cache-Control": "no-store" } }));
