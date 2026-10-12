import { describe, expect, it } from "vitest";
import { figDictionaryEntries } from "./dictionary-fig-seed";

describe("FIG dictionary seed", () => {
  const entries = figDictionaryEntries();

  it("has one entry per skill and shape, with no repeats", () => {
    expect(entries).toHaveLength(139);
    const keys = entries.map((e) => `${e.name}|${e.numeric}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps every entry valid for the dictionary", () => {
    for (const e of entries) {
      expect(e.numeric).toMatch(/^\d+[o</]$/);
      expect(e.difficulty).toBeGreaterThan(0);
      expect(e.difficulty).toBeLessThanOrEqual(30);
    }
  });
});
