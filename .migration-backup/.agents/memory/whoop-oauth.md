---
name: WHOOP per-user OAuth
description: WHOOP linking is per-app-user OAuth with in-app sign-in, not the Replit connector
---

WHOOP data access uses per-user OAuth: each app user clicks "Sign in with WHOOP"
in the app and links their own account; tokens live server-side per user in
`whoop_tokens`.

**Why:** Project decision — WHOOP must support multiple athletes, each with their
own WHOOP account, and connect from inside the app UI. Do not switch WHOOP to the
account-level Replit connector/`@replit/connectors-sdk` approach (Resend still
uses the SDK).

**How to apply:** Extend the existing per-user token flow for any new WHOOP
features. The WHOOP developer-app config must list every origin's
`/api/whoop/callback` as a redirect URI — add the published domain (callback +
privacy URL) at deploy time. `/api/whoop/*` response bodies are excluded from the
request logger (personal health data) — keep it that way. New tables need a
CREATE TABLE IF NOT EXISTS entry in the startup `runMigrations()` (plus a
migrations/*.sql record) — `db:push` alone doesn't cover prod.
