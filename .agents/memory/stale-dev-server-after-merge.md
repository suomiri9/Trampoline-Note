---
name: Stale dev server after task merges
description: Dev workflow does not hot-reload server-side files; merged server changes need a workflow restart or the old code keeps serving.
---

The dev workflow (`npm run dev`) hot-reloads the Vite client but does NOT restart the Express server process when `server/*` files change (e.g. when a task agent's work is merged into main). The running process keeps serving the pre-merge server code.

**Why:** A user hit `413 request entity too large` on a route that the merged code had explicitly added to the raised-body-limit list — the fix was already on disk, but the server process predated the merge. A workflow restart alone resolved it.

**How to apply:** When runtime behavior contradicts what the current server source clearly says (routes missing, old limits, old error messages) — especially right after a task merge — restart the `Start application` workflow FIRST and retest before debugging the code.
