import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { api } from "@shared/routes";
import { useRoutines } from "@/hooks/use-routines";
import { useSkills } from "@/hooks/use-skills";
import { skillDisplayCode, skillDisplayName } from "@/lib/training-utils";
import { resolveTarget, targetSkillIdAt, targetName } from "@/lib/tracker-target";
import { PageLayout } from "@/components/page-layout";
import { Timer, Loader2, TrendingDown } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { TofSession } from "@shared/schema";

const tooltipStyle = {
  borderRadius: "12px",
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  fontSize: "12px",
};

interface TofSample {
  sessionId: number;
  date: string;
  routineName: string;
  jumpNo: number; // 1-based position in the routine
  tof: number;
  drop: number | null; // previous jump ToF minus this one (pre-jump counts for jump 1)
}

function fmtDrop(drop: number | null): string {
  if (drop == null) return "—";
  return `${drop > 0 ? "-" : "+"}${Math.abs(drop).toFixed(3)}s`;
}

export default function TofSkillPage() {
  const [, params] = useRoute("/tof/skill/:id");
  const skillId = Number(params?.id);

  const { data: routines } = useRoutines();
  const { data: allSkills, isLoading: skillsLoading } = useSkills();
  const { data: sessions, isLoading: sessionsLoading } = useQuery<TofSession[]>({
    queryKey: [api.tofSessions.list.path],
  });

  const skill = allSkills?.find(s => s.id === skillId);
  const routineById = useMemo(() => new Map((routines ?? []).map(r => [r.id, r])), [routines]);

  // Every recorded jump of this skill across all ToF sessions, oldest first.
  const samples = useMemo<TofSample[]>(() => {
    const out: TofSample[] = [];
    const ordered = [...(sessions ?? [])].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));
    for (const s of ordered) {
      const target = resolveTarget(s, routineById, allSkills);
      if (!target) continue;
      const vals = s.tofValues ?? [];
      for (let i = 0; i < vals.length; i++) {
        if (targetSkillIdAt(target, i) !== skillId) continue;
        const prev = i > 0 ? vals[i - 1] : s.preJumpTof;
        out.push({
          sessionId: s.id,
          date: s.date,
          routineName: targetName(target, allSkills) ?? "?",
          jumpNo: i + 1,
          tof: vals[i],
          drop: prev != null ? prev - vals[i] : null,
        });
      }
    }
    return out;
  }, [sessions, routineById, allSkills, skillId]);

  const stats = useMemo(() => {
    if (samples.length === 0) return null;
    const tofs = samples.map(s => s.tof);
    const drops = samples.filter(s => s.drop != null).map(s => s.drop!);
    return {
      avgTof: tofs.reduce((a, b) => a + b, 0) / tofs.length,
      bestTof: Math.max(...tofs),
      avgDrop: drops.length > 0 ? drops.reduce((a, b) => a + b, 0) / drops.length : null,
      dropSamples: drops.length,
      count: tofs.length,
    };
  }, [samples]);

  const chartData = useMemo(
    () =>
      samples.map((s, i) => ({
        idx: i + 1,
        label: format(parseISO(s.date), "MMM d"),
        tof: s.tof,
        drop: s.drop,
        // Plotted with the same sign convention as fmtDrop: below 0 = lost height.
        dropDelta: s.drop == null ? null : -s.drop,
        routineName: s.routineName,
        jumpNo: s.jumpNo,
      })),
    [samples],
  );

  if (skillsLoading || sessionsLoading) {
    return (
      <PageLayout accent="tof">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
        </div>
      </PageLayout>
    );
  }

  if (!skill) {
    return (
      <PageLayout accent="tof">
        <BackLink to="/tof" label="ToF Tracker" testId="button-back-tof-missing" className="mb-5" />
        <div className="py-24 flex flex-col items-center text-center">
          <div className="w-14 h-14 mb-5 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-center">
            <Timer className="w-7 h-7 text-muted-foreground/60" />
          </div>
          <h3 className="text-2xl font-black tracking-tight mb-2">Skill not found.</h3>
          <p className="text-sm text-muted-foreground/60">It may have been deleted.</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout accent="tof">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="relative -mx-4 sm:-mx-6 -mt-6 md:-mt-8 px-4 sm:px-6 pb-2">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-96"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, hsl(var(--page-accent) / 0.20) 0%, hsl(var(--page-accent) / 0.05) 60%, transparent 82%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
            maskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
          }}
        />
        <div className="relative pt-6 md:pt-8 pb-5">
          <div className="mb-5">
            <BackLink to="/tof" label="ToF Tracker" testId="button-back-tof" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.07] bg-white/[0.025] text-[9px] font-mono text-amber-400/70 tracking-[0.18em] uppercase mb-4">
            <Timer className="w-3 h-3" /> Time of Flight · Skill
          </div>
          <h1
            className="font-black leading-[0.95] tracking-[-0.04em] break-words"
            style={{ fontSize: "clamp(32px,9vw,48px)" }}
            data-testid="text-tof-skill-code"
          >
            <span
              style={{
                background: "linear-gradient(135deg, hsl(var(--page-accent)) 0%, hsl(var(--page-accent-2)) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {skillDisplayCode(skill, allSkills)}
            </span>
          </h1>
          <div className="mt-2 text-sm text-muted-foreground/60 leading-snug" data-testid="text-tof-skill-name">
            {skillDisplayName(skill, allSkills)}
          </div>
        </div>
      </div>

      {samples.length === 0 ? (
        <div className="py-24 flex flex-col items-center text-center">
          <div className="w-14 h-14 mb-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Timer className="w-7 h-7 text-amber-400" />
          </div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-2">No data yet</p>
          <h3 className="text-2xl font-black tracking-tight mb-2">No ToF for this skill.</h3>
          <p className="text-sm text-muted-foreground/60 max-w-xs leading-relaxed">
            Log a session that includes this skill to start tracking its height.
          </p>
        </div>
      ) : (
        <>
          {/* ── Stat strip ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-8">
            <StatCell value={`${stats!.avgTof.toFixed(2)}s`} label="Avg ToF" amber testId="stat-tof-avg" />
            <StatCell value={`${stats!.bestTof.toFixed(2)}s`} label="Best ToF" amber testId="stat-tof-best" />
            <StatCell value={fmtDrop(stats!.avgDrop)} label={`Avg drop (n=${stats!.dropSamples})`} drop testId="stat-tof-drop" />
            <StatCell value={String(stats!.count)} label="Recorded jumps" testId="stat-tof-count" />
          </div>

          {/* ── ToF over time ──────────────────────────────────── */}
          <Panel title="ToF over time" icon={<Timer className="w-3.5 h-3.5 text-amber-400" />}>
            <div className="h-52 w-full" data-testid="chart-tof-skill">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tofSkillFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" interval="preserveStartEnd" minTickGap={40} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                    domain={["dataMin - 0.1", "dataMax + 0.1"]}
                    tickFormatter={(v: number) => v.toFixed(2)}
                    width={52}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => [`${value.toFixed(3)}s`, "ToF"]}
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload;
                      return p ? `${p.label} · ${p.routineName} · jump ${p.jumpNo}` : "";
                    }}
                  />
                  <Area type="linear" dataKey="tof" stroke="#f59e0b" strokeWidth={2} fill="url(#tofSkillFill)" dot={false} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {/* ── Drop over time ─────────────────────────────────── */}
          <Panel
            title="Drop over time"
            icon={<TrendingDown className="w-3.5 h-3.5 text-red-500" />}
            meta="vs previous jump · below 0 = lost height"
          >
            <div className="h-52 w-full" data-testid="chart-tof-skill-drop">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tofSkillDropFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" interval="preserveStartEnd" minTickGap={40} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                    domain={["auto", "auto"]}
                    tickFormatter={(v: number) => v.toFixed(2)}
                    width={52}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(_value: number, _name, entry) => [fmtDrop(entry?.payload?.drop ?? null), "Drop"]}
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload;
                      return p ? `${p.label} · ${p.routineName} · jump ${p.jumpNo}` : "";
                    }}
                  />
                  <Area type="linear" dataKey="dropDelta" connectNulls stroke="#ef4444" strokeWidth={2} fill="url(#tofSkillDropFill)" dot={false} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {/* ── Jump log ───────────────────────────────────────── */}
          <Panel title="Jump log" icon={<TrendingDown className="w-3.5 h-3.5 text-amber-400" />} meta="newest first">
            <div className="rounded-xl overflow-hidden border border-white/[0.07] divide-y divide-white/[0.05]">
              {[...samples].reverse().map((s, i) => (
                <div
                  key={`${s.sessionId}-${s.jumpNo}-${i}`}
                  className="flex items-center gap-3 text-xs font-mono px-3.5 py-2.5 bg-white/[0.015]"
                  data-testid={`row-tof-log-${s.sessionId}-${s.jumpNo}`}
                >
                  <span className="text-muted-foreground/60 w-20 shrink-0 tabular-nums">{format(parseISO(s.date), "dd-MM-yyyy")}</span>
                  <span className="text-muted-foreground/70 flex-1 truncate">{s.routineName}</span>
                  <span className="text-muted-foreground/60 shrink-0 tabular-nums" title="Position in the sequence (or attempt number)">#{s.jumpNo}</span>
                  <span className="text-foreground font-bold shrink-0 w-14 text-right tabular-nums">{s.tof.toFixed(3)}s</span>
                  <span
                    className={cn("shrink-0 w-16 text-right tabular-nums", s.drop == null ? "text-muted-foreground/60" : s.drop > 0 ? "text-red-500" : "text-emerald-500")}
                    title="Change vs the previous jump (positive drop = lost height)"
                  >
                    {fmtDrop(s.drop)}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </PageLayout>
  );
}


function StatCell({
  value,
  label,
  amber,
  drop,
  testId,
}: {
  value: string;
  label: string;
  amber?: boolean;
  drop?: boolean;
  testId: string;
}) {
  const isNegDrop = drop && value.startsWith("-");
  return (
    <div className="flex flex-col items-center justify-center py-3.5 gap-1 rounded-2xl border border-white/[0.07] bg-white/[0.025]">
      <span
        className="text-[19px] font-bold tabular-nums leading-none"
        style={
          amber
            ? { background: "linear-gradient(135deg, hsl(var(--page-accent)) 0%, hsl(var(--page-accent-2)) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }
            : drop
              ? { color: isNegDrop ? "hsl(var(--destructive))" : "#10b981" }
              : undefined
        }
        data-testid={testId}
      >
        {value}
      </span>
      <span className="text-[8px] font-mono uppercase tracking-[0.14em] text-muted-foreground/60 text-center px-1">{label}</span>
    </div>
  );
}

function Panel({
  title,
  icon,
  meta,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60">{title}</span>
        {meta && <span className="font-mono text-[9px] text-muted-foreground/55 ml-auto">{meta}</span>}
      </div>
      {children}
    </div>
  );
}
