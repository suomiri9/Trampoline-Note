import { describe, it, expect, afterEach, vi } from "vitest";
import { findShellCacheName } from "./offline-control";

function stubCaches(keys: string[]) {
  vi.stubGlobal("caches", {
    keys: async () => keys,
  } as unknown as CacheStorage);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("findShellCacheName", () => {
  it("picks the highest-numbered tn-shell cache numerically, not lexicographically", async () => {
    // "tn-shell-v9" > "tn-shell-v11" as strings — the scan must compare the
    // number, or a v10+ bump would silently select an old cache again.
    stubCaches(["tn-shell-v9", "tn-shell-v11", "tn-shell-v10"]);
    expect(await findShellCacheName()).toBe("tn-shell-v11");
  });

  it("ignores caches that don't match the tn-shell-vN pattern", async () => {
    stubCaches(["workbox-precache", "tn-shell-v11-old", "tn-shell-v3", "other"]);
    expect(await findShellCacheName()).toBe("tn-shell-v3");
  });

  it("returns null when no shell cache exists", async () => {
    stubCaches(["something-else"]);
    expect(await findShellCacheName()).toBeNull();
  });

  it("returns null when the caches API is unavailable", async () => {
    // Node test env has no `caches` global by default; make sure explicitly.
    vi.stubGlobal("caches", undefined);
    expect(await findShellCacheName()).toBeNull();
  });

  it("returns null when caches.keys() throws", async () => {
    vi.stubGlobal("caches", {
      keys: async () => {
        throw new Error("boom");
      },
    } as unknown as CacheStorage);
    expect(await findShellCacheName()).toBeNull();
  });
});
