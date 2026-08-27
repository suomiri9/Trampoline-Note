---
name: Schema changes need three touchpoints
description: Adding a DB column in this app requires more than editing the drizzle schema — prod migrates via a startup SQL block, and some rows have client-local TS interfaces.
---

**Rule:** when adding a column, touch all of:
1. `shared/schema.ts` (drizzle table) + `npm run db:push` for the dev DB.
2. The idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` block in the server's startup migration ("Database migrations applied" log line). Production NEVER runs db:push — deployed instances get new columns only from this block at boot.
3. Any client-local interface mirroring the row (e.g. the coach chat keeps its own message interface instead of importing the shared inferred type) — the shared type updating does NOT propagate there.

**Why:** a persisted-chips fix once shipped with only step 1; code review caught that prod inserts would fail (missing column at runtime) and the client read a field its local interface didn't declare (new TS error). Nothing in schema.ts hints that the startup block or local interfaces exist.

**How to apply:** after any schema edit, grep the server entrypoint for `ADD COLUMN` and grep the client for a local interface/type with the table's row name before considering the change done.
