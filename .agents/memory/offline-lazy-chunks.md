---
name: Offline lazy route chunks
description: How lazy route chunk loading fails offline and the recovery design that actually works
---

- Blank-app-offline = failed dynamic chunk import, not app logic; all routes must use `lazyPage()`; preload pages online before offline e2e.
- Since Aug 2026 the SW precaches ALL route chunks (build-injected manifest — see sw-shell-cache.md), so ChunkRecovery is a rare-path safety net, not the primary offline story; keep it anyway (partial installs, evictions).

## Recovery design (verified in real browser, prod build)
The rule: **never rebuild a React.lazy component while its route is suspended.** On retry React re-mounts the suspended subtree, so "rebuild fresh lazy on failure" loops forever (thousands of import attempts, eternal spinner, fallback never shows).

Working design (in `lazyPage`):
1. `React.lazy` resolves ONCE; on failure it resolves to a `ChunkRecovery` component (never rejects, never rebuilt).
2. `ChunkRecovery` owns retries: on every mount (and Retry taps) it re-runs the import and swaps the real page in place — SPA recovery, no reload.
3. **Only skip `import()` offline when NO service worker controls the page.** With a controlling SW, precached chunks make offline imports succeed; blocking them breaks every not-yet-imported page at 100% download. Without one, a failed fetch poisons Chrome's module map (chunk + modulepreloaded deps) so even later online imports reject from cache. SW asset matching must ignore query strings or cache-busted retries miss.
4. Best-effort for flaky-network poisoning: extract the chunk URL from the import error and re-import with `?retry=N` (fresh module-map entry). This only cures the parent chunk, not poisoned deps — prevention (rule 3) is the real fix.
5. User-tapped Retry (Aug 2026): bypasses the onLine guard (`navigator.onLine` can misreport offline indefinitely), and if the tap's attempt still fails while `onLine !== false`, escalates to `location.reload()` — the universal cure (fresh module map, also picks up newer builds). User intent travels via a ref set in onClick and snapshot+cleared in the effect.
6. Stale-build rotation (late Aug 2026): a tab/PWA still running an old build that lazy-loads a not-yet-visited page after a new build ships asks for a dead chunk hash (server replaced it; new SW prunes old `/assets/` from the shared cache on activate) — the card showed misleading "offline" copy while fully online. Cure: automatic mount failures while `onLine !== false` now ALSO `location.reload()`, but strictly guarded to once per minute via a sessionStorage timestamp (`autoReloadOncePerMinute()`, module scope, shared across all pages; storage-throw → no reload). The once-per-minute guard is what makes auto-reload loop-safe — never remove it. Card copy is onLine-aware ("This page didn't load / app may have just been updated" when online).

**Why:** verified offline→online real-browser flow; simulation/unit reasoning missed both the remount loop and module-map poisoning.
**How to apply:** any change to `lazyPage` in `client/src/App.tsx` must preserve rules 1–3 and re-verify with a real offline browser flow.
