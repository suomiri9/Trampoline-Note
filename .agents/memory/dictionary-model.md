---
name: Dictionary & admin model
description: Shared skills/drills dictionary — adoption is copy-only, altNames grow only via accepted suggestions, admin is a server-checked users flag
---
- Adopting a dictionary entry COPIES it into personal skills (provenance via the skill's `dictionaryEntryId`; the "Added" marker counts non-archived personal rows). No sync-back: later entry edits must not touch adopted skills.
- Entry altNames ("also called …") grow ONLY through accepted suggestions; the entry editor deliberately cannot edit them (the insert schema omits altNames).
- `is_admin` lives on users and is re-checked from the DB on every admin request (not from the session snapshot), so flipping the flag affects live sessions immediately. The owner account is the only admin, granted in the startup migration block.
- Non-admins never receive archived entries — `includeArchived` is admin-gated server-side, not just hidden in the UI.

**Why:** owner-curated community dictionary; once adopted, a skill is the athlete's own data. These are spec decisions, not bugs to fix.

**How to apply:** any dictionary follow-up (offline mirroring, proposing new entries, suggestion notifications, seeding) must preserve copy-on-adopt and the accepted-suggestion-only altNames path.
