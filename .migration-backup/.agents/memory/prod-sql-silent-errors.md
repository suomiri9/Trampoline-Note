---
name: Prod executeSql silent failures
description: How to detect that a read-only production SQL query errored when executeSql reports success
---

Read-only production queries run wrapped in `START TRANSACTION … ROLLBACK`. When the inner SELECT errors (e.g. references a column that doesn't exist in prod), `executeSql` still returns `success: true, exitCode: 0` and `output` contains ONLY `"START TRANSACTION\nROLLBACK\n"` — the SQL error is swallowed.

**Why:** Burned time debugging "empty" prod results that were actually failing queries: workspace schema had columns prod didn't have yet (prod schema lags the workspace until the next publish).

**How to apply:**
- Output that is only transaction markers = the query FAILED, not "no rows".
- Probe with `SELECT 1`, then `information_schema.columns` for the table, before trusting any prod query that touches recently added columns.
- Some failures do surface a proper error string ("column … does not exist") — the silent form appears with multi-expression selects; treat both as the same signal.
