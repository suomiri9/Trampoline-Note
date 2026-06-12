---
name: Tailwind font-display utility must be registered
description: Why `font-display` (and any non-default font utility) silently no-ops unless added to tailwind.config fontFamily
---

# `font-display` is NOT a default Tailwind utility

Tailwind only ships `font-sans`, `font-serif`, `font-mono`. A class like
`font-display` (or any custom family) does nothing unless it is registered under
`theme.extend.fontFamily` in `tailwind.config.ts`, e.g.
`display: ["var(--font-display)"]`.

**Why:** In this repo the display font was driven by a CSS var `--font-display`,
and `.page-title` set `font-family: var(--font-display)` directly in `index.css`,
so page titles looked correct. But every inline `className="font-display ..."`
(score displays, detail page titles, login title, empty states) silently fell
back to the inherited body font — the class was unknown to Tailwind and dropped.
Changing the CSS var alone does not fix these; the utility itself must exist.

**How to apply:** When a `font-*` (or any utility) class appears to have no
effect, first check it is actually configured in `tailwind.config.ts`. Adding a
key to `fontFamily` requires a workflow restart (config is not HMR-hot).

Also: Google-Fonts Bebas Neue ships a single weight (400) and only uppercase
glyphs (renders all-caps + condensed). Use `font-normal` on Bebas elements —
`font-bold`/`font-black` only trigger ugly faux-bold.
