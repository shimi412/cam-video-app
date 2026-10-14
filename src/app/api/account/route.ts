import { actorFor, withAccess } from "@/lib/access";
import { getBalanceUsd } from "@/lib/credits";
import { isSimulation } from "@/lib/providers/mode";
export const GET = withAccess(async (request) => {
  const user = await actorFor(request);
  return Response.json({ user, balance: await getBalanceUsd(), preview: isSimulation(),
    localDemo: user?.local === true && process.env.CAM_LOCAL_DEMO === "1",
  }, { headers: { "Cache-Control": "no-store" } });
});
