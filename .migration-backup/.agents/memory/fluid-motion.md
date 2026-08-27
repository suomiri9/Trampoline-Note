---
name: Fluid motion conventions
description: App-wide press feedback, vaul bottom sheets, overlay motion spec, strong-easing/polish rules (emil-design-eng), and reduced-motion rules.
---

The motion specs are the vendored skill at `docs/apple-design-skill.md` PLUS Emil Kowalski's design-engineering skill at `.agents/skills/emil-design-eng/SKILL.md` (installed via the skills CLI — it ran fine on Node 20 despite claiming to want 22). Read both before changing how anything moves. Conventions that must survive future edits:

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
- Dialogs 200ms in / 150ms out; popovers/dropdowns/selects/tooltips 150/100; all on `ease-out-strong`, zoom under `motion-safe:`, fades always, no 2px slides on popper surfaces (origin-anchored zoom is the §7 trigger anchoring).
- `duration-*`/`ease-*` utilities drive BOTH transitions and Radix animations (tailwindcss-animate re-emits them as animation-duration/timing) — that's why exit speed is set with `data-[state=closed]:duration-*` and why the custom easing utilities work on animated overlays.
- Glass surfaces materialize with `.animate-materialize` (blur+scale+fade together) + an `origin-*` class anchored at the trigger.

## Strong easing & polish layer (emil-design-eng)
- Easing tokens live in `index.css :root` (`--ease-out-strong`, `--ease-in-out-strong`, `--ease-drawer`) and are registered in `tailwind.config.ts` as `ease-out-strong` / `ease-in-out-strong` / `ease-drawer`. New motion uses these, not bare keywords; never `ease-in`.
- `transition-all` is banned — name exact properties. Grep stays clean app-wide.
- Hover only for real pointers: `future.hoverOnlyWhenSupported` in tailwind.config.ts gates every `hover:` utility, and raw CSS `:hover` rules in index.css (card-3d-hover, btn-3d, btn-gold, hover-elevate) sit inside `@media (hover: hover) and (pointer: fine)`. Press feedback (`:active`, `.pressable`) stays ungated — that IS the touch feedback. New raw `:hover` rules must go inside the gate.
- Toasts are **Sonner** (`ui/toaster.tsx`; adapter in `hooks/use-toast.ts` keeps the shadcn `toast({ title, description, variant })` API). Top-center on phones (clear of bottom nav, under notch), bottom-right on desktop (offset above nav). Exit-faster-than-enter + reduced-motion instant fades are index.css overrides on `[data-sonner-toast]`. Don't reintroduce the Radix toast layer (package was removed).
- Tooltips: app-wide provider `delayDuration={400} skipDelayDuration={500}`; `data-[state=instant-open]:animate-none` makes subsequent tooltips appear instantly (skip delay AND animation).
- In-place button morphs (label ⇄ spinner) use `.animate-morph-blur` on a wrapper keyed by the pending state.
- List staggers: 50ms steps (`.stagger-*`), 250ms entry — decorative only, rows interactive from first frame. Spinner: Tailwind `spin` overridden to 0.65s in config.

## Verification
- `e2e/motion-smoke.mjs` asserts the adaptive sheet/dialog behavior (mobile sheet, desktop dialog, reduced-motion swap) plus the emil tokens (strong ease var, pressable timing, 0.65s spinner, Sonner top-edge toast on mobile) — run it after touching this layer. Chromium LD path recipe: see `local-headless-e2e.md`.
