import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { BarChart3, Check, X } from "lucide-react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import type { ExecutionSession, RoutineWithVersions, Skill, TofSession } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useShowSkillNames } from "@/hooks/use-skill-label-mode";
import { cn } from "@/lib/utils";
import {
  alignAttemptProfiles, buildAttemptProfiles, jumpDifference, jumpSkillLabel,
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

function signedDifference(value: number, tracker: ComparisonTracker) {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(tracker === "tof" ? 3 : 1)} ${tracker === "tof" ? "s" : "pts"}`;
}

function ComparisonDot({
  cx, cy, payload, attempt, attemptIndex, profiles, tracker, showSkillNames, color,
}: {
  cx?: number;
  cy?: number;
  payload?: { jump: number };
  attempt: AttemptProfile;
  attemptIndex: number;
  profiles: AttemptProfile[];
  tracker: ComparisonTracker;
  showSkillNames: boolean;
  color: string;
}) {
  if (cx == null || cy == null || !payload) return null;
  const jumpIndex = payload.jump - 1;
  const skill = jumpSkillLabel(attempt.jumpSkills[jumpIndex], showSkillNames);
  const shortSkill = skill.length > 16 ? `${skill.slice(0, 15)}…` : skill;
  const difference = jumpDifference(profiles, attemptIndex, jumpIndex);
  // Alternate labels above and below their dots; each series gets its own lane.
  const above = attemptIndex % 2 === 0;
  const distance = 22 + Math.floor(attemptIndex / 2) * 37;
  const labelY = cy + (above ? -distance - 24 : distance);
  return (
    <g>
      <line x1={cx} y1={cy + (above ? -5 : 5)} x2={cx} y2={above ? labelY + 30 : labelY} stroke={color} strokeOpacity={0.55} />
      <circle cx={cx} cy={cy} r={4} fill={color} />
      <rect x={cx - 51} y={labelY} width={102} height={30} rx={5} fill="hsl(var(--background))" stroke={color} strokeOpacity={0.7} />
      <text x={cx} y={labelY + 12} textAnchor="middle" fontSize={10} fontWeight={600} fill="hsl(var(--foreground))">{shortSkill}</text>
      <text x={cx} y={labelY + 24} textAnchor="middle" fontSize={10} fontWeight={600} fill={color}>
        {attemptIndex === 0 ? "Baseline" : difference == null ? "No delta" : signedDifference(difference, tracker)}
      </text>
    </g>
  );
}

export function TrackerComparison({
  tracker, sessions, routines, allSkills,
}: {
  tracker: ComparisonTracker;
  sessions: TofSession[] | ExecutionSession[] | undefined;
  routines: RoutineWithVersions[] | undefined;
  allSkills: Skill[] | undefined;
}) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [showSkillNames] = useShowSkillNames();
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
  const labelMargin = 42 + Math.ceil(selected.length / 2) * 37;
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
                    <span className="block text-[10px] text-muted-foreground/55">{attempt.values.filter(v => v != null).length} recorded jumps · attempt #{attempt.key.split(":")[1]}{index === 0 ? " · Baseline" : ""}</span>
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
           <p className="text-xs text-muted-foreground/65 mt-1">
             Jump order 1–10 · {unit} · straight lines and recorded dots. Labels show each attempt's skill and its difference from the first selected attempt (compared − baseline).
             {tracker === "execution" && " A positive difference means more deductions, not an improvement."}
           </p>
           <p className="text-xs font-medium mt-2 mb-4" data-testid={`baseline-comparison-${tracker}`}>
             Baseline: {selected[0].label} · {dateLabel(selected[0].date)} · attempt #{selected[0].key.split(":")[1]}
           </p>
           <div className="w-full overflow-x-auto pb-2" data-testid={`plot-comparison-${tracker}`}>
             <div className="min-w-[1240px]" style={{ height: Math.max(380, 260 + labelMargin * 2) }}>
               <ResponsiveContainer width="100%" height="100%">
               <LineChart data={chartData} margin={{ top: labelMargin, right: 58, left: 50, bottom: labelMargin }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.45)" />
                 <XAxis dataKey="jump" type="number" domain={[1, 10]} ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]} allowDecimals={false} tickFormatter={(jump: number) => `Jump ${jump}`} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} label={{ value: "Jump order", position: "insideBottom", offset: -10, fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis type="number" domain={["auto", "auto"]} width={48} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => v.toFixed(tracker === "tof" ? 2 : 1)} label={{ value: tracker === "tof" ? "Seconds" : "Points", angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }}
                   labelFormatter={label => `Jump ${label}`}
                    formatter={(value: number, _name: string, entry: { dataKey?: string | number; payload?: { jump?: number } }) => {
                    const attempt = selected.find(item => item.key === entry.dataKey);
                     const jump = entry.payload?.jump;
                     const skill = attempt && jump != null ? jumpSkillLabel(attempt.jumpSkills[jump - 1], showSkillNames) : "Unknown skill";
                      const index = selected.findIndex(item => item.key === entry.dataKey);
                      const delta = jump != null ? jumpDifference(selected, index, jump - 1) : null;
                      return [`${value.toFixed(tracker === "tof" ? 3 : 1)} ${tracker === "tof" ? "s" : "pts"}`, attempt ? `${attempt.label} · ${dateLabel(attempt.date)} · #${attempt.key.split(":")[1]} · ${skill} · ${index === 0 ? "Baseline" : delta == null ? "No delta" : signedDifference(delta, tracker)}` : skill];
                  }}
                />
                {selected.map((attempt, index) => (
                   <Line key={attempt.key} type="linear" dataKey={attempt.key} name={attempt.label} stroke={COLORS[index % COLORS.length]} strokeWidth={2.5} connectNulls={false} dot={<ComparisonDot attempt={attempt} attemptIndex={index} profiles={selected} tracker={tracker} showSkillNames={showSkillNames} color={COLORS[index % COLORS.length]} />} activeDot={{ r: 8, strokeWidth: 2 }} isAnimationActive={false} />
                ))}
              </LineChart>
               </ResponsiveContainer>
             </div>
          </div>
             <div className="mt-4 space-y-2" data-testid={`skills-comparison-${tracker}`}>
                <h3 className="text-[11px] font-semibold text-muted-foreground">Full skills by attempt and jump</h3>
               {selected.map((attempt, index) => (
                 <div key={attempt.key} className="text-xs" data-testid={`skills-comparison-${attempt.key}`}>
                   <div className="font-semibold" style={{ color: COLORS[index % COLORS.length] }}>{attempt.label} · #{attempt.key.split(":")[1]}</div>
                   <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-muted-foreground">
                     {attempt.values.map((_, position) => (
                       <span key={position}>Jump {position + 1}: {jumpSkillLabel(attempt.jumpSkills[position], showSkillNames)}</span>
                     ))}
                   </div>
                 </div>
               ))}
             </div>
          <p className="text-[11px] text-muted-foreground/65 mt-3">
             Missing jump positions stay blank, not zero; no difference is shown without both measurements. {tracker === "execution" && "Landing deductions are included in totals when recorded, but are not plotted as a jump."}
          </p>
          <div className="mt-4 divide-y divide-border/20" data-testid={`selected-comparison-${tracker}`}>
            {selected.map((attempt, index) => (
              <div key={attempt.key} className="flex items-center gap-3 py-3 text-sm" data-testid={`row-comparison-${attempt.key}`}>
                <span className="h-3 w-3 rounded-full shrink-0" style={{ background: COLORS[index % COLORS.length] }} />
                <div className="min-w-0 flex-1">
                   <div className="font-semibold truncate">{attempt.label} <span className="text-xs font-normal text-muted-foreground">· #{attempt.key.split(":")[1]}{index === 0 ? " · Baseline" : ""}</span></div>
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