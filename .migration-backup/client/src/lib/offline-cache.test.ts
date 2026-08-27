// Tests for the offline history caching added in the IndexedDB mirroring
// change: getQueryFn must serve the cached list (or []) when fetch fails and
// offline mode is ON, and disabling offline mode must wipe the caches.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getQueryFn, queryClient } from "./queryClient";
import { cacheGet, cacheSet } from "./offline-db";
import { setOfflineModeEnabled } from "./offline-mode";
import { clearOfflineDataAndQueue } from "./offline-queue";
import { getCacheServed, markCacheServed, markNetworkOk, resetCacheServed } from "./read-fallback";

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

  it("mirrors successful responses into the cache while offline mode is ON (keeping archived items — historical DD valuation needs them)", async () => {
    setOfflineModeEnabled(true);
    okFetch([
      { id: 1, archived: 0 },
      { id: 2, archived: 1 },
    ]);
    await expect(run(path)).resolves.toEqual([
      { id: 1, archived: 0 },
      { id: 2, archived: 1 },
    ]);
    await expect(cacheGet(cacheKey)).resolves.toEqual([
      { id: 1, archived: 0 },
      { id: 2, archived: 1 },
    ]);
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

describe("getQueryFn 8s slow-network fallback", () => {
  const path = "/api/scores";
  const cacheKey = "scores";

  // A fetch that never settles on its own but honours the abort signal —
  // models a request hanging on flaky wifi.
  function hangingFetch() {
    const mock = vi.fn(
      (_url: unknown, init?: { signal?: AbortSignal }) =>
        new Promise<never>((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    globalThis.fetch = mock as any;
    return mock;
  }

  afterEach(() => {
    vi.useRealTimers();
    resetCacheServed();
  });

  it("serves the cached list once the hang passes 8s while offline mode is ON", async () => {
    setOfflineModeEnabled(true);
    const cached = [{ id: 1 }, { id: 2 }];
    await cacheSet(cacheKey, cached);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    hangingFetch();
    const p = run(path);
    await vi.advanceTimersByTimeAsync(8100);
    vi.useRealTimers();
    await expect(p).resolves.toEqual(cached);
    expect(getCacheServed()).toBe(true);
  });

  it("rejects — never a fake-empty [] — when the hang times out with no cache", async () => {
    setOfflineModeEnabled(true);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    hangingFetch();
    const p = run(path);
    const assertion = expect(p).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(8100);
    vi.useRealTimers();
    await assertion;
  });

  it("passes an abort signal only while offline mode is ON", async () => {
    setOfflineModeEnabled(false);
    okFetch([]);
    await run(path);
    expect((globalThis.fetch as any).mock.calls[0][1]?.signal).toBeUndefined();

    setOfflineModeEnabled(true);
    okFetch([]);
    await run(path);
    expect((globalThis.fetch as any).mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("clears the saved-data signal once THAT read reaches the network again", async () => {
    setOfflineModeEnabled(true);
    markCacheServed(cacheKey);
    okFetch([{ id: 3 }]);
    await run(path);
    expect(getCacheServed()).toBe(false);
  });

  it("one query recovering does not hide the badge while another is still mirror-served", async () => {
    setOfflineModeEnabled(true);
    // Two different reads fell back to the mirror…
    markCacheServed(cacheKey);
    markCacheServed("notes");
    // …then only the scores read succeeds against the network.
    okFetch([{ id: 3 }]);
    await run(path);
    // Notes data on screen still came from the mirror — badge must stay.
    expect(getCacheServed()).toBe(true);
    markNetworkOk("notes");
    expect(getCacheServed()).toBe(false);
  });

  it("a 401 on a returnNull query clears that key's saved-data signal", async () => {
    setOfflineModeEnabled(true);
    markCacheServed(cacheKey);
    globalThis.fetch = vi.fn(async () => new Response("", { status: 401 })) as any;
    await expect(
      getQueryFn({ on401: "returnNull" })({ queryKey: [path] } as any),
    ).resolves.toBeNull();
    expect(getCacheServed()).toBe(false);
  });
});

describe("queryClient network mode", () => {
  // iOS PWAs miss the browser 'online' event while suspended. React Query's
  // default networkMode 'online' then PAUSES every fetch/mutation forever
  // (queryFn never runs → no mirror fallback, no error, just stuck skeletons
  // or offline cards until the app is force-quit). Offline behaviour lives in
  // OUR layer (getQueryFn mirror fallback + 8s cap), so both must be 'always'.
  it("queries and mutations never pause on stale offline state", () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.networkMode).toBe("always");
    expect(defaults.mutations?.networkMode).toBe("always");
  });
});
