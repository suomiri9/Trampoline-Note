---
name: Theme toggle (light/dark)
description: How light/dark theming is wired in the Trampoline app and the constraints that keep dark the default and flash-free
---

- Dark is the DEFAULT and must stay visually identical to the original near-black theme for any user with no stored preference. Light is opt-in (`localStorage.theme === 'light'`).
  - **Why:** the app shipped dark-only; adding light must not regress existing users' look.
- Implemented as a tiny store + hook (`client/src/lib/theme.ts` + `client/src/hooks/use-theme.ts`) mirroring the offline-mode / archive-cascade pattern — NOT a React context provider. Keep that consistency if you extend theming.
- **Flash-avoidance contract (three places must agree):** `<html class="dark">` in `client/index.html` (no-JS default), the inline `<script>` in `client/index.html` (applies stored theme pre-paint), and `theme.ts` defaults (re-applied in `main.tsx`). If you change the default theme OR the background hexes (`#0a0b10` dark / `#f4f6f9` light), update all three in lockstep or a first-paint flash returns.
  - **How to apply:** any change to default/bg/persistence key touches all three; don't "fix" one in isolation.
- **CSS contract:** in `client/src/index.css`, `:root` is the LIGHT palette and `.dark` is dark. Helper classes (`.card-3d`, `.glass-surface`, `.bg-mesh`) have a light base + a `.dark` override; the original dark box-shadows/gradients live in the `.dark` override (moved out of the base). When adding a new "3d"/glass helper, give it both a light base and a `.dark` override or it will look wrong in one mode.
