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
