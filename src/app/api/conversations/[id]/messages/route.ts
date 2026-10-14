import { withAccess } from "@/lib/access";
import { smallJson } from "@/lib/http";
import { addMessage, conversationExists, MessageInput } from "@/lib/workspace";
import { answerConversation, AssistantInput } from "@/lib/assistant";
export const POST = withAccess(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!await conversationExists(id)) return Response.json({ error: "Conversation not found." }, { status: 404 });
  const body = await smallJson(request).catch(() => null);
  if (body && typeof body === "object" && "assistant" in body && body.assistant === true) {
    const input = AssistantInput.safeParse(body);
    if (!input.success) return Response.json({ error: "Choose up to six references and add a message of up to 6,000 characters." }, { status: 400 });
    try { return Response.json(await answerConversation(id, input.data)); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Assistant request failed." }, { status: 409 }); }
  }
  const input = MessageInput.safeParse(body);
  if (!input.success) return Response.json({ error: "Add a message of up to 6,000 characters." }, { status: 400 });
  try { return Response.json(await addMessage(id, input.data)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not save this message." }, { status: 409 }); }
});
