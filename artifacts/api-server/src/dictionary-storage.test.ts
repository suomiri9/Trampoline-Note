import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { users } from "@shared/models/auth";
import {
  dictionaryEntries,
  dictionaryLibraryImports,
  dictionarySuggestions,
  skills,
} from "@workspace/db";
import { db, pool } from "./db";
import { runDictionaryMigration } from "./dictionary-migration";
import { DictionaryError, storage } from "./storage";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const userId = `dictionary-test-${randomUUID()}`;
const entryIds: number[] = [];

async function createEntry(
  name: string,
  archived = 0,
  numeric: string | null = null,
): Promise<number> {
  const [entry] = await db
    .insert(dictionaryEntries)
    .values({
      name,
      shortName: name.slice(0, 12),
      numeric,
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
    const entryId = await createEntry(`Concurrent ${randomUUID()}`, 0, "41/");
    const results = await Promise.all([
      storage.adoptDictionaryEntry(userId, entryId),
      storage.adoptDictionaryEntry(userId, entryId),
    ]);

    expect(new Set(results.map((result) => result.skill.id)).size).toBe(1);
    expect(results.map((result) => result.status).sort()).toEqual([
      "created",
      "existing",
    ]);
    const entry = await storage.getDictionaryEntry(entryId);
    expect(results[0].skill.code).toBe(entry?.shortName);

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

  it("keeps generated images private until approval and cleans metadata by target", async () => {
    const entryId = await createEntry(`Images ${randomUUID()}`);

    const drafted = await storage.setDictionaryDraftImage(entryId, {
      key: `dictionary-images/${entryId}/draft.png`,
      contentType: "image/png",
      prompt: "Controlled sequence prompt",
      model: "test-image-model",
    });
    expect(drafted.staleKeys).toEqual([]);
    expect(drafted.entry).toMatchObject({
      draftImageKey: `dictionary-images/${entryId}/draft.png`,
      approvedImageKey: null,
    });

    const approved = await storage.approveDictionaryDraftImage(entryId);
    expect(approved.staleKeys).toEqual([]);
    expect(approved.entry).toMatchObject({
      draftImageKey: null,
      approvedImageKey: `dictionary-images/${entryId}/draft.png`,
      approvedImagePrompt: "Controlled sequence prompt",
      approvedImageModel: "test-image-model",
    });
    expect(approved.entry.approvedImageApprovedAt).toBeInstanceOf(Date);

    const secondDraft = await storage.setDictionaryDraftImage(entryId, {
      key: `dictionary-images/${entryId}/replacement.png`,
      contentType: "image/png",
      prompt: "Replacement prompt",
      model: "test-image-model",
    });
    expect(secondDraft.entry.approvedImageKey).toBe(
      `dictionary-images/${entryId}/draft.png`,
    );

    const removedDraft = await storage.removeDictionaryImage(entryId, "draft");
    expect(removedDraft.staleKeys).toEqual([
      `dictionary-images/${entryId}/replacement.png`,
    ]);
    expect(removedDraft.entry.draftImageKey).toBeNull();
    expect(removedDraft.entry.approvedImageKey).toBe(
      `dictionary-images/${entryId}/draft.png`,
    );

    const removedApproved = await storage.removeDictionaryImage(
      entryId,
      "approved",
    );
    expect(removedApproved.staleKeys).toEqual([
      `dictionary-images/${entryId}/draft.png`,
    ]);
    expect(removedApproved.entry.approvedImageKey).toBeNull();
  });

  it("imports personal codes into both short names and editable numerics", async () => {
    const importUserId = `dictionary-import-${randomUUID()}`;
    const marker = randomUUID();
    const existingName = `Existing ${marker}`;
    const newName = `New ${marker}`;
    const existingEntryId = await createEntry(existingName);
    const existingEntry = await storage.getDictionaryEntry(existingEntryId);
    let createdEntryId: number | undefined;

    await db.insert(users).values({
      id: importUserId,
      email: `${importUserId}@test.local`,
      displayName: "Import Test",
    });
    try {
      await db.insert(skills).values([
        {
          userId: importUserId,
          name: existingName,
          code: existingEntry!.shortName,
          difficulty: 0.5,
          isDrill: 0,
        },
        {
          userId: importUserId,
          name: newName,
          code: `N-${marker.slice(0, 8)}`,
          difficulty: 0.8,
          isDrill: 0,
        },
      ]);

      const preview = await storage.previewDictionaryImport(importUserId);
      expect(preview.counts).toEqual({
        total: 2,
        toAdd: 1,
        reused: 1,
        skipped: 0,
      });

      const first = await storage.importLibraryToDictionary(importUserId);
      expect(first).toEqual({
        total: 2,
        added: 1,
        reused: 1,
        linked: 2,
        skipped: 0,
      });

      const second = await storage.importLibraryToDictionary(importUserId);
      expect(second).toEqual({
        total: 2,
        added: 0,
        reused: 2,
        linked: 0,
        skipped: 0,
      });

      // A manual import does not consume the one-time startup claim. The first
      // startup pass still runs (reusing everything) and claims it atomically;
      // later startup processes skip it.
      const initial = await storage.ensureInitialDictionaryImport(importUserId);
      expect(initial).toEqual({
        total: 2,
        added: 0,
        reused: 2,
        linked: 0,
        skipped: 0,
      });
      expect(await storage.ensureInitialDictionaryImport(importUserId)).toBeNull();

      const sourceRows = await db
        .select()
        .from(skills)
        .where(eq(skills.userId, importUserId));
      expect(sourceRows.every((row) => row.dictionaryEntryId != null)).toBe(true);

      const [created] = await db
        .select()
        .from(dictionaryEntries)
        .where(eq(dictionaryEntries.name, newName));
      expect(created).toMatchObject({
        name: newName,
        shortName: `N-${marker.slice(0, 8)}`,
        numeric: `N-${marker.slice(0, 8)}`,
        archived: 0,
      });
      createdEntryId = created.id;
    } finally {
      await db
        .delete(dictionaryLibraryImports)
        .where(eq(dictionaryLibraryImports.userId, importUserId));
      await db.delete(skills).where(eq(skills.userId, importUserId));
      if (createdEntryId != null) {
        await db.delete(dictionaryEntries).where(eq(dictionaryEntries.id, createdEntryId));
      }
      await db.delete(users).where(eq(users.id, importUserId));
    }
  });

  it("serializes imports from different admins so a global entry is created once", async () => {
    const firstUserId = `dictionary-import-a-${randomUUID()}`;
    const secondUserId = `dictionary-import-b-${randomUUID()}`;
    const marker = randomUUID();
    const sharedName = `Shared ${marker}`;
    const sharedCode = `S-${marker.slice(0, 8)}`;
    let createdEntryId: number | undefined;

    await db.insert(users).values([
      { id: firstUserId, email: `${firstUserId}@test.local` },
      { id: secondUserId, email: `${secondUserId}@test.local` },
    ]);
    await db.insert(skills).values([
      {
        userId: firstUserId,
        name: sharedName,
        code: sharedCode,
        difficulty: 0.7,
        isDrill: 0,
      },
      {
        userId: secondUserId,
        name: sharedName,
        code: sharedCode,
        difficulty: 0.7,
        isDrill: 0,
      },
    ]);

    try {
      const results = await Promise.all([
        storage.importLibraryToDictionary(firstUserId),
        storage.importLibraryToDictionary(secondUserId),
      ]);
      expect(results.map((result) => result.added).sort()).toEqual([0, 1]);
      expect(results.map((result) => result.reused).sort()).toEqual([0, 1]);

      const matching = await db
        .select()
        .from(dictionaryEntries)
        .where(and(
          eq(dictionaryEntries.name, sharedName),
          eq(dictionaryEntries.shortName, sharedCode),
        ));
      expect(matching).toHaveLength(1);
      createdEntryId = matching[0].id;

      const linkedSources = await db
        .select()
        .from(skills)
        .where(inArray(skills.userId, [firstUserId, secondUserId]));
      expect(new Set(linkedSources.map((row) => row.dictionaryEntryId))).toEqual(
        new Set([createdEntryId]),
      );
    } finally {
      await db.delete(skills).where(inArray(skills.userId, [firstUserId, secondUserId]));
      if (createdEntryId != null) {
        await db.delete(dictionaryEntries).where(eq(dictionaryEntries.id, createdEntryId));
      }
      await db.delete(users).where(inArray(users.id, [firstUserId, secondUserId]));
    }
  });
});