import { ChevronRight } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Progress } from '../../components/ui/progress';
import { Stack } from '../parts';

export function AppliedDemo() {
  return (
    <div className="space-y-10">
      <Stack label="Session summary — composed only from tokens, utilities, and components">
        <div className="mx-auto w-full max-w-sm">
          <div className="panel-hairline overflow-hidden">
            {/* Header: mesh glow + kicker + display title + hero figure */}
            <div className="bg-mesh space-y-3 p-5">
              <div className="flex items-center justify-between">
                <p className="eyebrow">Tue 18 Aug · Evening</p>
                <Badge variant="outline" className="eyebrow-compact micro-label border-border/60">
                  Synced
                </Badge>
              </div>
              <div>
                <h2 className="page-title text-3xl">Evening session</h2>
                <p className="text-gradient-primary mt-2 text-5xl font-extrabold tracking-tight tabular-nums">
                  14.2
                </p>
                <p className="eyebrow eyebrow-compact mt-1">Total difficulty</p>
              </div>
            </div>

            {/* Stat strip: hairline-divided, tabular figures */}
            <div className="grid grid-cols-3 divide-x divide-border/60 border-y border-border/60 text-center">
              {[
                ['6', 'Routines'],
                ['48', 'Skills'],
                ['16.4s', 'Flight'],
              ].map(([value, label]) => (
                <div key={label} className="px-2 py-4">
                  <p className="text-xl font-semibold tabular-nums">{value}</p>
                  <p className="eyebrow eyebrow-compact mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Routine row: interactive panel + skill codes + progress */}
            <div className="space-y-4 p-5">
              <button
                type="button"
                className="panel-hairline panel-hairline-hover pressable block w-full space-y-3 p-4 text-left"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Competition routine</p>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {['40/', '41o', '803<', '811<', '822/'].map((code) => (
                    <Badge
                      key={code}
                      variant="outline"
                      className="font-mono-meta border-border/60 normal-case"
                    >
                      {code}
                    </Badge>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Completed</span>
                    <span className="tabular-nums">8 / 10</span>
                  </div>
                  <Progress value={80} className="h-1.5" />
                </div>
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="bg-gradient-cta btn-3d pressable flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Log routine
                </button>
                <Button variant="ghost">Details</Button>
              </div>
            </div>
          </div>
        </div>
      </Stack>

      <Stack label="What this demonstrates">
        <div className="panel-hairline p-6 text-sm leading-relaxed text-muted-foreground">
          Pure-black ground with hairline panels; one gradient hero figure; eyebrow
          kickers captioning tabular stats; skill codes as normal-case outline
          badges in the sans stack; a single gradient CTA with press feedback.
          Every value comes from tokens — nothing here is hand-picked.
        </div>
      </Stack>
    </div>
  );
}
