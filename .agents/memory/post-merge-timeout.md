---
name: Apply-to-main silent failure = post-merge timeout
description: Diagnosing "Apply to main" that spins and silently fails in this project
---

**Rule:** When the user says "Apply to main" takes a long time, does nothing, and the button reappears, check the post-merge setup config first (`getPostMergeConfig()` / `runPostMergeSetup()`), not the code or git state.

**Why:** This project's post-merge script runs `npm install` + `npm run db:push`. Its timeout was originally 20000 ms — a cold `npm install` after a merge easily exceeds that, so the script was killed, setup failed, and the apply was rolled back with no visible error. Raised to 180000 ms (July 2026).

**How to apply:** If applies fail again, run `runPostMergeSetup()` and read the log tail; if it timed out, bump `timeoutMs` via `setPostMergeConfig`; if it errored, fix `scripts/post-merge.sh` (must be non-interactive, stdin is closed).
