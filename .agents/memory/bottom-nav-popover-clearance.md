---
name: Bottom nav overlays popovers
description: Floating bottom nav strip (z-[60]) paints over Radix popper layers (z-50); dropdown tails end up hidden and unscrollable unless collision padding reserves the nav zone.
---

**Rule:** Any Radix popper content (Select, DropdownMenu, and if reported: Popover, Tooltip, ContextMenu) must pass `collisionPadding` with `bottom: bottomNavClearance()` (helper in `client/src/lib/utils.ts`, measures `[data-bottom-nav]` top vs viewport height, so it includes the iOS safe area). Select and DropdownMenu UI wrappers already default to this.

**Why:** The floating nav+coach strip is `fixed ... z-[60]` while shadcn popover layers are `z-50` — the strip paints on top even over dialogs. Popper collision detection only avoids the viewport edge, so a bottom-anchored dropdown legitimately positions its tail under the strip; its internal scroll limit sits in the hidden zone, so the last options can never be seen (user-reported with the tracker target picker).

**How to apply:** Prefer reserving space (collisionPadding) over raising the content's z-index above 60 — covering the nav looks broken and puts the last items in the iOS home-indicator zone. With padding, Radix's `--radix-*-available-height` shrinks accordingly and the content flips to open upward when below-space runs out. Don't hardcode the clearance: strip height varies with safe-area insets.
