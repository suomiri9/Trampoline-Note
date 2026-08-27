---
name: Offline read fallback (8s cap + per-key saved-data signal)
description: Rules for read paths that fall back to the IndexedDB mirror — timeout gating, error semantics, and the "Slow connection — saved data" indicator.
---

# Offline read fallback

Read paths with a mirror fallback (queryClient default queryFn, notes hooks, auth user fetch, lazy route chunks) are abort-capped at 8s (`OFFLINE_READ_TIMEOUT_MS` in `read-fallback.ts`), matching the write queue's 8s rule.

**Rules:**
- The 8s cap applies ONLY while offline mode is ON (there's a mirror to serve). Offline-mode-OFF reads are never aborted — with no fallback, aborting turns a slow success into an error.
- A timed-out read with NO cache must rethrow, never return a fake-empty `[]` — an empty list lies about the user's history.
- The auth cached-identity fallback must NOT require `navigator.onLine === false`; flaky "still online" wifi is exactly when it's needed. Session marker + offline mode ON still required; a real 401 wipes caches before the catch.

**"Saved data" signal is per-key, not a boolean:**
- `markCacheServed(key)` / `markNetworkOk(key)` track a `Set` of mirror cache keys currently served from the mirror; the indicator shows while non-empty.
- **Why:** a single boolean races — concurrent query B succeeding cleared the flag while query A's mirror data was still on screen (architect-review finding).
- `markNetworkOk(key)` fires only after a FULLY PARSED network result (or a definitive 401), never right after `fetch` resolves — a bad-status/parse failure falls back to the mirror and must not have cleared the badge in between.

**How to apply:** any new read path that mirrors into IndexedDB must use `fetchWithTimeout` gated on offline mode, mark the signal with its mirror cache key, and follow the rethrow-on-abort rule.
