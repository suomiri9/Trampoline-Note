---
name: Trampoline repl verification quirks
description: How to verify UI work in this trampoline-training-log repl given its auth gate and known pre-existing type errors.
---

# Verifying UI changes in this repl

## Screenshots are blocked by the auth gate
The app gates every page behind custom email/password auth. The `app_preview`
screenshot tool runs in its own browser session that is NOT logged in and cannot
be driven to fill the login form, so every authenticated page (`/`, `/score`,
`/stats`, `/skills`, `/routines`, `/settings`) screenshots as the login screen.

**Why:** screenshot capture is static (no interaction), and its cookie jar is
separate from anything you can set from bash/code execution.

**How to apply:** do not rely on `app_preview` to visually confirm authenticated
pages. Verify instead with `tsc --noEmit`, the workflow/HMR logs (no runtime
errors after edits), and careful reasoning about the JSX/state changes. Only the
login page itself is screenshot-verifiable.

## Some TypeScript errors are pre-existing and runtime-safe
`tsc --noEmit` reports a handful of long-standing errors that are NOT from
current feature work and do not block the app (Vite/esbuild transpiles without
type-checking) — they come from untyped `useForm` narrowing and a few
parsed/narrowed `SkillItem`-style objects that lack a `.note` field at the type
level. Re-run `tsc` to see the current exact list; don't memorize it.

**How to apply:** when verifying a change, filter tsc output to the files you
actually edited and ignore the pre-existing baseline. Don't try to "fix" those
unless the task is specifically about them.
