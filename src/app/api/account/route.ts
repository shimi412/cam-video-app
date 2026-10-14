import { actorFor, withAccess } from "@/lib/access";
import { getBalanceUsd } from "@/lib/credits";
import { isSimulation } from "@/lib/providers/mode";
export const GET = withAccess(async (request) => Response.json({ user: await actorFor(request), balance: await getBalanceUsd(), preview: isSimulation() }, { headers: { "Cache-Control": "no-store" } }));
