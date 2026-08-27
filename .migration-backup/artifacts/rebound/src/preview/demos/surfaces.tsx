import { Button } from '../../components/ui/button';
import { Guidelines, Stack } from '../parts';

export function SurfacesDemo() {
  return (
    <div className="space-y-10">
      <Stack label="Hairline panel — the default surface">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="panel-hairline space-y-1 p-5">
            <p className="eyebrow">panel-hairline</p>
            <p className="text-sm text-muted-foreground">
              Transparent fill, border at 60% strength. Sits flush on the pure-black
              ground; content, not chrome, makes the hierarchy.
            </p>
          </div>
          <div className="panel-hairline panel-hairline-hover space-y-1 p-5">
            <p className="eyebrow">panel-hairline-hover</p>
            <p className="text-sm text-muted-foreground">
              Interactive rows sharpen the border on hover (pointer devices only)
              and compress to 0.99 on press.
            </p>
          </div>
        </div>
      </Stack>

      <Stack label="Frosted chrome">
        <div className="panel-hairline relative overflow-hidden">
          <div className="bg-mesh space-y-2 p-6 pb-20" data-page-accent="score">
            <p className="eyebrow">Content scrolls beneath</p>
            <p className="text-gradient-page text-3xl font-extrabold tracking-tight">
              24.35
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              bg-mesh paints an ambient glow from the page-accent pair. Keep it at
              the page level, never inside cards.
            </p>
          </div>
          <div className="glass-surface absolute inset-x-3 bottom-3 flex items-center justify-between rounded-xl px-4 py-3">
            <span className="text-sm font-medium">glass-surface header/nav</span>
            <span className="eyebrow eyebrow-compact">blur 20 · sat 1.4</span>
          </div>
        </div>
      </Stack>

      <Stack label="Sheet material — bottom sheets and drawers">
        <div className="sheet-material rounded-2xl border border-border/50 p-5">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/40" />
          <p className="text-sm font-medium">Denser frost (blur 28 · sat 1.6)</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Falls back to solid popover color under reduced transparency.
          </p>
        </div>
      </Stack>

      <Stack label="CTA gradient">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="bg-gradient-cta btn-3d pressable rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
          >
            Log session
          </button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
      </Stack>

      <Guidelines
        items={[
          { kind: 'do', text: 'Default every grouped surface to the hairline panel; let the black ground breathe.' },
          { kind: 'do', text: 'Reserve filled card/popover colors for floating surfaces: menus, dialogs, sheets.' },
          { kind: 'do', text: 'Use exactly one gradient CTA per view.' },
          { kind: 'dont', text: 'Stack frosted surfaces on top of each other.' },
          { kind: 'dont', text: 'Add drop shadows to in-flow panels — elevation is for overlays.' },
        ]}
      />
    </div>
  );
}
