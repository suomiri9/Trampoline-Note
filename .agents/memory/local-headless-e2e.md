---
name: Local headless browser e2e fallback
description: How to run your own Playwright browser when the testing subagent's browser is unstable
---

When the testing subagent repeatedly reports browser-notebook instability, run e2e checks yourself:
- **Fastest path (verified): skip installs entirely.** The nix store ships a pre-patched browser at `/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome`; launch playwright-core (1.62 works despite the old rev) with `executablePath` + args `--no-sandbox --disable-gpu --disable-dev-shm-usage`. No LD_LIBRARY_PATH needed. If that store path is gone, `grep playwright-browsers /tmp/store-list.txt` after one `ls /nix/store > /tmp/store-list.txt`.
- For screenshots: the app's `#boot-splash` overlay covers everything for ~2s AFTER React mounts (SplashScreen removes it at 1500+500ms); wait for `#boot-splash` to be `detached`, not just for a page selector, or every shot is the splash.
- Fallback only if no prepatched browser exists: `npx playwright-core install chromium` into `.cache/ms-playwright/`, then build LD_LIBRARY_PATH from /nix/store — it is HUGE (~700k entries) and **multi-arch**: shell globs stall for minutes and the first soname match may be aarch64 (loader silently skips). Resolve via the store-list grep + x86-64 check (ELF bytes 18-19 = 0x3e), cache the joined path (e.g. `/tmp/pw-ldpath` — /tmp is wiped between sessions), verify with `ldd`.
- Script must live in the workspace root (node can't resolve packages from /tmp) and end with `process.exit(0)` or the shell call hangs.
- **Use `https://$REPLIT_DEV_DOMAIN` as the base URL, not localhost** — the session cookie is Secure-only, so auth silently fails (401s) over plain http.
- Register a throwaway account via in-page `fetch('/api/auth/register', …)` with credentials include.
- `ctx.setOffline(true)` works as expected for offline flows.

**Why:** the tester was down for an extended period; this path reproduced and diagnosed a bug the tester couldn't.

Offline-delete flows for *synced* scores: when truly offline the score page hides synced cards behind OfflinePlaceholder, so the queued-delete path only triggers when navigator.onLine is true but the network fails ("onLine lies"). Test it with `page.route(..., route.abort('internetdisconnected'))` on the DELETE requests, not `ctx.setOffline(true)`; use setOffline only for the reload-persistence and reconnect-drain phases.

**Test-account gap:** the dev test account has no skills, so UI buttons gated on a full lineup (e.g. routine save needs 10 skills) stay disabled — seed test rows via in-page `fetch` against the API instead of driving those forms.
