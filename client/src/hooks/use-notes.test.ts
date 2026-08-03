// Tests for the useNotes / useNotesPage offline fallback + mirroring added in
// the IndexedDB caching change. React Query is mocked so useQuery simply hands
// back its options; we then invoke queryFn directly in node.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@tanstack/react-query", () => ({
  // use-notes imports offline-queue, which constructs the app QueryClient at
  // module load — provide a minimal stand-in so that import doesn't explode.
  QueryClient: class {
    invalidateQueries() {}
  },
  useQuery: (opts: unknown) => opts,
  useMutation: (opts: unknown) => opts,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  keepPreviousData: Symbol("keepPreviousData"),
}));

import { useNotes, useNotesPage } from "./use-notes";
import { cacheGet, cacheSet, cacheClearAll } from "@/lib/offline-db";
import { setOfflineModeEnabled } from "@/lib/offline-mode";

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

type QueryOpts = { queryFn: () => Promise<any>; queryKey: unknown[] };

const notesQueryFn = () => (useNotes() as unknown as QueryOpts).queryFn;
const notesPageQueryFn = (limit: number) =>
  (useNotesPage(limit) as unknown as QueryOpts).queryFn;

const originalFetch = globalThis.fetch;

function failFetch() {
  globalThis.fetch = vi.fn(async () => {
    throw new TypeError("Failed to fetch");
  }) as any;
}

function okFetch(data: unknown, headers: Record<string, string> = {}) {
  globalThis.fetch = vi.fn(
    async () =>
      ({
        ok: true,
        status: 200,
        headers: { get: (k: string) => headers[k] ?? null },
        json: async () => data,
      }) as any,
  ) as any;
}

const note = (id: number) => ({ id, date: "2026-08-01", comment: `note ${id}` });

beforeEach(async () => {
  await cacheClearAll();
  store.clear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("useNotes offline fallback", () => {
  it("serves the cached notes list when fetch fails and offline mode is ON", async () => {
    setOfflineModeEnabled(true);
    const cached = [note(1), note(2)];
    await cacheSet("notes", cached);
    failFetch();
    await expect(notesQueryFn()()).resolves.toEqual(cached);
  });

  it("rethrows when fetch fails and there is no cache", async () => {
    setOfflineModeEnabled(true);
    failFetch();
    await expect(notesQueryFn()()).rejects.toThrow("Failed to fetch");
  });

  it("rethrows when offline mode is OFF, even with a cache", async () => {
    setOfflineModeEnabled(false);
    await cacheSet("notes", [note(1)]);
    failFetch();
    await expect(notesQueryFn()()).rejects.toThrow("Failed to fetch");
  });

  it("mirrors successful responses into the 'notes' cache while offline mode is ON", async () => {
    setOfflineModeEnabled(true);
    const data = [note(1), note(2)];
    okFetch(data);
    await expect(notesQueryFn()()).resolves.toEqual(data);
    await expect(cacheGet("notes")).resolves.toEqual(data);
  });

  it("does NOT mirror while offline mode is OFF", async () => {
    setOfflineModeEnabled(false);
    okFetch([note(1)]);
    await notesQueryFn()();
    await expect(cacheGet("notes")).resolves.toBeNull();
  });
});

describe("useNotesPage offline fallback", () => {
  it("slices the cached full list to the requested limit when fetch fails offline", async () => {
    setOfflineModeEnabled(true);
    const cached = [note(1), note(2), note(3), note(4)];
    await cacheSet("notes", cached);
    failFetch();
    await expect(notesPageQueryFn(2)()).resolves.toEqual({
      items: [note(1), note(2)],
      hasMore: true,
      total: 4,
    });
  });

  it("reports hasMore=false when the cache fits within the limit", async () => {
    setOfflineModeEnabled(true);
    const cached = [note(1), note(2)];
    await cacheSet("notes", cached);
    failFetch();
    await expect(notesPageQueryFn(10)()).resolves.toEqual({
      items: cached,
      hasMore: false,
      total: 2,
    });
  });

  it("rethrows when fetch fails offline with no cache", async () => {
    setOfflineModeEnabled(true);
    failFetch();
    await expect(notesPageQueryFn(5)()).rejects.toThrow("Failed to fetch");
  });

  it("rethrows when offline mode is OFF, even with a cache", async () => {
    setOfflineModeEnabled(false);
    await cacheSet("notes", [note(1)]);
    failFetch();
    await expect(notesPageQueryFn(5)()).rejects.toThrow("Failed to fetch");
  });

  it("mirrors a complete page into the cache while offline mode is ON", async () => {
    setOfflineModeEnabled(true);
    const data = [note(1), note(2)];
    okFetch(data, { "X-Total-Count": "2" });
    await expect(notesPageQueryFn(5)()).resolves.toEqual({
      items: data,
      hasMore: false,
      total: 2,
    });
    await expect(cacheGet("notes")).resolves.toEqual(data);
  });

  it("does NOT mirror an incomplete page (hasMore=true)", async () => {
    setOfflineModeEnabled(true);
    const data = [note(1), note(2)];
    okFetch(data, { "X-Total-Count": "10" });
    await expect(notesPageQueryFn(2)()).resolves.toEqual({
      items: data,
      hasMore: true,
      total: 10,
    });
    await expect(cacheGet("notes")).resolves.toBeNull();
  });
});
