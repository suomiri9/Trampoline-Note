---
name: Local headless browser e2e fallback
description: How to run your own Playwright browser when the testing subagent's browser is unstable
---

When the testing subagent repeatedly reports browser-notebook instability, run e2e checks yourself:
- `playwright-core` is a devDependency; the headless Chromium shell lives in `.cache/ms-playwright/` (installed via `npx playwright-core install chromium`).
- Newer headless-shell builds (151+) need the full lib set (glib, nspr, nss, at-spi2/atk, mesa/gbm, dbus, alsa, libX*), and /nix/store here is HUGE (~700k entries) and **multi-arch**: shell globs over it stall for minutes, and the first store path containing a soname may be an aarch64 build that the loader silently skips ("not found" despite the file existing). Resolve libs by (1) one plain `ls /nix/store > /tmp/store-list.txt` readdir, (2) grep candidates per package name, (3) accept only dirs where `file -Lb .../lib/<soname>` says x86-64; join into LD_LIBRARY_PATH. Verify with `ldd` on the shell binary before launching. Cache the joined path to a file (e.g. `/tmp/pw-ldpath`) and reuse it — building it is the slow part. Checking ELF arch by reading bytes 18-19 (0x3e = x86-64) beats spawning `file` per candidate.
- Script must live in the workspace root (node can't resolve packages from /tmp) and end with `process.exit(0)` or the shell call hangs.
- **Use `https://$REPLIT_DEV_DOMAIN` as the base URL, not localhost** — the session cookie is Secure-only, so auth silently fails (401s) over plain http.
- Register a throwaway account via in-page `fetch('/api/auth/register', …)` with credentials include.
- `ctx.setOffline(true)` works as expected for offline flows.

**Why:** the tester was down for an extended period; this path reproduced and diagnosed a bug the tester couldn't.

Offline-delete flows for *synced* scores: when truly offline the score page hides synced cards behind OfflinePlaceholder, so the queued-delete path only triggers when navigator.onLine is true but the network fails ("onLine lies"). Test it with `page.route(..., route.abort('internetdisconnected'))` on the DELETE requests, not `ctx.setOffline(true)`; use setOffline only for the reload-persistence and reconnect-drain phases.
