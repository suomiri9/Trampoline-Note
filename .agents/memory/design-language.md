---
name: App-wide design language (Fey/Apple minimal)
description: User-approved visual direction — what it is, where it's applied, what's intentionally not converted yet
---

# App-wide design language

The user picked this direction from a canvas mockup (`artifacts/mockup-sandbox/src/components/mockups/TrainingLogFullVariant.tsx`) and asked for it app-wide (Aug 2026).

**The look:** near-black bg, mono `text-[10px] uppercase tracking-[0.18em]` micro-labels, `TRAINING / <PAGE>` breadcrumbs, font-black tight-tracked headlines with `.text-gradient-primary` (primary→#818cf8) accent word, hairline `border-border/10..20` flat panels (not card-3d), tabular-nums figures, border-y stat strips, Apple Stocks-style charts (segmented 1W/1M/1Y/All pills, gradient-fill AreaChart, dots only when ≤35 points).

**Why:** explicit user choice via mockup iteration; consistency beats the old raised card-3d style.

**How to apply:** reference implementations are `client/src/pages/home.tsx`, `client/src/pages/stats.tsx`, `client/src/components/page-header.tsx` (all pages inherit the header). Page bodies open with a full-bleed `StatStrip` (`client/src/components/stat-strip.tsx`, the -mx border-y hairline band with gradient tabular figures) — use it, don't hand-roll new stat bands; comp/PB surfaces use `.text-gradient-gold` (amber→orange) instead of the primary gradient. The conversion is now app-wide and was done by redefining the SHARED tokens, not per page: `.card-3d` = flat hairline transparent panel, `.eyebrow` = mono 10px/0.18em micro-label, `.page-title` = heavy DM Sans tight-tracked (used by Dialog/AlertDialog titles — keep the class), and the shadcn primitives (dialog/popover/dropdown/select/tabs/input/button radii + hairline borders). **Bebas Neue is fully retired** — removed from the Google Fonts link, boot splash, and all `font-display` usages; big figures are `font-semibold tracking-[-0.04/-0.05em] tabular-nums`, headings `font-black tracking-[-0.04em]`. Don't reintroduce Bebas/`font-display`, and don't revert new-style surfaces back to raised cards. Floating surfaces need explicit bg now that card-3d is transparent (coach-widget uses bg-background/95). `PageHeader`'s API/exports (`headerActionClass` etc.) and collapse behavior must stay stable.
