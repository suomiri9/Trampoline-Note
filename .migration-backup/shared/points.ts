// "Points to Fix" shared model: the focus-memo column on users stores a JSON
// array of these points (legacy memos were plain text, one point per line).
// Shared between the client editor (points-to-fix.tsx) and the server-side
// coach proposal parsing so both agree on categories and parsing rules.

export type PointToFix = {
  id: string;
  name: string;
  skillIds: number[];
  routineIds: number[];
  /** Sub-category for unlinked points. Ignored when the point is linked to
      any skill or routine. Defaults to "General" for legacy points. */
  category?: string;
  /** True once the user marked the point as fixed. Resolved points are kept
      for history instead of being deleted. Absent/false = still active. */
  resolved?: boolean;
};

export const POINT_CATEGORIES = [
  "General",
  "Forward",
  "Backward",
  "Twisting",
  "Connection",
  "Landing",
] as const;
export type PointCategory = typeof POINT_CATEGORIES[number];

export const isPointCategory = (v: unknown): v is PointCategory =>
  typeof v === "string" && (POINT_CATEGORIES as readonly string[]).includes(v);

/** Stable serialization of one point so two versions can be compared. */
function pointFingerprint(p: PointToFix): string {
  return JSON.stringify({
    name: p.name,
    skillIds: p.skillIds,
    routineIds: p.routineIds,
    category: p.category ?? null,
    resolved: p.resolved === true,
  });
}

/**
 * Three-way merge of Points-to-Fix lists for concurrent edits from two
 * devices. `base` is the list the editing client last read, `mine` is what
 * that client wants to write, and `theirs` is what is currently stored on
 * the server (possibly changed by another device since `base`).
 *
 * Rules (per point id):
 * - Added by me (in mine, not in base)            → kept.
 * - Added/kept by them (in theirs, not touched by me) → kept.
 * - Edited by me (differs from base)              → my version wins.
 * - Edited only by them                           → their version wins.
 * - Deleted by me (in base, not in mine)          → removed, even if they
 *   edited it (an explicit delete beats a concurrent tweak).
 * - Deleted by them, unedited by me               → stays deleted.
 * - Deleted by them but edited by me              → my edited version is
 *   restored (an edit implies the point still matters).
 *
 * Result order follows `theirs` (the stored list), with my additions and
 * restorations appended in my order.
 */
export function mergePoints(
  base: PointToFix[],
  mine: PointToFix[],
  theirs: PointToFix[],
): PointToFix[] {
  const baseById = new Map(base.map((p) => [p.id, p]));
  const mineById = new Map(mine.map((p) => [p.id, p]));
  const theirsIds = new Set(theirs.map((p) => p.id));

  const deletedByMe = new Set<string>();
  for (const p of base) {
    if (!mineById.has(p.id)) deletedByMe.add(p.id);
  }

  const changedByMe = (id: string): boolean => {
    const b = baseById.get(id);
    const m = mineById.get(id);
    if (!m) return false;
    if (!b) return true; // added by me
    return pointFingerprint(b) !== pointFingerprint(m);
  };

  const result: PointToFix[] = [];
  for (const t of theirs) {
    if (deletedByMe.has(t.id)) continue;
    const m = mineById.get(t.id);
    if (m && changedByMe(t.id)) {
      result.push(m);
    } else {
      result.push(t);
    }
  }
  // My additions, plus points they deleted but I edited (restore my edit).
  for (const m of mine) {
    if (theirsIds.has(m.id)) continue;
    const inBase = baseById.has(m.id);
    if (!inBase || changedByMe(m.id)) {
      result.push(m);
    }
  }
  return result;
}

export function parsePoints(raw: string | null | undefined): PointToFix[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p === "object" && typeof p.name === "string")
      .map((p, i) => ({
        id: typeof p.id === "string" ? p.id : `p-${i}-${Date.now()}`,
        name: p.name as string,
        // Allow negative ids so items linked to skills/routines that were
        // created offline (and still have a temporary id) keep their
        // links until the queue drains and remaps them to real ids.
        skillIds: Array.isArray(p.skillIds)
          ? (p.skillIds as unknown[]).filter(
              (x): x is number => typeof x === "number" && Number.isInteger(x) && x !== 0,
            )
          : [],
        routineIds: Array.isArray(p.routineIds)
          ? (p.routineIds as unknown[]).filter(
              (x): x is number => typeof x === "number" && Number.isInteger(x) && x !== 0,
            )
          : [],
        category: isPointCategory(p.category) ? p.category : undefined,
        ...(p.resolved === true ? { resolved: true } : {}),
      }));
  } catch {
    // Legacy plain-text focus memo — migrate each non-empty line into a point.
    return trimmed
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((line, i) => ({
        id: `legacy-${i}-${Date.now()}`,
        name: line,
        skillIds: [],
        routineIds: [],
      }));
  }
}
