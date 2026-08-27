// Slow-network read fallback. fetch() alone never times out — on flaky wifi
// a request can hang for minutes, which made offline mode look broken: the
// mirrored IndexedDB cache was only consulted after a hard network failure.
// Read paths cap the wait at OFFLINE_READ_TIMEOUT_MS *when offline mode is
// on* (there's a cache to fall back to) and then serve the mirror. When
// offline mode is off nothing is capped: with no fallback available,
// aborting would only turn a slow success into an error.

export const OFFLINE_READ_TIMEOUT_MS = 8000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms: number = OFFLINE_READ_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

// ── "Showing saved data" signal ──────────────────────────────────────────
// Tracks WHICH reads are currently served from the offline mirror, keyed by
// the mirror cache key. Per-key rather than one boolean: with several
// queries in flight, one endpoint recovering must not hide the badge while
// another query's on-screen data still came from the mirror. A key is added
// when a read falls back to the mirror and removed only when THAT read
// completes from the network again (fully parsed, not merely "fetch
// resolved" — a response that later fails parsing falls back to the mirror
// and must not have cleared the signal in between). The indicator shows
// while any key remains.

const servedKeys = new Set<string>();
const subscribers = new Set<() => void>();

function emit() {
  subscribers.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
}

export function markCacheServed(key: string) {
  if (!servedKeys.has(key)) {
    servedKeys.add(key);
    emit();
  }
}

export function markNetworkOk(key: string) {
  if (servedKeys.delete(key)) {
    emit();
  }
}

export function getCacheServed(): boolean {
  return servedKeys.size > 0;
}

/** Wipe the whole signal (tests / offline-mode teardown). */
export function resetCacheServed() {
  if (servedKeys.size > 0) {
    servedKeys.clear();
    emit();
  }
}

export function subscribeCacheServed(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
