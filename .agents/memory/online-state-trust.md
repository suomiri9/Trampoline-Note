---
name: Online-state trust rules (iOS PWA)
description: Why navigator.onLine and online/offline events must never gate fetches, and how the app heals stale offline state after resume.
---

# Online-state trust rules

iOS — especially the installed standalone PWA — misses `online`/`offline` events fired while the app is suspended, and `navigator.onLine` itself can stay stale-false for a while after resume. Any event-derived "offline" state can therefore be wrong until the app is force-quit.

**Rules:**
- React Query queries AND mutations must keep `networkMode: "always"` (queryClient defaults; pinned by a test). The v5 default `'online'` PAUSES fetches once an `offline` event was seen — queryFn never runs, so even the IndexedDB mirror fallback is skipped; the UI strands on skeletons/offline cards until force-quit. Offline behaviour lives in our own layer (getQueryFn mirror fallback + 8s cap), never in React Query's pause gate.
- `useOnline` is a module-level store that re-reads `navigator.onLine` on `focus`/`pageshow`/`visibilitychange` (foreground-return events DO fire reliably) as well as online/offline events. When it reads true it also heals `onlineManager.setOnline(true)` so reconnect refetches resume. It never pushes `false` into onlineManager — v5 deliberately starts at true because navigator.onLine under-reports connectivity.
- `navigator.onLine === false` may choose *messaging* (offline cards), never *behaviour* (blocking a fetch). Symmetric rule to the auth fallback, which ignores `navigator.onLine === true`.
- Offline placeholders must never dead-end: `OfflinePlaceholder` takes `onRetry`/`retrying`; pages showing it should wire a refetch and add a self-heal effect on the online flag flipping true.

**Why:** user's WHOOP page stranded on the offline card ("gotta quit the app and reopen it") — paused queries + stale event state, two independent locks with the same symptom.

**How to apply:** any new online-gated UI or `enabled: isOnline` query must tolerate a lying flag — provide a manual retry and never rely on the `online` event arriving.
