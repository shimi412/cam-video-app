import {
  pgTable,
  text,
  uuid,
  timestamp,
  jsonb,
  numeric,
  pgEnum,
  index,
  boolean,
  integer,
  unique,
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
    title: text("title"),
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
    provider: text("provider").notNull(), // openrouter | fal | higgsfield | mock | hyperframes
    kind: callKind("kind").notNull(),
    model: text("model").notNull(),
    realCostUsd: numeric("real_cost_usd", { precision: 14, scale: 8 }).notNull(),
    billedUsd: numeric("billed_usd", { precision: 14, scale: 8 }).notNull(),
    meta: jsonb("meta").notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("api_calls_job_idx").on(t.jobId)],
);

/** Credit movements in USD. Balance = sum(delta). */
export const creditLedger = pgTable("credit_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  deltaUsd: numeric("delta_usd", { precision: 10, scale: 2 }).notNull(),
  wallet: text("wallet").notNull().default("preview"),
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

/** One dedicated CAM workspace, shared by invited clients and Bina admins. */
export const users = pgTable("app_users", {
  id: uuid("id").primaryKey().defaultRandom(), email: text("email").notNull().unique(), name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(), role: text("role").notNull().default("client"),
  disabled: boolean("disabled").notNull().default(false), sessionVersion: integer("session_version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const invitations = pgTable("app_invitations", {
  id: uuid("id").primaryKey().defaultRandom(), email: text("email").notNull(), role: text("role").notNull(),
  tokenHash: text("token_hash").notNull().unique(), expiresAt: timestamp("expires_at").notNull(), consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(), createdBy: uuid("created_by").references(() => users.id),
});
export const authLimits = pgTable("auth_limits", {
  key: text("key").primaryKey(), count: integer("count").notNull(), expiresAt: timestamp("expires_at").notNull(),
});

/** References belong to the conversation, never implicitly to a generated scene. */
export const attachments = pgTable("conversation_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  label: text("label").notNull(), kind: text("kind").notNull(),
  file: text("file"), sha256: text("sha256"), size: integer("size"), url: text("url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("attachments_conversation_idx").on(t.conversationId)]);

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(), title: text("title").notNull(),
  topic: text("topic").notNull(), audience: text("audience").notNull(), objective: text("objective").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const campaignBriefs = pgTable("campaign_briefs", {
  id: uuid("id").primaryKey().defaultRandom(), campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  position: integer("position").notNull(), title: text("title").notNull(), angle: text("angle").notNull(),
  script: text("script").notNull().default(""), conversationId: uuid("conversation_id").references(() => conversations.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("campaign_briefs_campaign_id_position_key").on(t.campaignId, t.position)]);
