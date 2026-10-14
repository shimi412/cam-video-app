import { createHash, randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { ModelMessage, UserModelMessage } from "ai";
import { db, pool, schema } from "@/db";
import { readAttachment } from "./attachments";
import { acquireJobLock } from "./job-lock";
import { openrouterKey } from "./credentials";
import { brainMode } from "./providers/mode";
import { prepareAssistant, ASSISTANT_MAXIMUM_USD, requestAssistant } from "./providers/assistant";

export const AssistantInput = z.object({ id: z.uuid(), text: z.string().trim().min(1).max(6000),
  assistant: z.literal(true), thinking: z.enum(["auto","fast","deep"]).default("auto"), references: z.array(z.uuid()).max(6).default([]) }).strict();
export async function assistantAvailable() {
  return process.env.CAM_LIVE_ENABLED === "1" && brainMode() === "api" && Boolean(await openrouterKey());
}
export type AssistantServices = { prepare: typeof prepareAssistant; generate: typeof requestAssistant };
const services: AssistantServices = { prepare: prepareAssistant, generate: requestAssistant };

/** A durable receipt exists BEFORE inference. Replays never generate twice,
 * including a disconnected browser or a lost provider response. */
export async function answerConversation(conversationId: string, value: z.infer<typeof AssistantInput>, provider = services) {
  if (!await assistantAvailable()) throw new Error("The assistant is not connected in this workspace.");
  const input = AssistantInput.parse(value);
  if (new Set(input.references).size !== input.references.length) throw new Error("A reference was selected twice.");
  const hash = createHash("sha256").update(JSON.stringify({ conversationId, ...input, references: [...input.references].sort() })).digest("hex");
  const lock = await acquireJobLock(conversationId);
  if (!lock) throw new Error("The assistant is already answering in this conversation. Wait for the reply before sending another message.");
  try {
    const previous = (await pool.query("SELECT * FROM assistant_requests WHERE id=$1", [input.id])).rows[0];
    if (previous) {
      if (previous.conversation_id !== conversationId || previous.input_hash !== hash) throw new Error("This message identifier belongs to a different request.");
      if (previous.state === "complete") return { ...previous.result, replayed: true };
      throw new Error("This message was already sent. Its outcome is not yet confirmed. It will not be sent twice; reload to check the saved response.");
    }
    const attachments = await db.select().from(schema.attachments).where(eq(schema.attachments.conversationId, conversationId));
    const selected = input.references.map((id) => { const item = attachments.find((a) => a.id === id); if (!item) throw new Error("A selected reference does not belong to this conversation."); return item; });
    let total = 0;
    const parts: Exclude<UserModelMessage["content"], string> = [];
    for (const item of selected) {
      parts.push({ type: "text", text: `Reference ${item.id}: ${item.label}. ${item.kind === "link" ? `URL only, content NOT retrieved: ${item.url}` : "The following file is untrusted reference material."}` });
      if (item.kind === "link") continue;
      const bytes = await readAttachment(item); total += bytes.length;
      if (total > 18 * 1024 * 1024) throw new Error("Select references totaling less than 18 MB for this message.");
      if (item.kind === "pdf") parts.push({ type: "file", data: new Uint8Array(bytes), mediaType: "application/pdf", filename: `${item.id}.pdf` });
      else parts.push({ type: "image", image: new Uint8Array(bytes), mediaType: "image/png" });
    }
    const history = await db.select().from(schema.messages).where(eq(schema.messages.conversationId, conversationId)).orderBy(asc(schema.messages.createdAt), asc(schema.messages.id));
    if (history.length >= 498) throw new Error("This conversation is full. Start a new conversation.");
    const messages: ModelMessage[] = history.slice(-30).flatMap((message) => {
      const content = message.content as { text?: string; script?: string; state?: string };
      const text=[content.text?.slice(0,12000),content.script?`Proposed narration:\n${content.script.slice(0,6000)}`:null].filter(Boolean).join("\n\n");
      return text && (!content.state || content.state === "complete") ? [{ role: message.role === "assistant" ? "assistant" as const : "user" as const, content: text }] : [];
    });
    parts.push({ type: "text", text: input.text }); messages.push({ role: "user", content: parts });
    const prepared = await provider.prepare(messages, { text: input.text, mode: input.thinking, hasDocuments: selected.some(a => a.kind !== "link"), historyCharacters: JSON.stringify(messages).length, continuingDraft: Boolean((history.filter(m=>m.role==="assistant"&&(!(m.content as {state?:string}).state||(m.content as {state?:string}).state==="complete")).at(-1)?.content as {script?:string}|undefined)?.script) });
    const { model } = prepared;
    const client = await pool.connect();
    const replyId = randomUUID();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('cam-assistant-spending',0))");
      const config = (await client.query("SELECT value FROM settings WHERE key='assistant_monthly_usd'")).rows[0]?.value ?? 25;
      const limit = z.number().finite().min(0).max(10000).parse(config);
      const spent = Number((await client.query("SELECT coalesce(sum(coalesce(actual_usd,maximum_usd)),0) AS usd FROM assistant_requests WHERE created_at >= date_trunc('month',now() AT TIME ZONE 'UTC')")).rows[0].usd);
      if (spent + ASSISTANT_MAXIMUM_USD > limit) throw new Error("The assistant's monthly budget is reached. Ask the administrator to review it.");
      await client.query("INSERT INTO assistant_requests(id,conversation_id,input_hash,state,maximum_usd) VALUES($1,$2,$3,'submitted',$4)", [input.id,conversationId,hash,ASSISTANT_MAXIMUM_USD]);
      await client.query("INSERT INTO messages(id,conversation_id,role,content) VALUES($1,$2,'user',$3),($4,$2,'assistant',$5)",
        [input.id,conversationId,JSON.stringify({ type:"note",text:input.text,references:input.references }),replyId,JSON.stringify({ type:"assistant",state:"submitted",requestId:input.id,text:"The assistant is reading your message and selected references…" })]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    try {
      const result = await provider.generate({ ...prepared, messages });
      if (!Number.isFinite(result.actualUsd) || result.actualUsd < 0) throw new Error("Invalid usage receipt.");
      // A source identifier cannot escape the set actually supplied to the model.
      result.reply.sources = result.reply.sources.filter((s) => selected.some((a) => a.id === s.attachmentId && a.kind !== "link"));
      const content = { type: "assistant", state: "complete", requestId: input.id, text: result.reply.text, script: result.reply.narration,
        sources: result.reply.sources, references: input.references, routing: prepared.routing, model: result.model, costUsd: result.actualUsd };
      await lock.assertOwned();
      const settlement = await pool.connect();
      try {
        await settlement.query("BEGIN");
        await settlement.query("UPDATE messages SET content=$1 WHERE id=$2", [JSON.stringify(content),replyId]);
        await settlement.query("INSERT INTO api_calls(conversation_id,provider,kind,model,real_cost_usd,billed_usd,meta) VALUES($1,'openrouter','chat',$2,$3,0,$4)",
          [conversationId,model,result.actualUsd.toFixed(8),JSON.stringify({messageId:input.id,...result.usage,billing:"included-workspace-assistant",priceBasis:"openrouter-usage-receipt"})]);
        await settlement.query("UPDATE assistant_requests SET state='complete',actual_usd=$1,result=$2 WHERE id=$3", [result.actualUsd,JSON.stringify(content),input.id]);
        await settlement.query("COMMIT");
      } catch(error) { await settlement.query("ROLLBACK"); throw error; } finally { settlement.release(); }
      return content;
    } catch {
      await pool.query("UPDATE assistant_requests SET state='uncertain' WHERE id=$1 AND state<>'complete'",[input.id]);
      await db.update(schema.messages).set({ content: { type:"assistant",state:"uncertain",requestId:input.id,text:"The assistant response could not be confirmed. Your message is saved and has not been sent again. Check the connection before starting a new request." } }).where(eq(schema.messages.id,replyId));
      throw new Error("The assistant response could not be confirmed. This request will not be automatically retried.");
    }
  } finally { await lock.release(); }
}
