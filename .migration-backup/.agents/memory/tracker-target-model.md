---
name: Tracker target model (ToF / Execution)
description: How ToF and execution sessions target routines vs library items, where the invariants live, and the units quirk for deductions.
---

# Tracker target model

Both `tof_sessions` and `execution_sessions` target **exactly one of** `routineId` | `skillId` (library item: skill, drill, connection, routine part) | `skillIds` (ad-hoc inline skill sequence, 2–10 ids, repeats/order allowed, no library item created).
**Why (ad-hoc):** user wanted to log skill connections without cluttering the library with one-off connection items; library targets stay available alongside.

**Rules that must stay consistent:**
- Exactly-one-of is enforced in the **storage layer** (`assertSessionTarget`), not zod.
  **Why:** routes use `insertSchema.partial()` for updates and a `.refine()`d schema (ZodEffects) has no `.partial()`. Update paths merge `updates` over the existing row before validating, so partial edits stay guarded.
- Position→skill mapping (`client/src/lib/tracker-target.ts`): sequence targets (routine, or library item with `skillIds`) map value position i → `skillIds[i]`; a single skill/drill is "attempt mode" — every value is another attempt of the same skill (`targetSeqLength` = null).
- **Value counts must be bounded to the target's sequence length at every layer** — form renders only that many cells, parsing/validation ignore cells beyond it, and storage rejects `values.length > (seqLen ?? 10)`.
  **Why:** unbounded trailing values persist but map to no skill, silently corrupting per-skill analyses (code review caught this).
  **How to apply:** any new surface that writes tracker sessions (coach tools, imports, offline sync) must respect the same cap; get seqLen from the target's `skillIds` length.
- Ad-hoc specifics: client `TrackerTarget` has a third `adhoc` kind (seqLen = ids length, so never attempt-mode); picker value `"adhoc"` is page-side state only, not encoded in `decodeTarget`. **Updates flipping target must send explicit `skillIds: null`** — update paths merge over the existing row, so omitting it would keep the stale sequence (`tenthsRowToInsert` defaults it to null for surfaces that don't know about ad-hoc). Photo-review rows deliberately have no ad-hoc option.
- Set/vol category and implied E score are **routine-only** concepts; skill-target sessions store category "vol" and suppress E everywhere (pass-through props like `showE` on shared summary components, not duplicated logic).

**Units quirk:** execution `deductions` are stored in **points** (each ≤ 3.0, e.g. 0.2), while the UI grids collect **tenths as printed** (2 = 0.2). Test payloads hitting the API directly must use points or zod rejects (`deductions.N ≤ 3`) before any target validation runs.

**Practice/comp context:** both session tables carry `context` ("practice" default | "comp") + `compName`. The cross-field invariant (comp ⇒ non-empty name; practice ⇒ name forced null, so flips can't leave stale names) is enforced in storage's normalizeSessionContext — same pattern as the target rules, NOT zod (create schemas keep both fields optional so legacy offline queue bodies replay as practice). Comp UI: violet COMP badge on cards/detail pages; forms + the judges'-sheet photo flow all have the Practice/Competition segment.
