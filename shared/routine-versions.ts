// Routine lineup versioning ("change from this day").
//
// A routine's row always holds the CURRENT lineup. When the athlete edits the
// lineup of a routine that already has training history and picks "from a
// day…", the lineup that was current until then is snapshotted as a PAST
// version with `effectiveUntil` = the chosen athlete-local day (EXCLUSIVE):
// that lineup applied to training dates strictly BEFORE the day; entries on or
// after the day use the next version (or the current lineup).
//
// Resolution for a date: among past versions sorted by (effectiveUntil, id),
// pick the FIRST with effectiveUntil > date; if none, the current lineup
// applies. All comparisons are plain ISO `yyyy-mm-dd` string comparisons —
// note dates are athlete-local date strings, never server-clock timestamps.

export interface RoutineVersionLite {
  skillIds: number[];
  /** Exclusive end day (ISO yyyy-mm-dd): lineup applied to dates BEFORE this day. */
  effectiveUntil: string;
  id?: number;
}

/** Past versions sorted oldest-first by (effectiveUntil, id). */
export function sortedVersions<T extends RoutineVersionLite>(
  versions: readonly T[] | null | undefined,
): T[] {
  if (!versions || versions.length === 0) return [];
  return [...versions].sort((a, b) =>
    a.effectiveUntil === b.effectiveUntil
      ? (a.id ?? 0) - (b.id ?? 0)
      : a.effectiveUntil < b.effectiveUntil
        ? -1
        : 1,
  );
}

/**
 * Index of the version in effect on `date`: 0..n-1 into sortedVersions for a
 * past lineup, n (= versions.length) when the current lineup applies.
 */
export function versionIndexOnDate(
  versions: readonly RoutineVersionLite[] | null | undefined,
  date: string,
): number {
  const sorted = sortedVersions(versions);
  for (let i = 0; i < sorted.length; i++) {
    if (date < sorted[i].effectiveUntil) return i;
  }
  return sorted.length;
}

/** The skill lineup in effect on `date` (falls back to current when no date). */
export function lineupOnDate(
  currentSkillIds: number[],
  versions: readonly RoutineVersionLite[] | null | undefined,
  date: string | null | undefined,
): number[] {
  if (!date || !versions || versions.length === 0) return currentSkillIds;
  const sorted = sortedVersions(versions);
  const day = String(date).slice(0, 10);
  const idx = versionIndexOnDate(sorted, day);
  return idx >= sorted.length ? currentSkillIds : sorted[idx].skillIds;
}

/** Day the CURRENT lineup started applying (null = since the beginning). */
export function currentLineupSince(
  versions: readonly RoutineVersionLite[] | null | undefined,
): string | null {
  const sorted = sortedVersions(versions);
  return sorted.length > 0 ? sorted[sorted.length - 1].effectiveUntil : null;
}

/** Distinct change days, ascending. */
export function versionBoundaries(
  versions: readonly RoutineVersionLite[] | null | undefined,
): string[] {
  const out: string[] = [];
  for (const v of sortedVersions(versions)) {
    if (out[out.length - 1] !== v.effectiveUntil) out.push(v.effectiveUntil);
  }
  return out;
}

export function sameLineup(
  a: readonly number[] | null | undefined,
  b: readonly number[] | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Next past-version list after changing a routine's lineup "from a day".
 *
 * - Versions claiming dates on/after `applyFromDay` are truncated to it (the
 *   athlete's newest statement wins for those dates).
 * - Versions whose covered range becomes empty are dropped (first one per
 *   distinct end day survives — it's the oldest, which still covers the
 *   earlier dates).
 * - The lineup that was current until now is appended as a snapshot ending at
 *   `applyFromDay`, unless an earlier change day already covers everything
 *   before it (then the old current lineup never actually applied).
 *
 * Pure + deterministic so the client can precompute the same list the server
 * persists (used to keep the offline-cached routines mirror correct while a
 * queued edit waits to sync).
 */
export function applyLineupChange(
  currentSkillIds: number[],
  versions: readonly RoutineVersionLite[] | null | undefined,
  applyFromDay: string,
): { skillIds: number[]; effectiveUntil: string }[] {
  const truncated = sortedVersions(versions).map((v) => ({
    skillIds: [...v.skillIds],
    effectiveUntil: v.effectiveUntil > applyFromDay ? applyFromDay : v.effectiveUntil,
  }));
  const result: { skillIds: number[]; effectiveUntil: string }[] = [];
  for (const v of truncated) {
    if (result.some((r) => r.effectiveUntil === v.effectiveUntil)) continue;
    result.push(v);
  }
  const maxEnd = result.length > 0 ? result[result.length - 1].effectiveUntil : null;
  if (maxEnd == null || applyFromDay > maxEnd) {
    result.push({ skillIds: [...currentSkillIds], effectiveUntil: applyFromDay });
  }
  return result;
}
