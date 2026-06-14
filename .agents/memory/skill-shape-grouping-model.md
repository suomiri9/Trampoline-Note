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

## Shape display: CODE combined, NAME independent (current rule)

The CODE/NAME rule for shapes diverged after iteration — settle on this:
- **CODE is combined** everywhere: `baseCode+shapeCode` (e.g. `8--<`, `4-o`), pure concatenation, no
  separator — via `skillDisplayCode(skill, allSkills)` in `client/src/lib/training-utils.ts`.
- **NAME is independent** everywhere: a shape shows ONLY its OWN name (e.g. `T`, `Tuck`), NOT
  `baseName+shapeName` — via `skillDisplayName(skill)`, which now just returns `skill.name` (parent is
  NOT prefixed; the `allSkills` arg is kept for signature compatibility but unused).
- The training-log shape-chooser HEADING still shows the base's OWN code (`${base.code} — pick shape`);
  its list ITEMS use the combined code + own name.
- Selecting the shape Code dropdown sets `code`+`shape` but does NOT auto-fill the Name (user types it).

**Why (evolution — don't relitigate):** user first wanted shapes combined for code AND name everywhere
(incl. the library), then explicitly chose "independent NAME only, keep CODE combined" (e.g. code `4-o`
but name shows just `T`). Reason: the combined name (`BT`) read as noise; the combined code already
disambiguates which base a shape belongs to.
**How to apply:** keep `skillDisplayCode` concatenating and `skillDisplayName` returning the own name.
Do NOT re-add parent-name prefixing to `skillDisplayName`, and do NOT add name auto-fill on the shape
Code dropdown. Both helpers are the single source of truth — every surface routes names/codes through
them, so change behavior there, not at call sites.
