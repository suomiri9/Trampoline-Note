import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Spinner } from '../../components/ui/spinner';
import { Guidelines, Stack } from '../parts';

const EASINGS = [
  ['--ease-out-strong', 'cubic-bezier(0.23, 1, 0.32, 1)', 'Entrances, hovers, presses. The default.'],
  ['--ease-in-out-strong', 'cubic-bezier(0.77, 0, 0.175, 1)', 'Morphs and moves that start and end on screen.'],
  ['--ease-drawer', 'cubic-bezier(0.32, 0.72, 0, 1)', 'Bottom sheets and drawers (iOS feel).'],
] as const;

export function MotionDemo() {
  const [runId, setRunId] = useState(0);

  return (
    <div className="space-y-10">
      <Stack label="Easing vocabulary">
        <div className="panel-hairline divide-y divide-border/60">
          {EASINGS.map(([token, curve, use]) => (
            <div key={token} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
              <code className="font-mono-meta w-48 shrink-0 text-sm text-foreground">{token}</code>
              <code className="font-mono-meta w-64 shrink-0 text-xs text-muted-foreground">{curve}</code>
              <p className="text-sm text-muted-foreground">{use}</p>
            </div>
          ))}
        </div>
      </Stack>

      <Stack label="Entrances">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setRunId((id) => id + 1)}>
            <RotateCcw /> Replay
          </Button>
          <span className="text-xs text-muted-foreground">
            All entrances use --ease-out-strong and settle within 500ms.
          </span>
        </div>
        <div key={runId} className="grid gap-3 sm:grid-cols-3">
          <div className="panel-hairline animate-fade-in-up space-y-1 p-5">
            <p className="eyebrow">fade-in-up</p>
            <p className="text-sm text-muted-foreground">400ms · lists, cards</p>
          </div>
          <div className="panel-hairline animate-materialize space-y-1 p-5">
            <p className="eyebrow">materialize</p>
            <p className="text-sm text-muted-foreground">500ms · hero stats</p>
          </div>
          <div className="panel-hairline animate-morph-blur space-y-1 p-5">
            <p className="eyebrow">morph-blur</p>
            <p className="text-sm text-muted-foreground">450ms · view swaps</p>
          </div>
        </div>
      </Stack>

      <Stack label="Stagger — 50ms steps">
        <div key={`stagger-${runId}`} className="space-y-2">
          {[1, 2, 3, 4, 5].map((step) => (
            <div
              key={step}
              className={`panel-hairline animate-fade-in-up stagger-${step} flex items-center justify-between px-4 py-2.5`}
            >
              <span className="text-sm">Routine {step}</span>
              <span className="eyebrow eyebrow-compact">{step * 50}ms</span>
            </div>
          ))}
        </div>
      </Stack>

      <Stack label="Press feedback">
        <div className="flex flex-wrap items-center gap-3">
          <Button className="pressable">pressable · 0.97</Button>
          <button
            type="button"
            className="panel-hairline pressable px-4 py-2 text-sm"
            style={{ ['--press-scale' as string]: '0.94' }}
          >
            custom --press-scale 0.94
          </button>
          <span className="pressable inline-flex cursor-pointer select-none items-center rounded-full border border-border/60 px-3 py-1 text-xs">
            chip
          </span>
        </div>
      </Stack>

      <Stack label="Spinner — 0.65s">
        <div className="flex items-center gap-3">
          <Spinner />
          <span className="text-sm text-muted-foreground">
            Faster than stock so waits feel shorter.
          </span>
        </div>
      </Stack>

      <Guidelines
        items={[
          { kind: 'do', text: 'Animate transform and opacity; name the properties you transition.' },
          { kind: 'do', text: 'Give every tappable element press feedback (pressable or active-elevate).' },
          { kind: 'do', text: 'Exit faster than you enter — dialogs 200/150ms, poppers 150/100ms.' },
          { kind: 'dont', text: 'Use transition-all, or hover effects on touch devices.' },
          { kind: 'dont', text: 'Exceed 500ms for UI motion — that pace belongs to celebrations only.' },
        ]}
      />
    </div>
  );
}
