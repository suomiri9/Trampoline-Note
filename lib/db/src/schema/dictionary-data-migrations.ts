import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// This table records one-time data migrations already applied to the live app.
// Keeping it in the schema prevents Drizzle from proposing a destructive drop
// during the workspace migration.
export const dictionaryDataMigrations = pgTable("dictionary_data_migrations", {
  key: text("key").primaryKey(),
  completedAt: timestamp("completed_at").notNull().defaultNow(),
});