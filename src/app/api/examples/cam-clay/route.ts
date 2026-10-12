import { existingAvailability } from "@/lib/concept/existing";

export async function GET() {
  return Response.json(await existingAvailability(), { headers: { "Cache-Control": "no-store" } });
}
