---
name: Intent DS → main app bridge
description: Why the main app must consume the Intent design system via a token bridge, never package imports, and the case/radius rules that guard it.
---

**Rule:** the main app never imports Intent's React components or CSS directly — tokens flow through a generated bridge file only (regen steps documented in replit.md).

**Why:** the app is Tailwind v3, the Intent package is v4 (`@theme`, different utility semantics) — v4 CSS breaks under the v3 pipeline. And the app's local shadcn components carry app-critical patches (bottom-nav collisionPadding, Radix portal stopPropagation) that wholesale replacement would silently regress.

**Palette (user-chosen, Aug 2026):** dark mode primary = blue-500 `217 91% 60%` (#3b82f6), chart-4 = indigo-500 `239 84% 67%` (#6366f1), background = pure black `0 0% 0%`. User explicitly chose this over the Intent sky/cyan defaults — don't revert. Light mode primary = blue-600 `221 83% 53%`.

**How to apply:**
- Token changes go through `intent-tokens.css` (hand-editable after the initial sync — the sync script would overwrite them, so document this); gradients and glows in index.css and home.tsx reference `var(--primary)` + `var(--chart-4)` and cascade automatically.
- Dark bg hex changes fan out to the boot/theme lockstep surfaces AND require a sw.js cache bump (index.html/manifest/splash are in the offline shell).
- Porting component classes: Intent (v4) `rounded-xl` = app (v3) `rounded-2xl` (16px).
- Badge base is uppercase mono — skill codes are case-semantic ("803o" ≠ "803O"), so any badge showing a code needs `normal-case` (SkillCode applies it internally; raw `skillDisplayCode()` sites must add it).
- Light-mode white-on-gradient CTAs use `.bg-gradient-cta` (deepened light endpoints for AA contrast) — don't inline the raw primary→chart-4 gradient behind white text.
