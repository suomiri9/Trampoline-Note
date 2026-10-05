// Image storage backed by the stored_files table. Replaces Replit Object
// Storage so the server runs anywhere with only a Postgres database.

import { eq, sql } from "drizzle-orm";
import type { Response } from "express";
import { db, storedFiles } from "@workspace/db";

// Creates the table on databases copied from Replit, which predate it.
export async function ensureFileStore(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS stored_files (
      key text PRIMARY KEY,
      content_type text NOT NULL,
      data bytea NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);
}

export async function saveFile(key: string, data: Buffer, contentType: string): Promise<void> {
  await db
    .insert(storedFiles)
    .values({ key, data, contentType })
    .onConflictDoUpdate({ target: storedFiles.key, set: { data, contentType } });
}

export async function deleteFile(key: string): Promise<void> {
  await db.delete(storedFiles).where(eq(storedFiles.key, key));
}

// Sends the stored bytes; returns false when the key doesn't exist.
export async function sendFile(
  key: string,
  contentType: string,
  cacheControl: string,
  res: Response,
): Promise<boolean> {
  const [row] = await db
    .select({ data: storedFiles.data })
    .from(storedFiles)
    .where(eq(storedFiles.key, key));
  if (!row) return false;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", cacheControl);
  res.send(row.data);
  return true;
}
