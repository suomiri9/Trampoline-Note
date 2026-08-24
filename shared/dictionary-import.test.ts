import { describe, expect, it } from "vitest";
import {
  insertDictionaryEntrySchema,
  type DictionaryEntry,
  type Skill,
} from "./schema";
import { buildDictionaryImportPreview } from "./dictionary-import";

function skill(overrides: Partial<Skill> & Pick<Skill, "id" | "name" | "code">): Skill {
  return {
    userId: "owner",
    difficulty: 0,
    isDrill: 0,
    skillIds: null,
    sortOrder: null,
    archived: 0,
    parentSkillId: null,
    shape: null,
    sourceRoutineId: null,
    dictionaryEntryId: null,
    ...overrides,
  };
}

function entry(
  overrides: Partial<DictionaryEntry> & Pick<DictionaryEntry, "id" | "name" | "shortName">,
): DictionaryEntry {
  return {
    numeric: null,
    isDrill: 0,
    difficulty: 0,
    description: null,
    altNames: [],
    archived: 0,
    sortOrder: null,
    ...overrides,
  };
}

describe("dictionary library import preview", () => {
  it("keeps Short name required and Numeric optional in the editor payload", () => {
    expect(insertDictionaryEntrySchema.parse({
      name: "Warm up turn",
      shortName: "Warm up",
      numeric: null,
      isDrill: 1,
      difficulty: 0,
      description: null,
    })).toMatchObject({
      name: "Warm up turn",
      shortName: "Warm up",
      numeric: null,
    });

    const missingShortName = insertDictionaryEntrySchema.safeParse({
      name: "Warm up turn",
      numeric: "41/",
      isDrill: 1,
      difficulty: 0,
    });
    expect(missingShortName.success).toBe(false);
    if (!missingShortName.success) {
      expect(missingShortName.error.issues[0].path).toEqual(["shortName"]);
    }
  });

  it("flattens loggable shapes and excludes groups, archives, sequences, and duplicates", () => {
    const library = [
      skill({ id: 1, name: "Back somersault", code: "4" }),
      skill({
        id: 2,
        name: "Tuck",
        code: "o",
        shape: "o",
        parentSkillId: 1,
        difficulty: 0.5,
      }),
      skill({ id: 3, name: "Barani", code: "41/", difficulty: 0.6 }),
      skill({ id: 4, name: "barani", code: " 41/ ", difficulty: 0.6 }),
      skill({ id: 5, name: "Old drill", code: "OD", isDrill: 1, archived: 1 }),
      skill({ id: 6, name: "Connection", code: "C", isDrill: 2 }),
    ];
    const entries = [entry({ id: 10, name: "Barani", shortName: "41/", difficulty: 0.6 })];

    const preview = buildDictionaryImportPreview(library, entries);

    expect(preview.counts).toEqual({
      total: 6,
      toAdd: 1,
      reused: 1,
      skipped: 4,
    });
    expect(preview.candidates).toEqual([
      expect.objectContaining({
        skillId: 2,
        name: "Tuck",
        shortName: "4o",
        status: "new",
      }),
      expect.objectContaining({
        skillId: 3,
        status: "matched",
        dictionaryEntryId: 10,
      }),
    ]);
    expect(preview.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skillId: 1, reason: "shape-group" }),
        expect.objectContaining({ skillId: 4, reason: "duplicate" }),
        expect.objectContaining({ skillId: 5, reason: "archived" }),
        expect.objectContaining({ skillId: 6, reason: "not-a-skill-or-drill" }),
      ]),
    );
  });

  it("keeps a provenance link authoritative after the personal copy is renamed", () => {
    const linkedEntry = entry({ id: 20, name: "Original dictionary name", shortName: "OD" });
    const preview = buildDictionaryImportPreview(
      [skill({
        id: 7,
        name: "My renamed copy",
        code: "Mine",
        dictionaryEntryId: linkedEntry.id,
      })],
      [linkedEntry],
    );

    expect(preview.candidates[0]).toEqual(
      expect.objectContaining({
        status: "linked",
        dictionaryEntryId: linkedEntry.id,
      }),
    );
    expect(preview.counts.toAdd).toBe(0);
  });
});