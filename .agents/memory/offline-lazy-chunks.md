---
name: Offline lazy route chunks
description: Route chunk imports fail offline and used to blank the whole app; lazyPage fallback + retry semantics.
---

Rule: every route in App.tsx must be created via `lazyPage()` (not raw `lazy()`), which catches a failed chunk import and renders a "This page isn't available offline yet" screen (testid `card-chunk-offline`) instead of crashing the app to blank.

**Why:** Navigating offline to a page whose JS chunk was never fetched rejects the dynamic import; React error-boundaries were absent, so the whole tree unmounted (this masqueraded as a "save crashed the app" bug during offline e2e testing — the real trigger was a stray nav click to /stats).

**How to apply:** When debugging "blank app offline" reports, check pageerror for `Failed to fetch dynamically imported module` first — it's a chunk miss, not app logic. Note: React lazy caches the rejection-fallback for the session; only the fallback's reload button recovers (improvement tracked as a follow-up task). E2E testers must preload pages online before going offline.
