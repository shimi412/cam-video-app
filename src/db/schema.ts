import {
  pgTable,
  text,
  uuid,
  timestamp,
  jsonb,
  numeric,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";

export const jobStatus = pgEnum("job_status", [
  "draft",
  "estimated",
  "confirmed",
  "running",
  "succeeded",
  "failed",
]);

export const conversationMode = pgEnum("conversation_mode", ["auto", "manual"]);

export const ledgerKind = pgEnum("ledger_kind", [
  "topup",
  "consumption",
  "adjustment",
]);

export const callKind = pgEnum("call_kind", [
  "chat",
  "image",
  "video",
  "tts",
  "render",
]);

/** Video template library: one row per registered recipe (Cartoon, Whiteboard, ...). */
export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("active"),
  // Frozen recipe: visual style, prompt patterns, pipeline steps, packaging, captions.
  recipe: jsonb("recipe").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title"),
  mode: conversationMode("mode").notNull().default("auto"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant | system | tool
    // AI SDK message parts, stored verbatim so a conversation can be resumed.
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

/** One production run: from pasted script to final video file. */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").references(() => conversations.id),
    templateId: uuid("template_id").references(() => templates.id),
    status: jobStatus("status").notNull().default("draft"),
    script: text("script").notNull(),
    // Resolved production parameters: tone, duration, voice, tier, subtitles...
    params: jsonb("params").notNull().default({}),
    estimateUsd: numeric("estimate_usd", { precision: 10, scale: 2 }),
    billedUsd: numeric("billed_usd", { precision: 10, scale: 2 }),
    outputPath: text("output_path"),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at"),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [index("jobs_status_idx").on(t.status)],
);

/** Metering: every external API call, with real cost and client-billed amount. */
export const apiCalls = pgTable(
  "api_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").references(() => jobs.id),
    conversationId: uuid("conversation_id").references(() => conversations.id),
    provider: text("provider").notNull(), // anthropic | fal | mock | hyperframes
    kind: callKind("kind").notNull(),
    model: text("model").notNull(),
    realCostUsd: numeric("real_cost_usd", { precision: 10, scale: 4 }).notNull(),
    billedUsd: numeric("billed_usd", { precision: 10, scale: 4 }).notNull(),
    meta: jsonb("meta").notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("api_calls_job_idx").on(t.jobId)],
);

/** Credit movements in USD. Balance = sum(delta). */
export const creditLedger = pgTable("credit_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  deltaUsd: numeric("delta_usd", { precision: 10, scale: 2 }).notNull(),
  kind: ledgerKind("kind").notNull(),
  jobId: uuid("job_id").references(() => jobs.id),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Admin configuration: chat model, margin multipliers, spending caps. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
