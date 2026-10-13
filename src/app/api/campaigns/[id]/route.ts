import { withAccess } from "@/lib/access";
import { campaignView } from "@/lib/workspace";
export const GET = withAccess(async (_request, { params }: { params: Promise<{ id: string }> }) => {
  const value = await campaignView((await params).id);
  return value ? Response.json(value, { headers: { "Cache-Control": "no-store" } }) : Response.json({ error: "Campaign not found." }, { status: 404 });
});
