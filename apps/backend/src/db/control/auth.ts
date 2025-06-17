import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { uuidv7 } from "uuidv7";
import { generateSecureCapitalRandomString } from "../../auth/utils";

// Users table for authentication
export const users = sqliteTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    email: text("email"),
    displayName: text("display_name"),
    oAuthID: text("oAuthID"),
    oAuthProvider: text("oauth_provider"),
    keyLogin: text("key_login")
      .notNull()
      .$defaultFn(() => generateSecureCapitalRandomString()),
    // Credit balance in cents (50p = 50 cents for new accounts)
    credits: integer("credits").notNull().default(50),
    instanceIP: text("instance_ip").notNull(),
    preferences: text("preferences", { mode: "json" }).$type<{
      defaultModel?: string;
      theme?: string;
      [key: string]: any;
    }>().$defaultFn(() => ({
      defaultModel: "gemini-2.5-flash-preview-05-20",
      theme: "light",
    })),
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
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
    uniqueIndex("users_key_login_idx").on(table.keyLogin),
    index("users_instance_ip_idx").on(table.instanceIP),
  ]
);

export const twoFactorAuth = sqliteTable(
  "two_factor_auth",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    secret: text("secret").notNull(), // TOTP secret (encrypted)
    backupCodes: text("backup_codes", { mode: "json" }).$type<string[]>(), // Encrypted backup codes
    isEnabled: integer("is_enabled", { mode: "boolean" }).default(false),
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
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
  },
  (table) => [
    uniqueIndex("two_factor_auth_user_id_idx").on(table.userId)
  ]
);

// User credit transactions for tracking credit usage and top-ups
export const userCredits = sqliteTable(
  "user_credits",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["usage", "topup", "refund", "bonus"] }).notNull(),
    amount: integer("amount").notNull(), // Amount in cents (negative for usage, positive for credits)
    balanceAfter: integer("balance_after").notNull(), // Balance after this transaction
    description: text("description"), // Human readable description
    // Usage-specific fields
    provider: text("provider"), // AI provider used (for usage transactions)
    model: text("model"), // Model used (for usage transactions)
    tokensUsed: integer("tokens_used"), // Total tokens used
    // Transaction metadata
    metadata: text("metadata", { mode: "json" }).$type<{
      messageId?: string;
      conversationId?: string;
      promptTokens?: number;
      completionTokens?: number;
      [key: string]: any;
    }>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => {
        return new Date();
      }),
  },
  (table) => [
    index("user_credits_user_id_idx").on(table.userId),
    index("user_credits_type_idx").on(table.type),
    index("user_credits_created_at_idx").on(table.createdAt),
  ]
);

// Billing history for admin tracking and user account management
export const billingHistory = sqliteTable(
  "billing_history",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["purchase", "refund", "adjustment"] }).notNull(),
    amount: integer("amount").notNull(), // Amount in cents
    currency: text("currency").notNull().default("GBP"),
    // Payment details
    paymentMethod: text("payment_method"), // e.g., "stripe", "paypal", "admin"
    paymentId: text("payment_id"), // External payment system ID
    status: text("status", { enum: ["pending", "completed", "failed", "refunded"] })
      .notNull()
      .default("pending"),
    // Admin fields
    adminUserId: text("admin_user_id"), // ID of admin who made manual adjustments
    notes: text("notes"), // Admin notes or reason for adjustment
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
  },
  (table) => [
    index("billing_history_user_id_idx").on(table.userId),
    index("billing_history_type_idx").on(table.type),
    index("billing_history_status_idx").on(table.status),
    index("billing_history_created_at_idx").on(table.createdAt),
  ]
);

export type TwoFactorAuth = typeof twoFactorAuth.$inferSelect;
export type NewTwoFactorAuth = typeof twoFactorAuth.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserCredit = typeof userCredits.$inferSelect;
export type NewUserCredit = typeof userCredits.$inferInsert;
export type BillingHistory = typeof billingHistory.$inferSelect;
export type NewBillingHistory = typeof billingHistory.$inferInsert;
