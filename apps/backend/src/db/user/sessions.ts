import { blob, index, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { integer, text } from "drizzle-orm/sqlite-core";
import { uuidv7 } from "uuidv7";

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: text("user_id").notNull(),
    sessionToken: text("session_token").notNull().unique(),
    refreshToken: text("refresh_token").unique(),
    secretHash: blob("secret_hash").notNull().$type<Uint8Array>(),
    metadata: text("metadata", { mode: "json" }).notNull().$type<{
      deviceId?: string;
      deviceName?: string;
      ipAddress?: string;
      userAgent?: string;
      browser?: string;
      location?: {
        country?: string;
        city?: string;
        timezone?: string;
      };
      loginMethod?: "password" | "oauth" | "magic_link";
      [key: string]: any;
    }>(),
    isActive: integer("is_active", { mode: "boolean" }).default(false),
    requires2FA: integer("requires_2fa", { mode: "boolean" }).default(false),
    is2FAVerified: integer("is_2fa_verified", { mode: "boolean" }).default(false),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    lastAccessedAt: integer("last_accessed_at", { mode: "timestamp" })
      .$defaultFn(() => {
        return new Date();
      }),
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
    index("sessions_user_id_idx").on(table.userId),
    uniqueIndex("sessions_session_token_idx").on(table.sessionToken),
    uniqueIndex("sessions_refresh_token_idx").on(table.refreshToken),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ]
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
