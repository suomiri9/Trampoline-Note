import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { cacheGet, cacheSet, cacheDelete } from "./offline-db";
import { getOfflineModeEnabled } from "./offline-mode";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  init?: { signal?: AbortSignal },
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    signal: init?.signal,
  });

  await throwIfResNotOk(res);
  return res;
}

// Query keys whose responses we mirror into IndexedDB so they remain
// readable when the device is offline (only when offline mode is on).
const OFFLINE_CACHE_KEYS: Record<string, string> = {
  "/api/skills": "skills",
  "/api/routines": "routines",
  "/api/scores": "scores",
  "/api/tof-sessions": "tofSessions",
  "/api/execution-sessions": "executionSessions",
};

// Any other /api GET (history endpoints, WHOOP daily, etc.) is mirrored
// generically under `get:<full path>` so pages you've visited stay readable
// offline. AI endpoints are excluded — they must stay online-only — and
// /api/auth is handled by its own fetchers.
function genericOfflineCacheKey(fullPath: string): string | null {
  if (!fullPath.startsWith("/api/")) return null;
  if (fullPath.startsWith("/api/auth")) return null;
  if (fullPath.startsWith("/api/coach")) return null;
  return `get:${fullPath}`;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async <T>({ queryKey }: { queryKey: readonly unknown[] }) => {
    const path = String(queryKey[0]);
    const fullPath = queryKey.join("/") as string;
    const cacheKey = OFFLINE_CACHE_KEYS[path] ?? genericOfflineCacheKey(fullPath);
    const isGenericKey = !OFFLINE_CACHE_KEYS[path];
    const offlineModeOn = getOfflineModeEnabled();
    try {
      const res = await fetch(fullPath, {
        credentials: "include",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null as T;
      }

      await throwIfResNotOk(res);
      const data = (await res.json()) as T;
      // Only mirror reference data into IndexedDB while offline mode is on.
      // When offline mode is off we must not repopulate the offline store —
      // that would defeat the wipe performed by disableOfflineMode() and
      // could leak data on a shared device.
      if (cacheKey && offlineModeOn) {
        // Mirror verbatim — including archived skills/routines. Historical
        // notes still reference archived items, and DD valuation (home/stats
        // "Best DD", per-session DD) resolves those IDs against this cache
        // when offline. Dropping them silently under-counted historical DD;
        // display surfaces already filter `archived` themselves.
        await cacheSet(cacheKey, data);
      }
      return data;
    } catch (err) {
      if (cacheKey && offlineModeOn) {
        const cached = await cacheGet<T>(cacheKey);
        if (cached !== null && cached !== undefined) return cached;
        // Sane offline default for known list endpoints so the UI does not
        // crash. Generic endpoints have arbitrary shapes — rethrow instead.
        if (!isGenericKey) return [] as unknown as T;
      }
      throw err;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
      // We handle offline behaviour ourselves via tryNetworkOrEnqueue, so we
      // must override React Query v5's default `networkMode: 'online'` which
      // would otherwise PAUSE mutations whenever navigator.onLine is false.
      // Without this, tapping "Log Session" while offline would never invoke
      // the mutationFn — the mutation would just sit in a paused state and
      // the button would appear stuck forever.
      networkMode: 'always',
    },
  },
});

export { cacheDelete };
