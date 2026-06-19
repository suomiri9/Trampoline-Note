---
name: SkillEditorOverlay top-anchoring
description: Why the note-dialog skill/connection/routine editor overlay is top-anchored, not vertically centered.
---

The `SkillEditorOverlay` popups in `note-dialog.tsx` (connection editor + routine/FC editor) use `flex items-start` on their outer fixed container, NOT `items-center`.

**Why:** the panel is content-sized (`max-h-full`, height follows the row count). When it was vertically centered, deleting a skill row shrank the panel and re-centered it, shifting every remaining row by ~half a row height. That slid the next ✕ button out from under the cursor, so you couldn't delete several skills by clicking the same spot — you had to re-aim after each delete.

**How to apply:** keep these overlays top-anchored. With the top fixed, deleting a row keeps the header + rows above it still and shifts the rows below up by exactly one row height, landing the next ✕ under the cursor for rapid in-place multi-delete. Do not "fix" it back to `items-center`. (The score.tsx usages are different — they're `absolute inset-0` with a parent-fixed height, so they never had this problem.)
