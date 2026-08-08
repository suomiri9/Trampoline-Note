---
name: Artifact package wiring (no pnpm workspace)
description: Cross-artifact deps in this repl must use file:../<slug> — the root is not a pnpm workspace, so workspace:* never resolves.
---

The repo root is **not** a pnpm workspace, and each `artifacts/*` package installs standalone inside its own directory. Any dependency between sibling artifacts (e.g. the mockup sandbox consuming a design system) must use `"@workspace/<slug>": "file:../<slug>"` — the `workspace:*` protocol the mockup-sandbox/design-system skills assume does not resolve here.

**Why:** a fresh artifact 500s ("Can't resolve 'tailwindcss'") until its own in-dir install runs, and `workspace:*` fails outright; npm links `file:` deps as symlinks and Vite resolves through them fine.

**How to apply:** after creating an artifact, install inside its dir and restart its workflow; for sandbox ds-entries substitute the skill's `workspace:*` step with a `file:` dep. Don't convert the root into a pnpm workspace to "fix" this — the blast radius includes the main app's root node_modules and the working sandbox. The Intent DS docs (its AGENTS.md) already state the `file:` rule.
