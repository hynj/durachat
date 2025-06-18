import {
  sqliteTable,
  text,
  integer,
  blob,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/sqlite-core";
import { uuidv7 } from "uuidv7";

// User settings and API keys for this specific user (stored in user durable object)
export const userSettings = sqliteTable("user_settings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => "user_settings"), // Single row per user DO
  // API Keys (encrypted) - user's own keys take precedence, fallback to system keys
  encryptedApiKeys: text("encrypted_api_keys", { mode: "json" }).$type<Record<string, {
    encryptedData: string;
    iv: string;
    tag: string;
  }>>(),
  // User preferences specific to this user
  preferences: text("preferences", { mode: "json" }).$type<{
    defaultModel?: string;
    defaultProvider?: string;
    theme?: string;
    [key: string]: any;
  }>().$defaultFn(() => ({
    defaultModel: "gemini-2.5-flash-preview-05-20",
    defaultProvider: "google",
    theme: "light",
  })),
  // Credit balance in one hundredths (50p = 5000 for new accounts)
  balanceInOneHundreths: integer("balance").notNull().default(500),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => {
      return new Date();
    }),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$onUpdateFn(() => {
      return new Date();
    }),
});

// Conversations/Chats table
export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    title: text("title").notNull(),
    model: text("model").notNull(),
    provider: text("provider").notNull(),
    systemPrompt: text("system_prompt"),
    isShared: integer("is_shared", { mode: "boolean" }).default(false),
    shareId: text("share_id")
      .unique()
      .$defaultFn(() => uuidv7()),
    parentId: text("parent_id"),
    branchPoint: integer("branch_point"), // Message index where branch occurred
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => {
        return new Date();
      }),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$onUpdateFn(() => {
        return new Date();
      }),
    lastSyncAt: integer("last_sync_at", { mode: "timestamp" }),
    isDeleted: integer("is_deleted", { mode: "boolean" }).default(false),
  },
  (table) => [
    uniqueIndex("conversations_share_id_idx").on(table.shareId),
    index("conversations_parent_id_idx").on(table.parentId),
    index("conversations_updated_at_idx").on(table.updatedAt),
    foreignKey({ columns: [table.parentId], foreignColumns: [table.id] })
  ]
);

// Messages table
export const messages = sqliteTable(
  "messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    content: text("content").notNull(),
    reasoningContent: text("reasoning_content"),
    model: text("model"),
    provider: text("provider"),
    tokenCount: integer("token_count"),
    order: integer("order").notNull(),
    parentMessageId: text("parent_message_id"),
    isStreaming: integer("is_streaming", { mode: "boolean" }).default(false),
    streamCompleted: integer("stream_completed", { mode: "boolean" }).default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => {
        return new Date();
      }),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$onUpdateFn(() => {
        return new Date();
      }),
    lastSyncAt: integer("last_sync_at", { mode: "timestamp" }),
    isDeleted: integer("is_deleted", { mode: "boolean" }).default(false),
  },
  (table) => [
    index("messages_conversation_id_idx").on(
      table.conversationId
    ),
    index("messages_order_idx").on(table.conversationId, table.order),
    index("messages_parent_message_id_idx").on(
      table.parentMessageId
    ),
    foreignKey({ columns: [table.parentMessageId], foreignColumns: [table.id] })
  ]
);

// Attachments table
export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    messageId: text("message_id"),
    conversationId: text("conversation_id").notNull(),
    fileName: text("file_name").notNull(),
    fileType: text("file_type").notNull(),
    fileSize: integer("file_size").notNull(),
    mimeType: text("mime_type").notNull(),
    data: blob("data"), // For small files, or reference to storage
    storageUrl: text("storage_url"), // For larger files
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => {
        return new Date();
      }),
    lastSyncAt: integer("last_sync_at", { mode: "timestamp" }),
    isDeleted: integer("is_deleted", { mode: "boolean" }).default(false),
  },
  (table) => [
    index("attachments_message_id_idx").on(table.messageId),
  ]
);

// Generated images table
export const generatedImages = sqliteTable(
  "generated_images",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    model: text("model").notNull(),
    provider: text("provider").notNull(),
    imageUrl: text("image_url"),
    imageData: blob("image_data"), // Base64 or binary data
    width: integer("width"),
    height: integer("height"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => {
        return new Date();
      }),
    lastSyncAt: integer("last_sync_at", { mode: "timestamp" }),
    isDeleted: integer("is_deleted", { mode: "boolean" }).default(false),
  },
  (table) => [
    index("generated_images_message_id_idx").on(table.messageId),
  ]
);

// Sync metadata table for conflict resolution
export const syncMetadata = sqliteTable("sync_metadata", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  tableName: text("table_name").notNull(),
  recordId: text("record_id").notNull(),
  lastModified: integer("last_modified", { mode: "timestamp" }).notNull(),
  version: integer("version").notNull().default(1),
  checksum: text("checksum"), // For data integrity
  conflictResolved: integer("conflict_resolved", { mode: "boolean" }).default(false),
});

// Shared conversations access table
export const sharedAccess = sqliteTable(
  "shared_access",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    shareId: text("share_id").notNull(),
    accessLevel: text("access_level", { enum: ["read", "comment"] })
      .notNull()
      .default("read"),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => {
        return new Date();
      }),
    lastAccessedAt: integer("last_accessed_at", { mode: "timestamp" }),
  },
  (table) => [
    uniqueIndex("shared_access_share_id_idx").on(table.shareId),
    index("shared_access_conversation_id_idx").on(
      table.conversationId
    )
  ]
);

// Model providers configuration
export const modelProviders = sqliteTable("model_providers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  name: text("name").notNull(),
  apiEndpoint: text("api_endpoint").notNull(),
  supportedModels: text("supported_models", { mode: "json" }).$type<string[]>(),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => {
      return new Date();
    }),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$onUpdateFn(() => {
      return new Date();
    }),
});

export const usage = sqliteTable(
  "usage",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    messageId: text("message_id")
      .references(() => messages.id, { onDelete: "set null" })
      .unique(), // A single message should have one usage record
    model: text("model").notNull(),
    provider: text("provider").notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    cost: integer("cost").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => {
        return new Date();
      }),
  },
  (table) => [
    index("usage_conversation_id_idx").on(
      table.conversationId
    ),
    index("usage_model_idx").on(table.model),
    index("usage_created_at_idx").on(table.createdAt)
  ]
);

export type Usage = typeof usage.$inferSelect;
export type NewUsage = typeof usage.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
export type GeneratedImage = typeof generatedImages.$inferSelect;
export type NewGeneratedImage = typeof generatedImages.$inferInsert;
export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;
