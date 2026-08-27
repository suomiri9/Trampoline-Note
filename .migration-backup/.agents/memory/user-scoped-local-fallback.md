---
name: User-scoped localStorage fallbacks
description: Per-account preferences with a localStorage fallback must namespace the key by user id.
---
Rule: when a per-account preference uses localStorage as an offline fallback, namespace the key by user id and never read the unscoped legacy key for authenticated users; server null → empty default, not the device blob.

**Why:** Completion review rejected an unscoped fallback as a cross-account preference leak on shared devices (account B inheriting account A's choices).

**How to apply:** See `client/src/lib/debuts-hidden.ts` for the established pattern (parse/load/save/resolve helpers + regression test for account switch). Reuse it for any new synced-preference feature.
