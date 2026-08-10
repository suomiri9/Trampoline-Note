---
name: Trampoline repl verification quirks
description: How to verify UI work in this trampoline-training-log repl given its auth gate and known pre-existing type errors.
---

# Verifying UI changes in this repl

## Screenshots are blocked by the auth gate
The app gates every page behind custom email/password auth. The `app_preview`
screenshot tool runs in its own browser session that is NOT logged in and cannot
be driven to fill the login form, so every authenticated page (`/`, `/score`,
`/stats`, `/skills`, `/routines`, `/settings`) screenshots as the login screen.

**Why:** screenshot capture is static (no interaction), and its cookie jar is
separate from anything you can set from bash/code execution.

**How to apply:** do not rely on `app_preview` to visually confirm authenticated
pages. Only the login page itself is screenshot-verifiable that way. For real
visual verification of authed pages AND open dialogs, use the local playwright
fallback (see local-headless-e2e.md): register a throwaway user via in-page
fetch, navigate with ~2.5s splash waits, click testid buttons to open popups,
and `page.screenshot()` to /tmp — this works reliably and shows the actual UI.

## A splash screen overlays the first ~1.5s of every fresh load
`splash-screen.tsx` shows a full-screen animated app mark for `VISIBLE_MS` (~1.5s)
+ a fade on every page load (timer-based, not once-per-session), so `app_preview`
screenshots of even UNauthenticated pages (`/forgot-password`, `/reset-password`)
capture the splash overlay, not the page. The page DOES render underneath (e.g.
the reset form's password inputs appear in the captured browser DOM logs).

**How to apply:** don't retry screenshots expecting the splash to clear — fresh
navigation re-arms it. Confirm unauth pages via the DOM/browser logs + code, the
same as authenticated pages.

## Some TypeScript errors are pre-existing and runtime-safe
`tsc --noEmit` reports a handful of long-standing errors that are NOT from
current feature work and do not block the app (Vite/esbuild transpiles without
type-checking) — they come from untyped `useForm` narrowing and a few
parsed/narrowed `SkillItem`-style objects that lack a `.note` field at the type
level. Re-run `tsc` to see the current exact list; don't memorize it.

**How to apply:** when verifying a change, filter tsc output to the files you
actually edited and ignore the pre-existing baseline. Don't try to "fix" those
unless the task is specifically about them.

## Page scrolling happens inside #root, not the window
`html`/`body` are intentionally `position: fixed; overflow: hidden` (iOS
viewport-scroll lock in `index.css`); ALL vertical scrolling happens inside the
`#root` element. `window.scrollY` is always 0 and `body.scrollHeight` equals the
viewport height — that is NOT a broken-scroll bug.

**How to apply:** in Playwright/e2e scroll checks, drive and measure
`document.getElementById('root').scrollTop/scrollHeight`, never `window.scrollY`
or wheel-on-body heuristics. Any fixed bottom-anchored UI must be covered by the
`.pb-nav-safe` content padding so the last row can scroll clear of it.

## curl API testing needs an https-proto header
Session cookies are `secure: true` behind `trust proxy`, so plain
`curl localhost:5000` logins return 200 but the cookie is never stored/sent.

**How to apply:** add `-H 'X-Forwarded-Proto: https'` to both the login and the
subsequent authenticated curl requests (with `-c`/`-b` cookie jar) when testing
API routes from bash — or simply target `https://$REPLIT_DEV_DOMAIN`, where
cookies work as-is.

**Trap:** with dev auto-login on, a dropped cookie does NOT error — every
subsequent request silently runs as the DEMO user, so test seeds/chat messages
pollute the demo account and need manual SQL cleanup. After registering a test
user, immediately verify `GET /api/auth/user` returns the fresh id (and check
`userId` on created rows) before seeding anything.

- Coach chat vision: the model denies seeing a 1×1 test pixel ("no photo attached"); use a real ≥64px image when verifying image sends.
- Dev auto-login (`DEV_AUTO_LOGIN=1`, non-prod) signs any cookieless `/api` request in as the demo user, so unauthenticated curl returning 200 in dev is NOT a missing-auth bug; `isAuthenticated` still enforces 401 in production.
