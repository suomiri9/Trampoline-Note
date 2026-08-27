---
name: Offline download mirroring
description: Why the "Downloaded for offline" progress can stall and how mirroring is triggered
---

Rule: reference data (skills, routines, auth user) only lands in IndexedDB when its query function actually runs. `queryClient.invalidateQueries` does NOT refetch unmounted queries, so enabling offline mode from Settings used to leave routines/account "downloading" forever.

**Why:** users saw the progress bar stuck at 67% / account-step forever; the data was never fetched, not slow.

**How to apply:** to force-mirror, use `prefetchQuery({ staleTime: 0 })` for default-queryFn endpoints, and `refetchQueries` for `/api/auth/user` (its custom fetcher does the cacheSet). Settings' download poller has a 10s-throttled safety net doing the same. The shell-progress fraction in Settings hardcodes the APP_SHELL list + cache name — keep in sync with client/public/sw.js.
