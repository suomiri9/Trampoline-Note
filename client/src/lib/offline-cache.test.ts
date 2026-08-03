// Tests for the offline history caching added in the IndexedDB mirroring
// change: getQueryFn must serve the cached list (or []) when fetch fails and
// offline mode is ON, and disabling offline mode must wipe the caches.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getQueryFn } from "./queryClient";
import { cacheGet, cacheSet } from "./offline-db";
import { setOfflineModeEnabled } from "./offline-mode";
import { clearOfflineDataAndQueue } from "./offline-queue";

// getOfflineModeEnabled reads localStorage, which doesn't exist in node.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

const queryFn = getQueryFn({ on401: "throw" }) as (ctx: {
  queryKey: readonly unknown[];
}) => Promise<unknown>;

function run(path: string) {
  return queryFn({ queryKey: [path] });
}

const CASES: Array<{ path: string; cacheKey: string }> = [
  { path: "/api/scores", cacheKey: "scores" },
  { path: "/api/tof-sessions", cacheKey: "tofSessions" },
  { path: "/api/execution-sessions", cacheKey: "executionSessions" },
];

const originalFetch = globalThis.fetch;

beforeEach(async () => {
  await clearOfflineDataAndQueue();
  store.clear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function failFetch() {
  globalThis.fetch = vi.fn(async () => {
    throw new TypeError("Failed to fetch");
  }) as any;
}

function okFetch(data: unknown) {
  globalThis.fetch = vi.fn(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => data,
      }) as any,
  ) as any;
}

describe.each(CASES)("getQueryFn offline fallback for $path", ({ path, cacheKey }) => {
  it("returns the cached list when fetch fails and offline mode is ON", async () => {
    setOfflineModeEnabled(true);
    const cached = [{ id: 1 }, { id: 2 }];
    await cacheSet(cacheKey, cached);
    failFetch();
    await expect(run(path)).resolves.toEqual(cached);
  });

  it("returns [] when fetch fails, offline mode is ON, and no cache exists", async () => {
    setOfflineModeEnabled(true);
    failFetch();
    await expect(run(path)).resolves.toEqual([]);
  });

  it("rethrows the fetch error when offline mode is OFF, even with a cache", async () => {
    setOfflineModeEnabled(false);
    await cacheSet(cacheKey, [{ id: 1 }]);
    failFetch();
    await expect(run(path)).rejects.toThrow("Failed to fetch");
  });

  it("mirrors successful responses into the cache while offline mode is ON (dropping archived items)", async () => {
    setOfflineModeEnabled(true);
    okFetch([
      { id: 1, archived: 0 },
      { id: 2, archived: 1 },
    ]);
    await expect(run(path)).resolves.toEqual([
      { id: 1, archived: 0 },
      { id: 2, archived: 1 },
    ]);
    await expect(cacheGet(cacheKey)).resolves.toEqual([{ id: 1, archived: 0 }]);
  });

  it("does NOT mirror responses while offline mode is OFF", async () => {
    setOfflineModeEnabled(false);
    okFetch([{ id: 1 }]);
    await run(path);
    await expect(cacheGet(cacheKey)).resolves.toBeNull();
  });
});

describe("clearOfflineDataAndQueue (runs when offline mode is disabled)", () => {
  it("wipes all mirrored history caches", async () => {
    for (const { cacheKey } of CASES) await cacheSet(cacheKey, [{ id: 9 }]);
    await cacheSet("notes", [{ id: 7 }]);

    await clearOfflineDataAndQueue();

    for (const { cacheKey } of CASES) {
      await expect(cacheGet(cacheKey)).resolves.toBeNull();
    }
    await expect(cacheGet("notes")).resolves.toBeNull();
  });
});
