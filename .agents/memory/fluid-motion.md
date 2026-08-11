---
name: Fluid motion conventions
description: App-wide press feedback, vaul bottom sheets, overlay motion spec, and reduced-motion rules from the Apple fluid-interfaces pass.
---

The motion spec is the vendored skill at `docs/apple-design-skill.md`. Read it before changing how anything moves. Conventions that must survive future edits:

## Press feedback (.pressable)
- One shared utility in `index.css`; buttons inherit it via `buttonVariants`. Depth tunes per control with `[--press-scale:0.9x]` (small round controls deeper, big cards 0.99).
- It uses the **standalone `scale` property**, not `transform`. **Why:** call sites combine it with `hover:scale-*` and centering translates; a transform-based press would override those. Never "simplify" it to `transform: scale(...)`.
- iOS only applies `:active` while a finger is down because `main.tsx` registers a no-op passive `touchstart` listener. Removing it silently kills all press feedback on iPhones.
- Don't reintroduce ad-hoc `active:scale-*` classes; grep stays clean — use `.pressable`.

## Bottom sheets (vaul)
- `ui/drawer.tsx` overlay+content are `z-[70]` — a deliberate exception to "bottom nav (z-60) beats popovers": a sheet rises from the bottom edge, so the nav must go under its scrim.
- `shouldScaleBackground` must stay `false`. **Why:** html/body are fixed and `#root` scrolls; transforming the wrapper creates a containing block that breaks the fixed bottom nav.
- Adaptive presentation via `useBottomSheet()` = `isMobile && !prefersReducedMotion`. Reduced-motion users get the centered dialog on purpose — its cross-fade IS the §14 fallback for the sheet spring.

## Centered dialog reduced-motion pitfall
- Dialog/alert-dialog content centers with translate utilities, but tailwindcss-animate's slide vars participate in the same keyframe transform. Under `motion-reduce:` the slide vars must be set to exactly `-1/2` (`slide-in-from-top-1/2` etc.), **never removed**, or the enter/exit keyframes drop the centering translate and the dialog jumps to the corner.

## Overlay motion spec
- Dialogs 200ms in / 150ms out; popovers/dropdowns/selects 150/100; all `ease-out`, zoom under `motion-safe:`, fades always, no 2px slides on popper surfaces (origin-anchored zoom is the §7 trigger anchoring).
- `duration-*`/`ease-*` utilities drive BOTH transitions and Radix animations (tailwindcss-animate re-emits them as animation-duration/timing) — that's why exit speed is set with `data-[state=closed]:duration-*`.
- Glass surfaces materialize with `.animate-materialize` (blur+scale+fade together) + an `origin-*` class anchored at the trigger.

## Verification
- `e2e/motion-smoke.mjs` asserts the adaptive sheet/dialog behavior (mobile sheet, desktop dialog, reduced-motion swap) — run it after touching this layer.
