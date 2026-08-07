---
name: Routine lineup versioning model
description: Semantics of "change from this day" routine versioning — exclusive end days, current-lineup-on-row invariant, offline ordering.
---

**Rules:**
- The routine row always holds the CURRENT lineup; past lineups are versions whose end day is **EXCLUSIVE** (an old lineup covers dates strictly BEFORE the change day; the change day itself already uses the new lineup). Resolution is plain ISO `yyyy-mm-dd` string comparison on athlete-local dates — never server-clock "today".
- Lineup-for-a-date resolution has a single shared implementation — always resolve through it, never reimplement the comparison.
- The server is the authority for versions: it recomputes them from its own state and ignores any client-precomputed list (the client's list exists only to keep the offline mirror correct while an edit sits in the queue).
- "Change from this day" PUTs are **ordered mutations**: the offline queue must never collapse them, and later plain edits must not replace them — each snapshot depends on the state the previous mutation produced. Only plain-over-plain routine PUTs may collapse.
- Name-only / identical-lineup updates must not touch versions; a lineup change WITHOUT a from-day means "rewrite all history" and clears them.
- Concurrent-edit semantics (verified e2e with the offline queue): the server recomputing from its own state means a conflicting from-day edit with the SAME day is correctly dropped (empty covered range under exclusive end days), one with an earlier day survives as a window, and non-lineup fields are last-writer-wins because queued PUTs carry the full body.
- Debuts keeps the ORIGINAL segment keyed by the bare routine id (saved hidden-row prefs depend on it); later segments get derived keys.

**Why:** Editing a routine used to silently rewrite history. The exclusive end day matches the athlete's mental model ("from this day" = entries on that day train the new lineup). Current-lineup-on-row keeps version-unaware surfaces (ToF/execution trackers, score pages — out of scope by user decision) working unchanged. The queue-collapse exception exists because code review caught real data loss: two offline from-day edits collapsed to one, dropping the intermediate boundary.

**How to apply:**
- Any new surface that displays or counts a routine's skills for a dated entry must resolve the lineup by that entry's date; no date = current lineup, which is only correct for "current routine" surfaces.
- When touching the offline queue's collapse/squash logic, preserve the ordered-mutation exception for from-day routine edits (tests cover it).
