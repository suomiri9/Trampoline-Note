import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { cacheGet, cacheSet, cacheDelete } from "./offline-db";
import { getOfflineModeEnabled } from "./offline-mode";
import { fetchWithTimeout, isAbortError, markCacheServed, markNetworkOk } from "./read-fallback";

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
  // Dictionary responses are role-sensitive: admins receive private draft
  // metadata and archived entries. Never persist any dictionary endpoint in
  // the account-agnostic offline mirror.
  if (fullPath.startsWith("/api/dictionary")) return null;
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
    // Per-query key for the "showing saved data" signal (see read-fallback).
    const signalKey = cacheKey ?? fullPath;
    const offlineModeOn = getOfflineModeEnabled();
    try {
      // With offline mode on there is a mirror to fall back to, so cap how
      // long a read may hang on flaky wifi; with it off, keep the browser's
      // own behaviour — aborting would only replace a slow success with an
      // error and there is nothing to serve instead.
      const res = offlineModeOn
        ? await fetchWithTimeout(fullPath, { credentials: "include" })
        : await fetch(fullPath, { credentials: "include" });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        // Definitive server answer — this key is no longer mirror-served.
        markNetworkOk(signalKey);
        return null as T;
      }

      await throwIfResNotOk(res);
      const data = (await res.json()) as T;
      // Clear the "served from mirror" signal only now, with a fully parsed
      // network result. Clearing right after fetch resolved could drop the
      // badge and then land in the mirror fallback anyway (bad status/parse).
      markNetworkOk(signalKey);
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
        if (cached !== null && cached !== undefined) {
          markCacheServed(signalKey);
          return cached;
        }
        // Sane offline default for known list endpoints so the UI does not
        // crash. Generic endpoints have arbitrary shapes — rethrow instead.
        // A TIMED-OUT request must also rethrow: returning [] would render a
        // fake-empty list while a slow-but-alive connection is still usable.
        if (!isGenericKey && !isAbortError(err)) return [] as unknown as T;
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
      // Same rationale as mutations below: offline behaviour lives in
      // getQueryFn (IndexedDB mirror fallback + 8s cap), so fetches must
      // really run. v5's default networkMode 'online' PAUSES every fetch
      // once its onlineManager saw an 'offline' event — and iOS PWAs
      // routinely miss the matching 'online' event while suspended, leaving
      // queries paused (stuck skeletons / offline cards, e.g. the WHOOP
      // page) until the app is force-quit.
      networkMode: "always",
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
