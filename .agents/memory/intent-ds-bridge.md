---
name: Intent DS → main app bridge
description: Why the main app must consume the Intent design system via a token bridge, never package imports, and the case/radius rules that guard it.
---

**Rule:** the main app never imports Intent's React components or CSS directly — tokens flow through a generated bridge file only (regen steps documented in replit.md).

**Why:** the app is Tailwind v3, the Intent package is v4 (`@theme`, different utility semantics) — v4 CSS breaks under the v3 pipeline. And the app's local shadcn components carry app-critical patches (bottom-nav collisionPadding, Radix portal stopPropagation) that wholesale replacement would silently regress.

**How to apply:**
- Token changes go through tokens.json + the sync script; the generated `intent-tokens.css` is never hand-edited. Dark bg hex changes fan out to the boot/theme lockstep surfaces AND require a sw.js cache bump (index.html/manifest/splash are in the offline shell).
- Porting component classes: Intent (v4) `rounded-xl` = app (v3) `rounded-2xl` (16px).
- Badge base is uppercase mono — skill codes are case-semantic ("803o" ≠ "803O"), so any badge showing a code needs `normal-case` (SkillCode applies it internally; raw `skillDisplayCode()` sites must add it).
- Light-mode white-on-gradient CTAs use `.bg-gradient-cta` (deepened light endpoints for AA contrast) — don't inline the raw primary→chart-4 gradient behind white text.
