---
name: Always render skill codes via skillDisplayCode
description: Why raw skill.code renders as "?" or a wrong code for shape variants, and the one safe exception.
---

When showing a skill's CODE in the UI, always use `skillDisplayCode(skill, allSkills)` (from
`client/src/lib/training-utils.ts`), never the raw `skill.code` field.

**Why:** A shape-variant skill (one with `parentSkillId`) derives its real displayable code as
`baseCode + shape`. Its own raw `code` field is often empty or only the partial shape symbol, so
rendering raw `skill.code` shows "?" (empty → `|| "?"` fallback) or a wrong/partial code. This bug
has surfaced repeatedly (routine-parts sequence chips, the Edit-Routine-Part "Skills in this part"
preview, and the points-to-fix Drills pickers — the adjacent Skills pickers already used the helper).

**How to apply:** Any new list/preview that prints a code must call `skillDisplayCode(s, allItems)`
and resolve member ids against the FULL item list (`allItems`), not a filtered top-level list (which
drops shape children + drills). Use `skillDisplayName(s, allItems)` for names too, for symmetry.
**Only safe exception:** a list explicitly filtered to `parentSkillId == null` (top-level bases only,
e.g. the assign-as-shape base picker) — there raw `code` equals `skillDisplayCode` output anyway.

## Mode-aware chips: prefer the SkillCode component for code-only chips

There is a global "Show Skill Names" preference (localStorage key `showSkillNames`, default OFF =
codes) backed by `client/src/lib/skill-label-mode.ts` + `client/src/hooks/use-skill-label-mode.ts`.
For any **code-only** chip/badge, render `<SkillCode skill={s} allSkills={allItems} fallback="?" />`
(`client/src/components/skill-code.tsx`) instead of inlining `skillDisplayCode(...)`. SkillCode shows
the combined CODE by default and swaps to the skill's NAME when the pref is on (falling back to code).

**Why:** otherwise a new raw-`skillDisplayCode` chip silently ignores the toggle, so the app shows a
mix of codes and names. SkillCode owns the hook, so each chip honors the pref with no per-parent wiring.

**How to apply:** Use SkillCode ONLY where a chip shows the code alone. Do NOT convert code+name
surfaces — pickers that already render code beside the name, table "Code" columns, form code prefills,
`SkillEditorOverlay` rows, or shape-swap warnings — they must stay on `skillDisplayCode` (converting
them would print the name twice). The Settings → Preferences toggle is `data-testid="toggle-skill-names"`.
