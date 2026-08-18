---
name: iOS keyboard vs fixed overlays
description: Why dialogs hid behind the on-screen keyboard and the contract every new overlay must follow (keyboard-inset vars).
---

On iOS/iPadOS (and Android with `interactive-widget=overlays-content`), the layout viewport NEVER shrinks for the on-screen keyboard — and this app additionally cancels Safari's focus auto-scroll in App.tsx to stop page jumps. Net effect: fixed overlays centered or bottom-anchored against the layout viewport can sit partly or FULLY behind the keyboard, with nothing revealing them.

**The rule:** all keyboard positioning goes through `client/src/lib/keyboard-inset.ts` (started once in main.tsx). It publishes `--kb-vvh` / `--kb-off` / `--kb-inset-b` + `html[data-kb-open]`, and reveals the focused field by scrolling ONLY inside the overlay.

**Why:** window/#root scrolling is owned by App.tsx's anti-jump restore — a second scroller fighting it re-introduces the jump bug. And Radix computes popper available-height from the layout viewport, so poppers need keyboard-aware collisionPadding (default in ui/popover.tsx).

**How to apply:** any NEW overlay type that can hold an input on phones must either carry `data-kb-aware` (DialogContent does automatically; index.css re-centers + caps it) or, if bottom-anchored, set `data-kb-anchor="bottom"` and anchor with `bottom: var(--kb-inset-b, 0px)` (see skills.tsx sheets). The keyboard max-height caps in index.css are `!important` on purpose — caller `max-h` utilities must never beat the visible strip. Keyboard state for JS/React: `useKeyboardInsetBottom()`.

Pinch-zoom is guarded via `visualViewport.scale`; occlusion under ~80px (chrome bars) is not treated as a keyboard.
