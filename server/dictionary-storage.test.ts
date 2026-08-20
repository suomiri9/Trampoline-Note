import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { users } from "@shared/models/auth";
import {
  dictionaryEntries,
  dictionarySuggestions,
  skills,
} from "@shared/schema";
import { db, pool } from "./db";
import { runDictionaryMigration } from "./dictionary-migration";
import { DictionaryError, storage } from "./storage";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const userId = `dictionary-test-${randomUUID()}`;
const entryIds: number[] = [];

async function createEntry(
  name: string,
  archived = 0,
): Promise<number> {
  const [entry] = await db
    .insert(dictionaryEntries)
    .values({
      name,
      code: name.slice(0, 12),
      difficulty: 0.5,
      isDrill: 0,
      archived,
    })
    .returning();
  entryIds.push(entry.id);
  return entry.id;
}

describe.skipIf(!hasDatabase)("dictionary storage invariants", () => {
  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await runDictionaryMigration(client);
    } finally {
      client.release();
    }
    await db.insert(users).values({
      id: userId,
      email: `${userId}@test.local`,
      displayName: "Dictionary Test",
    });
  });

  afterAll(async () => {
    await db
      .delete(dictionarySuggestions)
      .where(eq(dictionarySuggestions.userId, userId));
    await db.delete(skills).where(eq(skills.userId, userId));
    for (const id of entryIds) {
      await db.delete(dictionaryEntries).where(eq(dictionaryEntries.id, id));
    }
    await db.delete(users).where(eq(users.id, userId));
  });

  it("returns one personal copy under concurrent adoption retries", async () => {
    const entryId = await createEntry(`Concurrent ${randomUUID()}`);
    const results = await Promise.all([
      storage.adoptDictionaryEntry(userId, entryId),
      storage.adoptDictionaryEntry(userId, entryId),
    ]);

    expect(new Set(results.map((result) => result.skill.id)).size).toBe(1);
    expect(results.map((result) => result.status).sort()).toEqual([
      "created",
      "existing",
    ]);

    const copies = await db
      .select()
      .from(skills)
      .where(and(
        eq(skills.userId, userId),
        eq(skills.dictionaryEntryId, entryId),
      ));
    expect(copies).toHaveLength(1);
  });

  it("restores an archived copy without syncing later dictionary edits into it", async () => {
    const entryId = await createEntry(`Restore ${randomUUID()}`);
    const first = await storage.adoptDictionaryEntry(userId, entryId);
    await db
      .update(skills)
      .set({ name: "My custom copy", archived: 1 })
      .where(eq(skills.id, first.skill.id));
    await db
      .update(dictionaryEntries)
      .set({ name: "Dictionary changed later" })
      .where(eq(dictionaryEntries.id, entryId));

    const restored = await storage.adoptDictionaryEntry(userId, entryId);
    expect(restored.status).toBe("restored");
    expect(restored.skill.id).toBe(first.skill.id);
    expect(restored.skill.archived).toBe(0);
    expect(restored.skill.name).toBe("My custom copy");
  });

  it("rejects missing or archived dictionary references", async () => {
    const archivedId = await createEntry(`Archived ${randomUUID()}`, 1);
    await expect(
      storage.adoptDictionaryEntry(userId, archivedId),
    ).rejects.toMatchObject<Partial<DictionaryError>>({
      code: "not_found",
    });
    await expect(
      storage.adoptDictionaryEntry(userId, 2_147_483_647),
    ).rejects.toMatchObject<Partial<DictionaryError>>({
      code: "not_found",
    });
  });

  it("keeps suggestion retries unique and preserves concurrently accepted alternate names", async () => {
    const entryId = await createEntry(`Suggestions ${randomUUID()}`);
    const repeated = await Promise.allSettled([
      storage.createDictionarySuggestion(userId, entryId, {
        suggestedName: "Same regional name",
      }),
      storage.createDictionarySuggestion(userId, entryId, {
        suggestedName: " same regional name ",
      }),
    ]);
    expect(repeated.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(repeated.filter((result) => result.status === "rejected")).toHaveLength(1);

    const first = await storage.createDictionarySuggestion(userId, entryId, {
      suggestedName: "First accepted name",
    });
    const second = await storage.createDictionarySuggestion(userId, entryId, {
      suggestedName: "Second accepted name",
    });
    await Promise.all([
      storage.resolveDictionarySuggestion(first.id, "accept"),
      storage.resolveDictionarySuggestion(second.id, "accept"),
    ]);
    const entry = await storage.getDictionaryEntry(entryId);
    expect(entry?.altNames).toEqual(
      expect.arrayContaining(["First accepted name", "Second accepted name"]),
    );
  });
});