import { describe, it, expect } from "vitest";
import {
  EXECUTION_SKILL_COUNT,
  MAX_E_SCORE,
  round1,
  tenthsToPoints,
  pointsToTenths,
  totalDeductionPoints,
  impliedEScore,
  sanitizeDeductionValues,
} from "./execution";
import { insertExecutionSessionSchema } from "./schema";

describe("tenths/points conversion (sheets print tenths, app stores points)", () => {
  it("converts printed tenths to points: 2 -> 0.2, 20 -> 2.0, 0 -> 0", () => {
    expect(tenthsToPoints(2)).toBe(0.2);
    expect(tenthsToPoints(20)).toBe(2);
    expect(tenthsToPoints(0)).toBe(0);
  });

  it("converts points back to printed tenths without float noise", () => {
    expect(pointsToTenths(0.2)).toBe(2);
    expect(pointsToTenths(2)).toBe(20);
    // 0.1 + 0.2 = 0.30000000000000004 in floats — must still print as 3.
    expect(pointsToTenths(0.1 + 0.2)).toBe(3);
    for (let t = 0; t <= 30; t++) {
      expect(pointsToTenths(tenthsToPoints(t))).toBe(t);
    }
  });
});

describe("sample judges' sheets reconcile with their printed E scores", () => {
  it("two-row sheet: R1 deductions 1,2,2,2,3,2,3,1,2,2 + landing 20 -> E 16.0", () => {
    const deductions = [1, 2, 2, 2, 3, 2, 3, 1, 2, 2].map(tenthsToPoints);
    const landing = tenthsToPoints(20);
    expect(totalDeductionPoints(deductions, landing)).toBe(4);
    expect(impliedEScore(deductions, landing)).toBe(16);
  });

  it("two-row sheet: R2 deductions summing 4.7 -> E 15.3", () => {
    const deductions = [2, 3, 2, 3, 3, 2, 3, 3, 3, 3].map(tenthsToPoints);
    const landing = tenthsToPoints(20);
    expect(totalDeductionPoints(deductions, landing)).toBe(4.7);
    expect(impliedEScore(deductions, landing)).toBe(15.3);
  });

  it("single-row sheet: deductions 3.9 + clean landing (0) -> E 16.1", () => {
    const deductions = [3, 4, 4, 4, 4, 4, 4, 4, 4, 4].map(tenthsToPoints);
    expect(totalDeductionPoints(deductions, 0)).toBe(3.9);
    expect(impliedEScore(deductions, 0)).toBe(16.1);
  });
});

describe("impliedEScore is only defined for complete routines", () => {
  it("returns null for an interrupted routine (fewer than 10 skills)", () => {
    expect(impliedEScore([0.2, 0.3], 0)).toBeNull();
  });

  it("returns null when the landing was not recorded", () => {
    const full = Array.from({ length: EXECUTION_SKILL_COUNT }, () => 0.2);
    expect(impliedEScore(full, null)).toBeNull();
    expect(impliedEScore(full, undefined)).toBeNull();
  });

  it("a clean landing (0) still counts as recorded", () => {
    const full = Array.from({ length: EXECUTION_SKILL_COUNT }, () => 0.2);
    expect(impliedEScore(full, 0)).toBe(MAX_E_SCORE - 2);
  });
});

describe("totalDeductionPoints", () => {
  it("treats a missing landing as 0 and rounds float noise to one decimal", () => {
    expect(totalDeductionPoints([0.1, 0.2], null)).toBe(0.3);
    expect(totalDeductionPoints([], null)).toBe(0);
  });

  it("round1 kills accumulated float error", () => {
    expect(round1(0.1 + 0.2)).toBe(0.3);
  });
});

describe("sanitizeDeductionValues (raw vision-model output -> tenths row)", () => {
  it("keeps an 11-value integer row as skills + landing", () => {
    const out = sanitizeDeductionValues([1, 2, 2, 2, 3, 2, 3, 1, 2, 2, 20]);
    expect(out).toEqual({ deductions: [1, 2, 2, 2, 3, 2, 3, 1, 2, 2], landing: 20 });
  });

  it("a final 0 is kept as a clean landing, not dropped", () => {
    const out = sanitizeDeductionValues([3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 0]);
    expect(out!.landing).toBe(0);
    expect(out!.deductions).toHaveLength(10);
  });

  it("a short row (interrupted routine) has no landing", () => {
    const out = sanitizeDeductionValues([2, 3, 5]);
    expect(out).toEqual({ deductions: [2, 3, 5], landing: null });
  });

  it("converts a row returned in points (any fractional value) to tenths", () => {
    const out = sanitizeDeductionValues([0.1, 0.2, 0.2, 0.2, 0.3, 0.2, 0.3, 0.1, 0.2, 0.2, 2]);
    expect(out).toEqual({ deductions: [1, 2, 2, 2, 3, 2, 3, 1, 2, 2], landing: 20 });
  });

  it("drops non-numeric and out-of-range junk, truncates to 11 values", () => {
    expect(sanitizeDeductionValues(["2", "x", 3, -1, 99])).toEqual({
      deductions: [2, 3],
      landing: null,
    });
    const twelve = sanitizeDeductionValues([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 20, 7]);
    expect(twelve).toEqual({ deductions: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], landing: 20 });
  });

  it("returns null when nothing usable is present", () => {
    expect(sanitizeDeductionValues(null)).toBeNull();
    expect(sanitizeDeductionValues("12")).toBeNull();
    expect(sanitizeDeductionValues([])).toBeNull();
    expect(sanitizeDeductionValues(["a", -5])).toBeNull();
  });
});

describe("insertExecutionSessionSchema", () => {
  const valid = {
    date: "2026-07-27",
    routineId: 1,
    category: "vol",
    deductions: [0.1, 0.2, 0.2, 0.2, 0.3, 0.2, 0.3, 0.1, 0.2, 0.2],
    landingDeduction: 2,
    note: null,
  };

  it("accepts a complete session (stored in points)", () => {
    const parsed = insertExecutionSessionSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("accepts a partial routine and a missing landing", () => {
    expect(
      insertExecutionSessionSchema.safeParse({
        ...valid,
        deductions: [0.2, 0.3],
        landingDeduction: null,
      }).success,
    ).toBe(true);
    expect(
      insertExecutionSessionSchema.safeParse({
        ...valid,
        landingDeduction: undefined,
      }).success,
    ).toBe(true);
  });

  it("rejects empty or oversized deduction arrays", () => {
    expect(insertExecutionSessionSchema.safeParse({ ...valid, deductions: [] }).success).toBe(false);
    expect(
      insertExecutionSessionSchema.safeParse({
        ...valid,
        deductions: Array.from({ length: 11 }, () => 0.2),
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range deductions and bad categories", () => {
    expect(insertExecutionSessionSchema.safeParse({ ...valid, deductions: [3.5] }).success).toBe(false);
    expect(insertExecutionSessionSchema.safeParse({ ...valid, deductions: [-0.1] }).success).toBe(false);
    expect(insertExecutionSessionSchema.safeParse({ ...valid, landingDeduction: 4 }).success).toBe(false);
    expect(insertExecutionSessionSchema.safeParse({ ...valid, category: "both" }).success).toBe(false);
  });
});
