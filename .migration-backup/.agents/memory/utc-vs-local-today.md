---
name: Server UTC vs athlete's local "today"
description: Any "today" logic must use a client-supplied local date — the athlete is in NZ (UTC+12/13) and the server clock lags their day by up to half a day.
---

Rule: never derive the athlete's "today" from the server clock (`new Date().toISOString()`); have the client send its local YYYY-MM-DD and validate it server-side (format + within ±1 day of UTC, else fall back to UTC).

**Why:** The push-level card cached per server-UTC day served *yesterday's* WHOOP recovery (14% vs the real 82%) all NZ morning — until noon local, UTC is still the previous day (real user report, Aug 2026).

**How to apply:** Coach endpoints use `resolveClientDate` + `pickTodayRecovery` in `server/coach-dates.ts` (unit-tested); clients send `new Date().toLocaleDateString("en-CA")`. Any new "today"-sensitive server feature (streaks, daily summaries, reminders) must take the client date the same way. Related: caches keyed by day must also key on the underlying data's freshness (push cache fingerprints today's recovery so a mid-morning WHOOP sync regenerates the card).
