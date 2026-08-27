// Regression tests for account-scoped Debuts picker persistence.
//
// The blocking scenario: account A hides rows on this device, logs out, and
// account B (with no server preference yet) logs in — B must NOT inherit A's
// hidden rows. Local fallback is namespaced per user id; the server value,
// when present, always wins.

import { beforeEach, describe, expect, it } from "vitest";
import { loadHiddenLocal, parseHidden, resolveHidden, saveHiddenLocal } from "./debuts-hidden";

// Tests run under the node environment — provide a minimal localStorage,
// matching the pattern used by offline-cache.test.ts.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

beforeEach(() => {
  store.clear();
});

describe("parseHidden", () => {
  it("parses a valid map and drops non-string entries", () => {
    expect(parseHidden('{"debut-skill":["1","2",3],"x":"nope"}')).toEqual({
      "debut-skill": ["1", "2"],
    });
  });

  it("returns null for null, invalid JSON, arrays, and non-objects", () => {
    expect(parseHidden(null)).toBeNull();
    expect(parseHidden(undefined)).toBeNull();
    expect(parseHidden("not json")).toBeNull();
    expect(parseHidden("[1,2]")).toBeNull();
    expect(parseHidden('"str"')).toBeNull();
  });
});

describe("account switch on one device", () => {
  it("account B with no server pref does not inherit account A's local choices", () => {
    saveHiddenLocal("user-a", { "debut-skill": ["12"] });
    expect(resolveHidden("user-b", null)).toEqual({});
  });

  it("account A's own offline fallback is still used when its server pref is null", () => {
    saveHiddenLocal("user-a", { "debut-skill": ["12"] });
    expect(resolveHidden("user-a", null)).toEqual({ "debut-skill": ["12"] });
  });

  it("server value wins over the scoped local fallback", () => {
    saveHiddenLocal("user-a", { "debut-skill": ["12"] });
    expect(resolveHidden("user-a", '{"debut-skill":["99"]}')).toEqual({ "debut-skill": ["99"] });
  });

  it("never reads the legacy unscoped blob for an authenticated user, and clears it on save", () => {
    localStorage.setItem("debuts-hidden", JSON.stringify({ "debut-skill": ["7"] }));
    expect(resolveHidden("user-b", null)).toEqual({});
    saveHiddenLocal("user-b", { "debut-routine": ["3"] });
    expect(localStorage.getItem("debuts-hidden")).toBeNull();
    expect(loadHiddenLocal("user-b")).toEqual({ "debut-routine": ["3"] });
  });
});
