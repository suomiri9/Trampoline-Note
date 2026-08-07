import { describe, it, expect } from "vitest";
import {
  sortedVersions,
  versionIndexOnDate,
  lineupOnDate,
  currentLineupSince,
  versionBoundaries,
  sameLineup,
  applyLineupChange,
  type RoutineVersionLite,
} from "./routine-versions";

const CURRENT = [10, 11, 12];

const v = (skillIds: number[], effectiveUntil: string, id?: number): RoutineVersionLite => ({
  skillIds,
  effectiveUntil,
  id,
});

describe("sortedVersions", () => {
  it("returns [] for null/undefined/empty", () => {
    expect(sortedVersions(null)).toEqual([]);
    expect(sortedVersions(undefined)).toEqual([]);
    expect(sortedVersions([])).toEqual([]);
  });

  it("sorts by effectiveUntil then id, without mutating input", () => {
    const input = [v([3], "2026-03-01", 7), v([1], "2026-01-01", 2), v([2], "2026-03-01", 4)];
    const sorted = sortedVersions(input);
    expect(sorted.map((x) => x.skillIds[0])).toEqual([1, 2, 3]);
    expect(input[0].skillIds[0]).toBe(3); // original order untouched
  });
});

describe("versionIndexOnDate / lineupOnDate", () => {
  const versions = [v([1], "2026-02-01"), v([2], "2026-03-01")];

  it("dates before the first change day use the oldest version", () => {
    expect(versionIndexOnDate(versions, "2026-01-31")).toBe(0);
    expect(lineupOnDate(CURRENT, versions, "2026-01-31")).toEqual([1]);
  });

  it("the change day itself uses the NEW lineup (effectiveUntil is exclusive)", () => {
    expect(versionIndexOnDate(versions, "2026-02-01")).toBe(1);
    expect(lineupOnDate(CURRENT, versions, "2026-02-01")).toEqual([2]);
    expect(versionIndexOnDate(versions, "2026-03-01")).toBe(2);
    expect(lineupOnDate(CURRENT, versions, "2026-03-01")).toEqual(CURRENT);
  });

  it("dates between changes use the middle version; after the last use current", () => {
    expect(lineupOnDate(CURRENT, versions, "2026-02-15")).toEqual([2]);
    expect(lineupOnDate(CURRENT, versions, "2026-06-01")).toEqual(CURRENT);
  });

  it("no versions or no date → current lineup", () => {
    expect(lineupOnDate(CURRENT, [], "2026-01-01")).toEqual(CURRENT);
    expect(lineupOnDate(CURRENT, null, "2026-01-01")).toEqual(CURRENT);
    expect(lineupOnDate(CURRENT, versions, null)).toEqual(CURRENT);
    expect(lineupOnDate(CURRENT, versions, undefined)).toEqual(CURRENT);
  });

  it("tolerates full ISO timestamps by slicing to the day", () => {
    expect(lineupOnDate(CURRENT, versions, "2026-01-15T23:59:00.000Z")).toEqual([1]);
  });
});

describe("currentLineupSince / versionBoundaries", () => {
  it("empty → null / []", () => {
    expect(currentLineupSince([])).toBeNull();
    expect(currentLineupSince(null)).toBeNull();
    expect(versionBoundaries(undefined)).toEqual([]);
  });

  it("returns the latest change day and distinct ascending boundaries", () => {
    const versions = [v([2], "2026-03-01", 5), v([1], "2026-02-01", 1), v([3], "2026-03-01", 9)];
    expect(currentLineupSince(versions)).toBe("2026-03-01");
    expect(versionBoundaries(versions)).toEqual(["2026-02-01", "2026-03-01"]);
  });
});

describe("sameLineup", () => {
  it("order-sensitive equality; null-safe", () => {
    expect(sameLineup([1, 2], [1, 2])).toBe(true);
    expect(sameLineup([1, 2], [2, 1])).toBe(false);
    expect(sameLineup([1], [1, 2])).toBe(false);
    expect(sameLineup(null, [1])).toBe(false);
    expect(sameLineup([1], undefined)).toBe(false);
  });
});

describe("applyLineupChange", () => {
  it("first change: snapshots the pre-edit current lineup ending at the day", () => {
    expect(applyLineupChange([1, 2], [], "2026-02-01")).toEqual([
      { skillIds: [1, 2], effectiveUntil: "2026-02-01" },
    ]);
  });

  it("later change day: appends a new snapshot after existing versions", () => {
    const versions = [v([1], "2026-02-01")];
    expect(applyLineupChange([2, 3], versions, "2026-03-01")).toEqual([
      { skillIds: [1], effectiveUntil: "2026-02-01" },
      { skillIds: [2, 3], effectiveUntil: "2026-03-01" },
    ]);
  });

  it("re-editing on the same day replaces (no duplicate snapshot, keeps oldest)", () => {
    const versions = [v([1], "2026-02-01", 1)];
    // Same day again: the existing version already ends there; the current
    // lineup never applied to any date, so nothing is appended.
    expect(applyLineupChange([9, 9], versions, "2026-02-01")).toEqual([
      { skillIds: [1], effectiveUntil: "2026-02-01" },
    ]);
  });

  it("earlier day than an existing boundary truncates and dedupes", () => {
    const versions = [v([1], "2026-02-01", 1), v([2], "2026-03-01", 2)];
    // Change applying from Jan 15: both old boundaries collapse to Jan 15;
    // only the oldest survives, and the pre-edit current lineup never applied.
    expect(applyLineupChange([3], versions, "2026-01-15")).toEqual([
      { skillIds: [1], effectiveUntil: "2026-01-15" },
    ]);
  });

  it("mid-history day truncates later versions but keeps earlier ones", () => {
    const versions = [v([1], "2026-02-01", 1), v([2], "2026-03-01", 2)];
    expect(applyLineupChange([3], versions, "2026-02-15")).toEqual([
      { skillIds: [1], effectiveUntil: "2026-02-01" },
      { skillIds: [2], effectiveUntil: "2026-02-15" },
    ]);
  });

  it("resolution after a change round-trips: old dates → old lineup, new dates → new", () => {
    let versions: RoutineVersionLite[] = [];
    // Lineup A trained through January, changed to B from Feb 1.
    versions = applyLineupChange([1], versions, "2026-02-01"); // A snapshotted
    const currentAfterFirst = [2];
    expect(lineupOnDate(currentAfterFirst, versions, "2026-01-20")).toEqual([1]);
    expect(lineupOnDate(currentAfterFirst, versions, "2026-02-01")).toEqual([2]);
    // Changed again to C from Mar 1.
    versions = applyLineupChange(currentAfterFirst, versions, "2026-03-01");
    const currentAfterSecond = [3];
    expect(lineupOnDate(currentAfterSecond, versions, "2026-01-20")).toEqual([1]);
    expect(lineupOnDate(currentAfterSecond, versions, "2026-02-15")).toEqual([2]);
    expect(lineupOnDate(currentAfterSecond, versions, "2026-03-01")).toEqual([3]);
    expect(versionBoundaries(versions)).toEqual(["2026-02-01", "2026-03-01"]);
    expect(currentLineupSince(versions)).toBe("2026-03-01");
  });

  it("does not mutate the input versions", () => {
    const versions = [v([1], "2026-03-01")];
    applyLineupChange([2], versions, "2026-02-01");
    expect(versions[0].effectiveUntil).toBe("2026-03-01");
  });
});
