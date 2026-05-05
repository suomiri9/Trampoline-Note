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
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

// Query keys whose responses we mirror into IndexedDB so they remain
// readable when the device is offline (only when offline mode is on).
const OFFLINE_CACHE_KEYS: Record<string, string> = {
  "/api/skills": "skills",
  "/api/routines": "routines",
};

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async <T>({ queryKey }: { queryKey: readonly unknown[] }) => {
    const path = String(queryKey[0]);
    const cacheKey = OFFLINE_CACHE_KEYS[path];
    const offlineModeOn = getOfflineModeEnabled();
    try {
      const res = await fetch(queryKey.join("/") as string, {
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
        // Don't waste storage on archived items — they aren't needed offline.
        const toCache = Array.isArray(data)
          ? (data as Array<Record<string, unknown>>).filter(
              (item) => item?.archived !== 1,
            )
          : data;
        await cacheSet(cacheKey, toCache);
      }
      return data;
    } catch (err) {
      if (cacheKey && offlineModeOn) {
        const cached = await cacheGet<T>(cacheKey);
        if (cached !== null && cached !== undefined) return cached;
        // Sane offline default for list endpoints so the UI does not crash.
        return [] as unknown as T;
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
