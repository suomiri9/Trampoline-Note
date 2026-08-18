import { Badge } from '../../components/ui/badge';
import { Guidelines, Stack } from '../parts';

export function IdentityDemo() {
  return (
    <div className="space-y-10">
      <Stack label="Display voice">
        <div className="panel-hairline space-y-3 p-6">
          <p className="eyebrow">Tuesday · Trampoline</p>
          <h2 className="page-title text-4xl">Evening session</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            One face, many weights: Inter carries everything from 10px kickers
            to hero figures. Headlines run 800 with -0.045em tracking.
          </p>
        </div>
      </Stack>

      <Stack label="Micro-labels — the metadata voice">
        <div className="panel-hairline flex flex-wrap items-center gap-6 p-6">
          <span className="eyebrow">Eyebrow kicker</span>
          <span className="micro-label text-foreground">Micro label</span>
          <span className="eyebrow eyebrow-compact">Compact 0.12em</span>
          <span className="font-mono-meta text-sm text-muted-foreground">
            meta-2026-08-18
          </span>
        </div>
      </Stack>

      <Stack label="Gradient ink">
        <div className="panel-hairline flex flex-wrap items-end gap-8 p-6">
          <div>
            <p className="eyebrow">Primary → indigo</p>
            <p className="text-gradient-primary mt-1 text-4xl font-extrabold tracking-tight">
              14.2 DD
            </p>
          </div>
          <div>
            <p className="eyebrow">Gold — records only</p>
            <p className="text-gradient-gold mt-1 text-4xl font-extrabold tracking-tight">
              Personal best
            </p>
          </div>
          <div data-page-accent="progress">
            <p className="eyebrow">Page accent pair</p>
            <p className="text-gradient-page mt-1 text-4xl font-extrabold tracking-tight">
              +12% this week
            </p>
          </div>
        </div>
      </Stack>

      <Stack label="Figures — tabular, semibold">
        <div className="panel-hairline grid grid-cols-3 divide-x divide-border/60 p-0 text-center">
          {[
            ['Routines', '6'],
            ['Total DD', '14.2'],
            ['Best score', '24.35'],
          ].map(([label, value]) => (
            <div key={label} className="space-y-1 px-4 py-5">
              <p className="text-2xl font-semibold tabular-nums">{value}</p>
              <p className="eyebrow eyebrow-compact">{label}</p>
            </div>
          ))}
        </div>
      </Stack>

      <Stack label="Codes render in the sans stack">
        <div className="flex flex-wrap gap-2">
          {['40/', '41o', '803<', '811<'].map((code) => (
            <Badge key={code} variant="outline" className="font-mono-meta normal-case">
              {code}
            </Badge>
          ))}
        </div>
      </Stack>

      <Guidelines
        items={[
          { kind: 'do', text: 'Use eyebrow kickers to open sections and caption stats.' },
          { kind: 'do', text: 'Reserve gradient ink for hero figures and one key number per view.' },
          { kind: 'do', text: 'Set numeric data in tabular-nums so columns stay aligned.' },
          { kind: 'dont', text: 'Reintroduce a monospace face — font-mono intentionally resolves to Inter.' },
          { kind: 'dont', text: 'Use gold outside records and celebration moments.' },
        ]}
      />
    </div>
  );
}
