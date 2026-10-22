import { providerMode } from "./providers/mode";
import { z } from "zod";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { assistantAvailable } from "./assistant";

export const Id = z.uuid();
export const MessageInput = z.object({ id: Id, text: z.string().trim().min(1).max(6000) }).strict();
export const ReferenceLink = z.string().url().max(2000).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Use a public HTTPS link without embedded credentials.");
export const CampaignInput = z.object({ id: Id, title: z.string().trim().min(3).max(160), topic: z.string().trim().min(10).max(2000), audience: z.string().trim().min(3).max(300), objective: z.string().trim().min(3).max(500) }).strict();

export async function conversationExists(id: string) {
  return Id.safeParse(id).success && Boolean((await db.select({ id: schema.conversations.id }).from(schema.conversations).where(eq(schema.conversations.id, id)).limit(1))[0]);
}
export async function conversationView(id: string) {
  if (!Id.safeParse(id).success) return null;
  const [conversation] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, id));
  if (!conversation) return null;
  const [messages, attachments, jobs] = await Promise.all([
    db.select().from(schema.messages).where(eq(schema.messages.conversationId, id)).orderBy(asc(schema.messages.createdAt), asc(schema.messages.id)).limit(500),
    db.select({ id: schema.attachments.id, label: schema.attachments.label, kind: schema.attachments.kind, url: schema.attachments.url, size: schema.attachments.size }).from(schema.attachments).where(eq(schema.attachments.conversationId, id)).orderBy(asc(schema.attachments.createdAt)),
    db.select({ id: schema.jobs.id, status: schema.jobs.status, script: schema.jobs.script, createdAt: schema.jobs.createdAt, aspectRatio: sql<string>`${schema.jobs.params}->>'aspectRatio'`, parentJobId: sql<string | null>`${schema.jobs.params}->>'parentJobId'` }).from(schema.jobs).where(eq(schema.jobs.conversationId, id)).orderBy(desc(schema.jobs.createdAt)).limit(100),
  ]);
  return { conversation, messages, assistant: { available: await assistantAvailable(), maximumMessageUsd: 0.25 }, attachments: attachments.map((item) => ({ ...item, url: item.kind === "link" ? item.url : `/api/attachments/${item.id}` })), jobs };
}
export async function addMessage(conversationId: string, input: z.infer<typeof MessageInput>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${conversationId}, 0))`);
    const [previous] = await tx.select().from(schema.messages).where(eq(schema.messages.id, input.id));
    if (previous) {
      const content = previous.content as { type?: string; text?: string };
      if (previous.conversationId !== conversationId || previous.role !== "user" || content.type !== "note" || content.text !== input.text) throw new Error("This message identifier has already been used. Reload before sending a different message.");
      return previous;
    }
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(schema.messages).where(eq(schema.messages.conversationId, conversationId));
    if (count >= 498) throw new Error("This conversation is full. Start a new conversation.");
    const [message] = await tx.insert(schema.messages).values({ id: input.id, conversationId, role: "user", content: { type: "note", text: input.text } }).returning();
    await tx.insert(schema.messages).values({ conversationId, role: "assistant", content: { type: "note", text: "Saved to this conversation. To turn your final narration into a video, choose Prepare a video below. Reference documents stay attached for your review; their contents are not automatically verified or inserted into the narration." } });
    return message;
  });
}
/** Offline editorial scaffolds. No invented evidence, facts, citations or generated scripts. */
export function campaignAngles(input: Pick<z.infer<typeof CampaignInput>, "topic" | "audience" | "objective">) {
  return [
    { position: 1, title: "Explain the issue", angle: `Introduce the issue for ${input.audience}. Establish what is known about: ${input.topic}. Define unfamiliar terms and supply a verified source. Goal: ${input.objective}.` },
    { position: 2, title: "Examine the evidence", angle: `Choose one precise claim about ${input.topic}. Show the original context, distinguish verified facts from uncertainty, and cite the source. Address ${input.audience}. Goal: ${input.objective}.` },
    { position: 3, title: "Give the audience a next step", angle: `Help ${input.audience} act on ${input.topic}. Give one practical verification step and a clear call to action supporting: ${input.objective}. Avoid claims that the supplied evidence does not support.` },
  ];
}
export async function campaignView(id: string) {
  if (!Id.safeParse(id).success) return null;
  const [campaign] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id));
  if (!campaign) return null;
  const briefs = await db.select().from(schema.campaignBriefs).where(eq(schema.campaignBriefs.campaignId, id)).orderBy(asc(schema.campaignBriefs.position));
  return { campaign, briefs };
}
export async function openBrief(campaignId: string, briefId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${briefId}, 0))`);
    const [brief] = await tx.select().from(schema.campaignBriefs).where(and(eq(schema.campaignBriefs.id, briefId), eq(schema.campaignBriefs.campaignId, campaignId)));
    if (!brief) throw new Error("Brief not found.");
    if (brief.conversationId) return brief.conversationId;
    const [conversation] = await tx.insert(schema.conversations).values({ title: brief.title,executionMode:providerMode() }).returning();
    await tx.insert(schema.messages).values({ conversationId: conversation.id, role: "user", content: { type: "brief", text: `${brief.angle}${brief.script ? `\n\nNarration draft:\n${brief.script}` : ""}`, script: brief.script, campaignId, briefId } });
    await tx.update(schema.campaignBriefs).set({ conversationId: conversation.id, updatedAt: new Date() }).where(eq(schema.campaignBriefs.id, brief.id));
    return conversation.id;
  });
}
