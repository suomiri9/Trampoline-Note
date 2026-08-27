---
name: Dev preview data = clone of the real prod account
description: How preview/demo data should be built and refreshed; user prefers real data over synthetic.
---

The user's dev account and their real production account share the SAME user id, and the dev database holds no other users' rows — so prod rows can be cloned into dev with primary-key ids preserved (then bump sequences). Preserving ids keeps every internal reference intact without remapping: note text embeds skill ids, scores/versions reference routine ids, points-to-fix and debuts-hidden reference both.

**Why:** When offered a synthetic demo dataset, the user asked for the skills from their actual account instead — they want the preview to mirror their real training log. Production is read-only; refresh = snapshot prod → import into dev.

**How to apply:** Re-export the snapshot from production (read-only queries) and run the prod-clone import script in `script/` (look for a seed-from-prod / snapshot pair; the synthetic seeder still exists separately). Restart the workflow afterwards to clear in-memory server caches. Expect one benign orphan: old notes may reference skills deleted from the library (exists in prod too; app renders them as unknown — verification should warn, not fail). WHOOP data can never be seeded (real OAuth link only).
