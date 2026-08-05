---
name: Service worker shell cache safety
description: Why the app could show the browser's native offline page despite offline mode being on, and the invariants that prevent it.
---

Rule: the service worker must never end up active with no cached `/` shell. Install must salvage the previous cache's `/` (or throw to abort the install) when the fresh fetch fails, and activate must confirm the new cache has `/` before deleting old caches.

**Why:** A SW cache-name bump installed over flaky wifi used to precache best-effort (failures swallowed), then activate deleted the old cache — leaving zero shell, so launching the PWA offline showed Safari's native "You Are Not Connected to the Internet" page (real user report, Aug 2026).

**How to apply:** When bumping `CACHE` in `client/public/sw.js`, keep the salvage/throw logic intact. Also: the production workflow serves from `dist/` — a stale build serves an old sw.js version; rebuild/restart before verifying SW changes with curl.

Second rule: page code must never hardcode the shell cache version. Settings once kept checking/backfilling `tn-shell-v10` after sw.js moved to v11 — it refilled a dead cache and re-triggered the shell "safety net" (SW re-register + 6 `cache: "reload"` fetches) on every Settings open. Page code discovers the cache at runtime via `findShellCacheName()` in `client/src/lib/offline-control.ts` (numeric max of `tn-shell-vN` — numeric, not lexicographic, since "v9" > "v11" as strings; unit-tested). The shell URL list is shared as `APP_SHELL_URLS` there but still manually mirrors sw.js's `APP_SHELL` — keep them in sync. Related polish: the Settings progress bar snaps to the first real status instead of animating 0→100 on every open.
