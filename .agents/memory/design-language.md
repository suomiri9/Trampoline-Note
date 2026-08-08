---
name: App-wide design language (Fey/Apple minimal)
description: User-approved visual direction — what it is, where it's applied, what's intentionally not converted yet
---

# App-wide design language

The user picked this direction from a canvas mockup (`artifacts/mockup-sandbox/src/components/mockups/TrainingLogFullVariant.tsx`) and asked for it app-wide (Aug 2026).

**The look:** near-black bg, mono `text-[10px] uppercase tracking-[0.18em]` micro-labels, `TRAINING / <PAGE>` breadcrumbs, font-black tight-tracked headlines with `.text-gradient-primary` (primary→#818cf8) accent word, hairline `border-border/10..20` flat panels (not card-3d), tabular-nums figures, border-y stat strips, Apple Stocks-style charts (segmented 1W/1M/1Y/All pills, gradient-fill AreaChart, dots only when ≤35 points).

**Why:** explicit user choice via mockup iteration; consistency beats the old raised card-3d style.

**How to apply:** reference implementations are `client/src/pages/home.tsx`, `client/src/pages/stats.tsx`, `client/src/components/page-header.tsx` (all pages inherit the header). Other pages' *body content* still uses card-3d — that's pending work (a proposed task covers it), not the desired end state. Don't "restore consistency" by reverting new-style surfaces back to card-3d. `PageHeader`'s API/exports (`headerActionClass` etc.) and collapse behavior must stay stable; `.page-title` CSS class is still used by dialog components — don't delete it.
