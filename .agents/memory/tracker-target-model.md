---
name: Tracker target model (ToF / Execution)
description: How ToF and execution sessions target routines vs library items, where the invariants live, and the units quirk for deductions.
---

# Tracker target model

Both `tof_sessions` and `execution_sessions` target **exactly one of** `routineId` | `skillId` (library item: skill, drill, connection, routine part).

**Rules that must stay consistent:**
- Exactly-one-of is enforced in the **storage layer** (`assertSessionTarget`), not zod.
  **Why:** routes use `insertSchema.partial()` for updates and a `.refine()`d schema (ZodEffects) has no `.partial()`. Update paths merge `updates` over the existing row before validating, so partial edits stay guarded.
- Position→skill mapping (`client/src/lib/tracker-target.ts`): sequence targets (routine, or library item with `skillIds`) map value position i → `skillIds[i]`; a single skill/drill is "attempt mode" — every value is another attempt of the same skill (`targetSeqLength` = null).
- **Value counts must be bounded to the target's sequence length at every layer** — form renders only that many cells, parsing/validation ignore cells beyond it, and storage rejects `values.length > (seqLen ?? 10)`.
  **Why:** unbounded trailing values persist but map to no skill, silently corrupting per-skill analyses (code review caught this).
  **How to apply:** any new surface that writes tracker sessions (coach tools, imports, offline sync) must respect the same cap; get seqLen from the target's `skillIds` length.
- Set/vol category and implied E score are **routine-only** concepts; skill-target sessions store category "vol" and suppress E everywhere (pass-through props like `showE` on shared summary components, not duplicated logic).

**Units quirk:** execution `deductions` are stored in **points** (each ≤ 3.0, e.g. 0.2), while the UI grids collect **tenths as printed** (2 = 0.2). Test payloads hitting the API directly must use points or zod rejects (`deductions.N ≤ 3`) before any target validation runs.
