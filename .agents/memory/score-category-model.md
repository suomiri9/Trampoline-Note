---
name: Score category follows routine tags
description: The score form has NO category dropdown by user decree — category derives from the picked routine's Set/Vol tag; builder tag is mandatory.
---

**Rule:** A score's category (set / vol / both / vol_vol) is derived, not chosen:
- Picking a tagged routine in the main slot sets it (single modes → tag; two-routine modes → both for set, vol_vol for vol).
- One vs two routines is an explicit "Add second routine" / "Remove" toggle, not a dropdown option.
- A small segmented fallback control appears ONLY when the main slot has no tag to read (no routine, or an untagged legacy/archived one). Sheet-photo flow mirrors the same rules off row 0.
- The routine builder's Set/Voluntary choice is mandatory in the UI; the server schema stays nullable on purpose (legacy rows, queued offline creates from older clients, coach-created routines).

**Why:** The user explicitly ordered the visible Category picker deleted ("just delete category choosing thing and make the routine maker's choosing not optional") after first asking whether it was still needed. This supersedes the earlier "dropdown stays for structure" compromise.

**How to apply:** Don't reintroduce a category picker on score entry surfaces; extend the derive-from-tag model instead (the execution tracker's select-exec-category / select-exec-photo-category selects were still undecided at time of writing). Untagged prod routines rely on the fallback until the user re-saves them with a tag.
