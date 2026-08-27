import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  password: varchar("password"),
  displayName: varchar("display_name"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  focusMemo: text("focus_memo"),
  // Per-user guide for the AI coach's menu reading: what the athlete's
  // abbreviations/notation mean. Free text, injected into the coach prompt.
  menuGuide: text("menu_guide"),
  // When true, the coach treats each menu row as ONE connection (skills
  // performed in sequence) instead of separate skills.
  menuRowConnections: boolean("menu_row_connections").default(true),
  // Debuts page "Choose" picker: JSON string of hidden row keys per section,
  // e.g. {"debut-skill":["12"],"debut-routine":["3"]}. Last write wins.
  debutsHidden: text("debuts_hidden"),
  // JSON blob of general app preferences (theme, time format, skill-name
  // display, turn tracking, archive cascade) so they follow the account
  // across devices. Device-specific settings (offline mode) are NOT here.
  appSettings: text("app_settings"),
  // App-owner flag: gates curation of the shared skills & drills dictionary
  // (entry editor + suggestion review queue). Granted to the owner's account
  // by the startup migration; every admin endpoint re-checks it server-side.
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type SafeUser = Omit<User, "password">;

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    tokenHash: varchar("token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("IDX_password_reset_token_hash").on(table.tokenHash),
    index("IDX_password_reset_user").on(table.userId),
  ]
);

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  usedAt: true,
  createdAt: true,
});

export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
