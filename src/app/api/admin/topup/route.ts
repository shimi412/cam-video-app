import { withAccess } from "@/lib/access";
import { z } from "zod";
import { addLedgerEntry, getBalanceUsd } from "@/lib/credits";

const bodySchema = z.object({ amountUsd: z.number().positive().max(10000) });

async function handlePOST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid amount" }, { status: 400 });
  }
  // Manual admin top-up in local dev. Stripe checkout replaces this at delivery.
  await addLedgerEntry({
    deltaUsd: parsed.data.amountUsd,
    kind: "topup",
    note: "Manual admin top-up",
  });
  return Response.json({ balance: await getBalanceUsd() });
}

export const POST = withAccess(handlePOST, "admin");
