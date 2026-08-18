import { Guidelines, Stack } from '../parts';

const ACCENTS: Array<{ key: string | null; label: string; sample: string }> = [
  { key: null, label: 'Home · default', sample: '14.2' },
  { key: 'score', label: 'Score', sample: '24.35' },
  { key: 'progress', label: 'Progress', sample: '+12%' },
  { key: 'skills', label: 'Skills', sample: '803<' },
  { key: 'routines', label: 'Routines', sample: '10/10' },
  { key: 'recovery', label: 'Recovery', sample: '67%' },
  { key: 'coach', label: 'Coach', sample: 'Q&A' },
  { key: 'timer', label: 'Time of flight', sample: '16.4s' },
  { key: 'execution', label: 'Execution', sample: '8.6' },
];

export function PageAccentsDemo() {
  return (
    <div className="space-y-10">
      <Stack label="One accent pair per product area">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ACCENTS.map(({ key, label, sample }) => (
            <div
              key={label}
              {...(key ? { 'data-page-accent': key } : {})}
              className="panel-hairline bg-mesh space-y-2 p-5"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: 'hsl(var(--page-accent))' }}
                />
                <p className="eyebrow eyebrow-compact">{label}</p>
              </div>
              <p className="text-gradient-page text-3xl font-extrabold tracking-tight">
                {sample}
              </p>
            </div>
          ))}
        </div>
      </Stack>

      <Stack label="How it works">
        <div className="panel-hairline p-6 text-sm leading-relaxed text-muted-foreground">
          Setting <code className="font-mono-meta text-foreground">data-page-accent</code>{' '}
          (or a <code className="font-mono-meta text-foreground">.page-accent-*</code>{' '}
          class) on any container overrides the{' '}
          <code className="font-mono-meta text-foreground">--page-accent</code> /{' '}
          <code className="font-mono-meta text-foreground">--page-accent-2</code> pair.
          Everything downstream — <code className="font-mono-meta text-foreground">.text-gradient-page</code>,{' '}
          <code className="font-mono-meta text-foreground">.bg-mesh</code>, dots, glows —
          recolors automatically. The rest of the palette never changes.
        </div>
      </Stack>

      <Guidelines
        items={[
          { kind: 'do', text: 'Give each top-level page exactly one accent pair and keep it stable.' },
          { kind: 'do', text: 'Let the accent surface in kickers, hero figures, and ambient glows.' },
          { kind: 'dont', text: 'Recolor buttons, links, or semantic states with the page accent — those stay on primary/destructive tokens.' },
          { kind: 'dont', text: 'Mix two accent pairs in one view.' },
        ]}
      />
    </div>
  );
}
