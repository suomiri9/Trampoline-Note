import { describe, it, expect } from "vitest";
import { resolveClientDate, pickTodayRecovery } from "./coach-dates";

const utcToday = () => new Date().toISOString().substring(0, 10);
const shiftUtc = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString().substring(0, 10);

describe("resolveClientDate", () => {
  it("accepts today's UTC date", () => {
    expect(resolveClientDate(utcToday())).toBe(utcToday());
  });

  it("accepts one day ahead (east-of-UTC athlete, e.g. NZ morning)", () => {
    expect(resolveClientDate(shiftUtc(1))).toBe(shiftUtc(1));
  });

  it("accepts one day behind (west of UTC)", () => {
    expect(resolveClientDate(shiftUtc(-1))).toBe(shiftUtc(-1));
  });

  it("falls back to the UTC date for implausible dates", () => {
    expect(resolveClientDate("2000-01-01")).toBe(utcToday());
    expect(resolveClientDate(shiftUtc(3))).toBe(utcToday());
  });

  it("falls back to the UTC date for malformed input", () => {
    expect(resolveClientDate(undefined)).toBe(utcToday());
    expect(resolveClientDate(12345)).toBe(utcToday());
    expect(resolveClientDate("06/08/2026")).toBe(utcToday());
    expect(resolveClientDate("2026-02-31")).toBe(utcToday());
  });
});

describe("pickTodayRecovery", () => {
  const rows = [
    { date: "2026-08-04", recoveryScore: 55 },
    { date: "2026-08-05", recoveryScore: 14 },
    { date: "2026-08-06", recoveryScore: 82 },
  ];

  it("picks the exact day", () => {
    expect(pickTodayRecovery(rows, "2026-08-06")).toEqual({ date: "2026-08-06", score: 82 });
  });

  it("never lets yesterday count as today", () => {
    expect(pickTodayRecovery(rows.slice(0, 2), "2026-08-06")).toBeNull();
  });

  it("accepts a newer wake-day when the resolved date lags behind", () => {
    // Recovery days are the athlete's local wake days — when the resolved
    // date is UTC-derived and lags, the newest (future-dated) entry is
    // today's real state, not the entry matching the lagging date.
    expect(pickTodayRecovery(rows, "2026-08-05")).toEqual({ date: "2026-08-06", score: 82 });
  });

  it("handles empty input and null scores", () => {
    expect(pickTodayRecovery([], "2026-08-06")).toBeNull();
    expect(pickTodayRecovery([{ date: "2026-08-06", recoveryScore: null }], "2026-08-06")).toEqual({
      date: "2026-08-06",
      score: null,
    });
  });
});
