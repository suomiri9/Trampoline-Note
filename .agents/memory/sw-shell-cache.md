---
name: Service worker shell cache safety
description: Why the app could show the browser's native offline page despite offline mode being on, and the invariants that prevent it.
---

Rule: the service worker must never end up active with no cached `/` shell. Install must salvage the previous cache's `/` (or throw to abort the install) when the fresh fetch fails, and activate must confirm the new cache has `/` before deleting old caches.

**Why:** A SW cache-name bump installed over flaky wifi used to precache best-effort (failures swallowed), then activate deleted the old cache — leaving zero shell, so launching the PWA offline showed Safari's native "You Are Not Connected to the Internet" page (real user report, Aug 2026).

**How to apply:** When bumping `CACHE` in `client/public/sw.js`, keep the salvage/throw logic intact. Also: the production workflow serves from `dist/` — a stale build serves an old sw.js version; rebuild/restart before verifying SW changes with curl.
