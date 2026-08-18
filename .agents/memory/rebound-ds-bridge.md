---
name: Rebound DS → app bridge
description: How the main app consumes the Rebound design system (token bridge, not package imports); intent artifact retired.
---

The main app consumes `artifacts/rebound` (the "Rebound" design system, extracted FROM the app itself in Aug 2026) through a generated token bridge, never through package imports.

**The rule:** `artifacts/rebound/tokens.json` → `pnpm tokens` (in the artifact) → `node script/sync-rebound-tokens.mjs` (repo root) → GENERATED `client/src/rebound-tokens.css` (imported by `main.tsx` after `index.css`). Never hand-edit the bridge file; never import DS components into the app.

**Why:** the app is Tailwind v3, the DS package is Tailwind v4 — component/style imports break. App shadcn components stay local because they carry app-critical patches (bottom-nav collisionPadding, Radix stopPropagation, etc.). Rebound was extracted from the app, so a resync is a visual no-op unless tokens.json is deliberately edited.

**How to apply:** any DS token change = edit tokens.json, run both steps above, restart the app workflow. The bridge extracts only the FIRST `:root`/`.dark` blocks (the language-layer's later `:root` additions stay DS-side; the app defines those utilities in its own index.css). Badge skill codes still need `normal-case` (shared `SkillCode` handles it).

The older `artifacts/intent` DS remains registered in the workspace but the app no longer consumes it (its bridge + sync script were deleted). Rebound's stale counterpart: intent's tokens.json kept the old sky palette; rebound's tokens are authoritative for the app's blue.
