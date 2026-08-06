import { setOfflineModeEnabled } from "./offline-mode";
import { drainQueue, clearOfflineDataAndQueue } from "./offline-queue";
import { queryClient } from "./queryClient";

/** App-shell URLs — must stay in sync with APP_SHELL in client/public/sw.js. */
export const APP_SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

/** URL of the build-generated list of every hashed build asset (route
 * chunks, CSS, fonts). Emitted by script/build.ts; absent in dev. */
export const OFFLINE_MANIFEST_URL = "/offline-manifest.json";

let manifestMemo: { at: number; urls: string[] | null } | null = null;

async function parseManifest(res: Response | null | undefined): Promise<string[] | null> {
  if (!res || !res.ok) return null;
  try {
    const data = (await res.json()) as { urls?: unknown };
    if (!Array.isArray(data.urls)) return null;
    const urls = data.urls.filter((u): u is string => typeof u === "string" && u.startsWith("/"));
    return urls.length > 0 ? urls : null;
  } catch {
    return null;
  }
}

/** The full set of URLs the offline download must contain for EVERY page to
 * work offline (lazy route chunks, CSS, fonts — plus the manifest itself).
 * Network first, cached copy as the offline fallback. Returns null in dev or
 * when no manifest can be found; callers then fall back to the core shell
 * list. A null result is retried after a short TTL, a real list is kept for
 * the rest of the page load. */
export async function getOfflineAssetUrls(): Promise<string[] | null> {
  const now = Date.now();
  if (manifestMemo && (manifestMemo.urls !== null || now - manifestMemo.at < 30_000)) {
    return manifestMemo.urls;
  }
  let urls: string[] | null = null;
  try {
    urls = await parseManifest(
      await fetch(OFFLINE_MANIFEST_URL, { cache: "no-store", credentials: "same-origin" }).catch(
        () => null,
      ),
    );
  } catch {
    urls = null;
  }
  if (!urls && typeof caches !== "undefined") {
    try {
      urls = await parseManifest(await caches.match(OFFLINE_MANIFEST_URL));
    } catch {
      urls = null;
    }
  }
  manifestMemo = { at: now, urls };
  return urls;
}

/** Pathnames of everything in the given cache (query strings ignored, so
 * chunk-retry variants like `foo.js?retry=1` still count as cached). */
export async function getCachedPathnames(cache: Cache): Promise<Set<string>> {
  const paths = new Set<string>();
  for (const req of await cache.keys()) {
    try {
      paths.add(new URL(req.url).pathname);
    } catch {
      // ignore malformed entries
    }
  }
  return paths;
}

/** How many of `targets` are present in the cached pathname set. */
export function countCachedTargets(targets: string[], cachedPaths: Set<string>): number {
  let n = 0;
  for (const t of targets) if (cachedPaths.has(t)) n += 1;
  return n;
}

/** Finds the service worker's current shell cache (the highest-numbered
 * `tn-shell-vN`). Returns null when no shell cache exists yet. Page code must
 * NEVER hardcode the version — sw.js bumps its CACHE name on every shell
 * change, and a hardcoded copy silently goes stale (it happened: settings
 * kept checking v10 after sw.js moved to v11, refilling a dead cache). */
export async function findShellCacheName(): Promise<string | null> {
  if (typeof caches === "undefined") return null;
  try {
    const keys = await caches.keys();
    let best: string | null = null;
    let bestN = -1;
    for (const key of keys) {
      const m = /^tn-shell-v(\d+)$/.exec(key);
      if (!m) continue;
      const n = parseInt(m[1], 10);
      if (n > bestN) {
        bestN = n;
        best = key;
      }
    }
    return best;
  } catch {
    return null;
  }
}

export async function registerServiceWorker(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch {
    // ignore — service worker is best-effort.
  }
}

export async function unregisterServiceWorkers(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
  } catch {
    // ignore
  }
  if (typeof caches !== "undefined") {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    } catch {
      // ignore
    }
  }
}

export async function enableOfflineMode(): Promise<void> {
  setOfflineModeEnabled(true);
  await registerServiceWorker();
  // Actively fetch reference data so it lands in IndexedDB right away.
  // invalidateQueries alone only refetches queries that are currently
  // mounted — from the Settings page, routines/skills may not be — which
  // left the download progress stuck until the user visited those pages.
  void queryClient.prefetchQuery({ queryKey: ["/api/skills"], staleTime: 0 });
  void queryClient.prefetchQuery({ queryKey: ["/api/routines"], staleTime: 0 });
  // Re-run the auth query so the account (incl. points to fix) is mirrored
  // into IndexedDB — its fetcher does the mirroring, but react-query won't
  // call it again on its own since the user data is already fresh.
  void queryClient.refetchQueries({ queryKey: ["/api/auth/user"] });
}

export async function disableOfflineMode(): Promise<void> {
  // Best-effort: drain any queued items if we currently have a connection.
  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      await drainQueue();
    } catch {
      // ignore
    }
  }
  await clearOfflineDataAndQueue();
  await unregisterServiceWorkers();
  setOfflineModeEnabled(false);
}
