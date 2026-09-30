import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { BarChart3, Check, X } from "lucide-react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import type { ExecutionSession, Routine, Skill, TofSession } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  alignAttemptProfiles, buildAttemptProfiles,
  type AttemptProfile, type ComparisonTracker,
} from "@/lib/tracker-comparison";

const COLORS = ["#f59e0b", "#38bdf8", "#a78bfa", "#34d399", "#fb7185", "#facc15", "#818cf8", "#2dd4bf", "#f472b6", "#fb923c"];

function dateLabel(date: string) {
  try {
    return format(parseISO(date), "MMM d, yyyy");
  } catch {
    return date;
  }
}

function totalLabel(profile: AttemptProfile, tracker: ComparisonTracker) {
  return tracker === "tof"
    ? `${profile.total.toFixed(2)} s ${profile.values.some(value => value == null) ? "recorded ToF" : "total ToF"}`
    : `${profile.total.toFixed(1)} pts total deductions${profile.landingRecorded ? " (incl. landing)" : " (landing not recorded)"}`;
}

export function TrackerComparison({
  tracker, sessions, routines, allSkills,
}: {
  tracker: ComparisonTracker;
  sessions: TofSession[] | ExecutionSession[] | undefined;
  routines: Routine[] | undefined;
  allSkills: Skill[] | undefined;
}) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const attempts = useMemo(
    () => tracker === "tof"
      ? buildAttemptProfiles("tof", sessions as TofSession[] | undefined, routines, allSkills)
      : buildAttemptProfiles("execution", sessions as ExecutionSession[] | undefined, routines, allSkills),
    [tracker, sessions, routines, allSkills],
  );
  const selected = selectedKeys.flatMap(key => {
    const attempt = attempts.find(row => row.key === key);
    return attempt ? [attempt] : [];
  });
  const chartData = useMemo(() => alignAttemptProfiles(selected), [attempts, selectedKeys]);
  const unit = tracker === "tof" ? "seconds" : "deduction points";
  const toggle = (key: string) => setSelectedKeys(current =>
    current.includes(key) ? current.filter(item => item !== key) : [...current, key],
  );

  return (
    <div className="space-y-4" data-testid={`tracker-comparison-${tracker}`}>
      <section className="rounded-2xl border border-border/15 bg-white/[0.02] p-4 sm:p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-9 w-9 shrink-0 rounded-xl bg-[hsl(var(--page-accent)/0.12)] border border-[hsl(var(--page-accent)/0.22)] flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-[hsl(var(--page-accent))]" />
          </div>
          <div>
            <h2 className="font-semibold text-base">Compare attempts</h2>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              Select recorded attempts to overlay their jump-by-jump profiles. Each line is one attempt, not a daily average.
            </p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Tracker attempts store a date, but no time of day.</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/65">
            Recorded attempts · {attempts.length}
          </h3>
          {selected.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setSelectedKeys([])} data-testid={`button-clear-comparison-${tracker}`}>
              Clear
            </Button>
          )}
        </div>
        {attempts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.1] px-4 py-6 text-center text-sm text-muted-foreground" data-testid={`empty-comparison-data-${tracker}`}>
            No attempts with recorded per-jump {unit} yet. Record an attempt in the {tracker === "tof" ? "ToF" : "Execution"} tracker to compare it here.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-0.5" data-testid={`picker-comparison-${tracker}`}>
            {attempts.map(attempt => {
              const index = selected.findIndex(item => item.key === attempt.key);
              return (
                <button
                  key={attempt.key}
                  type="button"
                  onClick={() => toggle(attempt.key)}
                  aria-pressed={index !== -1}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors min-w-0",
                    index !== -1 ? "border-[hsl(var(--page-accent)/0.38)] bg-[hsl(var(--page-accent)/0.1)]" : "border-white/[0.08] bg-white/[0.015] hover:bg-white/[0.05]",
                  )}
                  data-testid={`option-comparison-attempt-${attempt.key}`}
                >
                  <span className="h-4 w-4 shrink-0 rounded border flex items-center justify-center" style={index !== -1 ? { backgroundColor: COLORS[index % COLORS.length], borderColor: COLORS[index % COLORS.length] } : undefined}>
                    {index !== -1 && <Check className="h-3 w-3 text-background" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate">{attempt.label}</span>
                    <span className="block text-[11px] text-muted-foreground/70">{dateLabel(attempt.date)} · {totalLabel(attempt, tracker)}</span>
                    <span className="block text-[10px] text-muted-foreground/55">{attempt.values.filter(v => v != null).length} recorded jumps · attempt #{attempt.key.split(":")[1]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selected.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.1] px-5 py-14 text-center" data-testid={`empty-comparison-${tracker}`}>
          <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground/35 mb-3" />
          <h2 className="font-semibold">Nothing to compare yet.</h2>
          <p className="text-sm text-muted-foreground/65 mt-1">Select two attempts to compare, or one to inspect its profile.</p>
        </div>
      ) : (
        <section className="rounded-2xl border border-border/15 bg-white/[0.02] p-4 sm:p-5" data-testid={`chart-comparison-${tracker}`}>
          <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/65">
            {tracker === "tof" ? "Time of flight per jump" : "Execution deduction per jump"}
          </h2>
          <p className="text-xs text-muted-foreground/65 mt-1 mb-5">Jump position 1–10 · {unit} · straight lines and recorded dots</p>
          <div className="h-64 sm:h-72 w-full" data-testid={`plot-comparison-${tracker}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.45)" />
                <XAxis dataKey="jump" type="number" domain={[1, 10]} ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]} allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} label={{ value: "Jump position", position: "insideBottom", offset: -10, fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis type="number" domain={["auto", "auto"]} width={48} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => v.toFixed(tracker === "tof" ? 2 : 1)} label={{ value: tracker === "tof" ? "Seconds" : "Points", angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }}
                  labelFormatter={label => `Jump ${label}`}
                  formatter={(value: number, _name: string, entry: { dataKey?: string | number }) => {
                    const attempt = selected.find(item => item.key === entry.dataKey);
                    return [`${value.toFixed(tracker === "tof" ? 3 : 1)} ${tracker === "tof" ? "s" : "pts"}`, attempt ? `${attempt.label} · ${dateLabel(attempt.date)} · #${attempt.key.split(":")[1]}` : ""];
                  }}
                />
                {selected.map((attempt, index) => (
                  <Line key={attempt.key} type="linear" dataKey={attempt.key} name={attempt.label} stroke={COLORS[index % COLORS.length]} strokeWidth={2.5} connectNulls={false} dot={{ r: 4, fill: COLORS[index % COLORS.length], strokeWidth: 0 }} activeDot={{ r: 8, strokeWidth: 2 }} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-muted-foreground/65 mt-3">
            Missing jump positions stay blank, not zero. {tracker === "execution" && "Landing deductions are included in totals when recorded, but are not plotted as a jump."}
          </p>
          <div className="mt-4 divide-y divide-border/20" data-testid={`selected-comparison-${tracker}`}>
            {selected.map((attempt, index) => (
              <div key={attempt.key} className="flex items-center gap-3 py-3 text-sm" data-testid={`row-comparison-${attempt.key}`}>
                <span className="h-3 w-3 rounded-full shrink-0" style={{ background: COLORS[index % COLORS.length] }} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{attempt.label} <span className="text-xs font-normal text-muted-foreground">· #{attempt.key.split(":")[1]}</span></div>
                  <div className="text-xs text-muted-foreground">{dateLabel(attempt.date)} · {totalLabel(attempt, tracker)}</div>
                </div>
                <button type="button" onClick={() => toggle(attempt.key)} aria-label={`Remove ${attempt.label} attempt #${attempt.key.split(":")[1]}`} className="p-2 rounded-lg hover:bg-white/[0.08] pressable" data-testid={`button-remove-comparison-${attempt.key}`}><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}