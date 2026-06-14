---
name: Skill shape-grouping model (base = pure grouping)
description: How tuck/pike/straight shapes relate to their base skill, and why the base has no DD / is not loggable.
---

# Skill shape grouping: base is a PURE GROUPING

This model applies to BOTH skills and drills (a base's shape children always share the base's
`isDrill`). When a skill OR drill has shape variants (each its own `skills` row linked via
`parentSkillId` + `shape`),
the BASE row is a pure grouping: it has **no DD of its own** and is **not directly loggable**.
All DD lives in the explicit shape children (tuck `o` / pike `<` / straight `/`). The base is NOT
"the implicit first shape" — that earlier framing was superseded.

Concretely: the add/edit form hides the base Difficulty field once a shape draft exists and forces
base `difficulty` to 0 on save; the skills library hides the base's DD value (it shows a children-only
shape count instead) and counts shapes as children-only (no `+1`); the training-log shape chooser lists only the children (the base itself
is not a selectable option), so a grouped base can never be logged with DD 0.

The shape "Code" is a fixed dropdown of symbols (`o`/`<`/`/`), and the chosen symbol becomes the
shape row's `code` and `shape`. There is intentionally NO separate free-text per-shape code field.

**Why:** The user explicitly requested this in a follow-up ("delete dd for itself and only show dd
with shape when a shape added" + make shape Code a dropdown). It overrides the ORIGINAL shape-grouping spec
(base stays a normal loggable skill; explicit per-shape code with no auto-derivation). The automated
code review keeps grading against that original spec and will flag these two points as regressions —
they are intentional, user-directed deviations, not bugs. The genuinely valid review concern (a
grouped base being loggable with DD 0, skewing session totals) was fixed by removing the base from
the picker chooser.

**How to apply:** Don't "restore" base DD / base loggability or add a free-text shape code to satisfy
a code review — confirm with the user first, because it contradicts their stated intent. Server-side
`storage.assertValidParent(userId, parentSkillId, childIsDrill, selfId?)` (→ `SkillLinkError` → 400)
guards parentSkillId links: no self-parent, parent must be a top-level base of the SAME KIND as the
child (`parent.isDrill === childIsDrill` — skills can't nest under drill bases or vice-versa), no
nesting under a shape, a row that owns shapes can't become one; `updateSkill` also blocks flipping
`isDrill` on a base that owns children. The shared Shapes editor is
`client/src/components/shape-drafts-editor.tsx`, reused by the Skills-tab skill+drill forms and the
note-dialog quick-add (New Skill + New Drill).

## Combined shape display (base+shape) — now EVERYWHERE including the library

A shape must show its FULL identity wherever it appears — code = `baseCode+shapeCode`
(e.g. `8--<`), name = `baseName+shapeName` (e.g. `BT`), pure concatenation, no separator — via
`skillDisplayCode`/`skillDisplayName` in `client/src/lib/training-utils.ts`. This now INCLUDES the
Skills-library nested shape rows: the user REVERSED the earlier "keep own code/name in the library"
decision and asked for the combined identity there too. The ONLY surface that still keeps the shape's
OWN code/name is the training-log shape-chooser HEADING (`${base.code} — pick shape`) — its list ITEMS
are combined. Also: selecting the shape Code dropdown sets `code`+`shape` but no longer auto-fills the
Name (user types it).

**Why:** user wants combined identity so listed/logged shapes read unambiguously, and decided the
library should match (e.g. `4-/` / `BS`) even though the base label is one row up — the earlier
"avoid redundant base-prefix noise in the library" rationale was overruled by the user.
**How to apply:** KEEP the library shape rows combined; do NOT "restore" own-code/name there to match
the old mockup. Don't drop the combine from the other surfaces, and don't re-add name auto-fill on the
shape Code dropdown.
