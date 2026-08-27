---
name: Radix portaled menu clicks bubble to ancestor onClick
description: Why Edit/Delete in a card's ⋮ menu can trigger the card's own onClick, and the fix.
---

A clickable card (e.g. session cards on the Execution / ToF trackers) that also holds a Radix `DropdownMenu` will fire the **card's** `onClick` when the user taps a menu item like Edit or Delete — the menu appears to "open the card" instead of running its action.

**Why:** Radix renders `DropdownMenuContent` in a portal (attached to `document.body`), so in the *DOM* it is not a descendant of the card. But React's synthetic event system bubbles along the **React component tree**, not the DOM tree — and in the React tree the menu content *is* rendered inside the card. So the click bubbles up to the card's `onClick` (navigate/open) after the menu item handler runs.

**How to apply:** Any card that is itself clickable *and* contains a Radix menu/dialog/popover in a portal must stop propagation at the portaled content: `<DropdownMenuContent onClick={e => e.stopPropagation()}>`. Putting `stopPropagation` only on the trigger button is not enough — the items live in the portal. Most card menus in this repo (skills, routines, score, points-to-fix) already do this via a `stopPropagation` on the trigger's `TableCell`/wrapper or the content; if a new clickable-card + menu combo misbehaves, this is the first thing to check. The same reasoning applies to Radix Popover/Dialog content rendered inside a clickable ancestor.
