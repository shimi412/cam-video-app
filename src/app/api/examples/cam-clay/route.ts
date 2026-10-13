import { withAccess } from "@/lib/access";
import { existingAvailability } from "@/lib/concept/existing";

async function handleGET() {
  return Response.json(await existingAvailability(), { headers: { "Cache-Control": "no-store" } });
}

export const GET = withAccess(handleGET);
