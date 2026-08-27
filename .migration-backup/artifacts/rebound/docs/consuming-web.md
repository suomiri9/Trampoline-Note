# Consuming Rebound Design System in web apps

Read `artifacts/rebound/docs/AGENTS.md` first. This guide covers
React/Vite and other shadcn/Tailwind web consumers. If the app already contains
a local theme or component library, also read
`artifacts/rebound/docs/migrating-web.md` before writing UI.

## Theme

Import this package's theme once from the app's main CSS:

```css
@import "@workspace/rebound/styles.css";
```

`styles.css` already imports Tailwind, its plugins, and this package's token
theme. It also registers this package's component sources. Do not add a separate
Tailwind import or a `node_modules` source path in a Tailwind v4 consumer.
Tailwind v3 consumers keep their existing `@tailwind` directives and add
`node_modules/@workspace/rebound/src/components` to `content`.

### Fonts and color mode

Rebound is a single-face system: load Inter in the consumer's HTML. Monospace
is intentionally banned — `--font-mono` resolves to Inter; never add a mono
face back.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap">
```

Dark is the canonical mode: boot with `class="dark"` on `<html>` (set before
first paint to avoid a flash) and treat light as the secondary theme.

## Components and helpers

Import every provided primitive, `cn`, and toast API directly from this package:

```tsx
import { Button } from "@workspace/rebound/components/ui/button";
import { cn } from "@workspace/rebound/lib/utils";
import {
  toast,
  useToast,
} from "@workspace/rebound/hooks/use-toast";
```

Use the package component whenever it provides the required family. Keep
product-specific compositions in the app, but compose them from package
primitives rather than recreating those primitives locally.

The packaged `Toaster` and toast hook share one in-memory store. Do not call a
local toast hook while rendering the packaged `Toaster`.

## Language layer

`styles.css` ships Trampoline Note's signature utilities alongside the tokens
(see the Brand/Layout/Motion pages of the preview for live examples):

- Type voice: `.eyebrow`, `.micro-label`, `.eyebrow-compact`, `.page-title`,
  `.font-mono-meta` (meta text without a mono face).
- Gradient ink: `.text-gradient-primary`, `.text-gradient-gold`,
  `.text-gradient-page`.
- Surfaces: `.panel-hairline` (+ `.panel-hairline-hover`; `.card-3d` /
  `.card-3d-hover` are legacy app aliases), `.glass-surface`, `.sheet-material`,
  `.bg-mesh`, `.bg-gradient-cta`, `.btn-3d`.
- Motion: `--ease-out-strong`, `--ease-in-out-strong`, `--ease-drawer` (also
  usable as Tailwind `ease-*` utilities), `.pressable` (scale via
  `--press-scale`), `.animate-fade-in-up`, `.animate-materialize`,
  `.animate-morph-blur`, `.stagger-1..5`; spinners run at 0.65s.
- Per-page accents: set `data-page-accent="score|progress|skills|routines|recovery|coach|timer|execution"`
  (or the matching `.page-accent-*` class) on a page container;
  `.text-gradient-page`, `.bg-mesh`, and any `hsl(var(--page-accent))` usage
  recolor automatically. Home keeps the default primary/indigo pair.
- Small helpers: `.no-scrollbar` (hidden scrollbars on swipe rows) and a Sonner
  override so toasts exit faster than they enter.
- Interaction rules: hover styles are gated to real pointers (press feedback is
  the touch affordance). In new work, transition only named properties
  (transform, opacity, color…) rather than `transition-all`; some scaffolded
  shadcn components still carry stock `transition-all` and may be tightened as
  they are touched.

## Verify

After wiring the workspace dependency, import and render
`@workspace/rebound/components/ui/button`. Run the app's typecheck
and dev server. The import must resolve and the Button must use this package's
theme before broader UI work begins.

## Ongoing rules

- Keep one source of theme variables.
- Import package-provided primitives and helpers from the package path.
- Add reusable product-agnostic components to this package first.
- For a non-shadcn app, use the tokens as the source of truth and adapt existing
  components to the token CSS variables without copying token values.
