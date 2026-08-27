import type {
  DictionaryEntry,
  DictionaryImportCandidate,
  DictionaryImportPreview,
  DictionaryImportSkipped,
  Skill,
} from "./schema";

function normalizedPart(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function dictionaryEntryKey(
  value: Pick<DictionaryEntry, "name" | "shortName" | "isDrill">,
): string {
  return `${value.isDrill}:${normalizedPart(value.name)}:${normalizedPart(value.shortName)}`;
}

function candidateKey(
  value: Pick<DictionaryImportCandidate, "name" | "shortName" | "isDrill">,
): string {
  return `${value.isDrill}:${normalizedPart(value.name)}:${normalizedPart(value.shortName)}`;
}

function byLibraryOrder(a: Skill, b: Skill): number {
  const aOrder = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const bOrder = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
  return aOrder - bOrder || a.id - b.id;
}

/**
 * Resolve a personal library into the flat, loggable rows the shared
 * dictionary supports. Shape-group bases are headings, not skills; their
 * loggable children become flat dictionary entries with the combined code
 * athletes see outside the library editor.
 */
export function buildDictionaryImportPreview(
  library: Skill[],
  entries: DictionaryEntry[],
): DictionaryImportPreview {
  const byId = new Map(library.map((skill) => [skill.id, skill]));
  const activeShapeParentIds = new Set(
    library
      .filter((skill) => skill.archived !== 1 && skill.parentSkillId != null)
      .map((skill) => skill.parentSkillId as number),
  );
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const entriesByKey = new Map<string, DictionaryEntry>();
  for (const entry of [...entries].sort((a, b) => a.archived - b.archived || a.id - b.id)) {
    const key = dictionaryEntryKey(entry);
    if (!entriesByKey.has(key)) entriesByKey.set(key, entry);
  }

  const candidates: DictionaryImportCandidate[] = [];
  const skipped: DictionaryImportSkipped[] = [];
  const seenCandidateKeys = new Set<string>();

  for (const skill of [...library].sort(byLibraryOrder)) {
    if (skill.archived === 1) {
      skipped.push({ skillId: skill.id, name: skill.name, reason: "archived" });
      continue;
    }
    if (skill.isDrill !== 0 && skill.isDrill !== 1) {
      skipped.push({ skillId: skill.id, name: skill.name, reason: "not-a-skill-or-drill" });
      continue;
    }
    if (activeShapeParentIds.has(skill.id)) {
      skipped.push({ skillId: skill.id, name: skill.name, reason: "shape-group" });
      continue;
    }

    const parent = skill.parentSkillId == null ? undefined : byId.get(skill.parentSkillId);
    const name = skill.name.trim();
    const shortName = (
      parent
        ? `${parent.code}${skill.shape || skill.code}`
        : skill.code
    ).trim();
    const difficulty = Number(skill.difficulty);
    if (
      !name ||
      name.length > 120 ||
      !shortName ||
      shortName.length > 40 ||
      !Number.isFinite(difficulty) ||
      difficulty < 0 ||
      difficulty > 30
    ) {
      skipped.push({ skillId: skill.id, name: skill.name, reason: "invalid" });
      continue;
    }

    const baseCandidate = {
      skillId: skill.id,
      name,
      shortName,
      isDrill: skill.isDrill as 0 | 1,
      difficulty,
      sortOrder: skill.sortOrder,
    };
    const key = candidateKey(baseCandidate);
    if (seenCandidateKeys.has(key)) {
      skipped.push({ skillId: skill.id, name: skill.name, reason: "duplicate" });
      continue;
    }
    seenCandidateKeys.add(key);

    const linked =
      skill.dictionaryEntryId == null
        ? undefined
        : entriesById.get(skill.dictionaryEntryId);
    const matched = linked ?? entriesByKey.get(key);
    candidates.push({
      ...baseCandidate,
      status: linked ? "linked" : matched ? "matched" : "new",
      dictionaryEntryId: matched?.id ?? null,
    });
  }

  const toAdd = candidates.filter((candidate) => candidate.status === "new").length;
  return {
    candidates,
    skipped,
    counts: {
      total: library.length,
      toAdd,
      reused: candidates.length - toAdd,
      skipped: skipped.length,
    },
  };
}