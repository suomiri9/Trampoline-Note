---
name: Offline mirrors are verbatim
description: Why offline-mode IndexedDB mirrors of reference lists must not filter rows the server returns
---

The offline mirror of reference lists (skills, routines, …) must cache the server response **verbatim**. Never strip "unneeded" rows (e.g. `archived === 1`) as a storage optimization.

**Why:** The mirror once dropped archived skills; historical notes still reference them, and DD valuation (`calculateTotalDD` in shared/dd.ts, used by home + stats "Best DD" and per-session DD) resolves those ids against the cache when offline — archived skills valued at 0 silently under-counted historical sessions. Caught by an architect review, not by tests or users.

**How to apply:**
- Offline cache contract = online API contract. If the server returns a row, the mirror keeps it; display surfaces already filter `archived` themselves (they must, online).
- Any "save storage by filtering the mirror" idea is wrong until proven otherwise — valuation/history features read old ids.
- Related but distinct: notes never store DD (no difficulty column on notes; that field lives on scores) — session DD is always computed from the skills JSON. Don't "read stored DD" from notes.
