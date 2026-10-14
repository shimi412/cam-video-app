import { walletTotals } from "@/lib/customer-wallet";
import { actorFor, withAccess } from "@/lib/access";
import { getBalanceUsd } from "@/lib/credits";
import { isSimulation } from "@/lib/providers/mode";
export const GET = withAccess(async (request) => {
  const user = await actorFor(request);
  return Response.json({ user, balance: isSimulation()?await getBalanceUsd():(await walletTotals()).available, preview: isSimulation(),
    connected: !isSimulation() && process.env.CAM_LIVE_ENABLED === "1",
    localDemo: user?.local === true && process.env.CAM_LOCAL_DEMO === "1",
  }, { headers: { "Cache-Control": "no-store" } });
});
