import { withAccess } from "@/lib/access";
import { conversationView } from "@/lib/workspace";
export const GET = withAccess(async (_request, { params }: { params: Promise<{ id: string }> }) => {
  const value = await conversationView((await params).id);
  return value ? Response.json(value, { headers: { "Cache-Control": "no-store" } }) : Response.json({ error: "Conversation not found." }, { status: 404 });
});
