import { withAccess } from "@/lib/access";
import { smallJson } from "@/lib/http";
import { addMessage, conversationExists, MessageInput } from "@/lib/workspace";
export const POST = withAccess(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!await conversationExists(id)) return Response.json({ error: "Conversation not found." }, { status: 404 });
  const input = MessageInput.safeParse(await smallJson(request).catch(() => null));
  if (!input.success) return Response.json({ error: "Add a message of up to 6,000 characters." }, { status: 400 });
  try { return Response.json(await addMessage(id, input.data)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not save this message." }, { status: 409 }); }
});
