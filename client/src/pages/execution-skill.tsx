import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { api } from "@shared/routes";
import { useRoutines } from "@/hooks/use-routines";
import { useSkills } from "@/hooks/use-skills";
import { skillDisplayCode, skillDisplayName } from "@/lib/training-utils";
import { resolveTarget, targetSkillIdAt, targetName } from "@/lib/tracker-target";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ClipboardCheck, Loader2, TrendingDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { ExecutionSession } from "@shared/schema";

const tooltipStyle = {
  borderRadius: "12px",
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  fontSize: "12px",
};

interface DeductionSample {
  sessionId: number;
  date: string;
  targetLabel: string;
  pos: number; // 1-based position in the sequence (or attempt number)
  points: number;
}

// Per-value severity, same scale as the session page's breakdown list.
function valueClass(points: number): string {
  if (points >= 0.3) return "text-red-500";
  if (points >= 0.2) return "text-amber-500";
  return "text-emerald-500";
}

export default function ExecutionSkillPage() {
  const [, params] = useRoute("/execution/skill/:id");
  const [, navigate] = useLocation();
  const skillId = Number(params?.id);

  const { data: routines } = useRoutines();
  const { data: allSkills, isLoading: skillsLoading } = useSkills();
  const { data: sessions, isLoading: sessionsLoading } = useQuery<ExecutionSession[]>({
    queryKey: [api.executionSessions.list.path],
  });

  const skill = allSkills?.find(s => s.id === skillId);
  const routineById = useMemo(() => new Map((routines ?? []).map(r => [r.id, r])), [routines]);

  // Every judged deduction of this skill across all execution sessions, oldest first.
  const samples = useMemo<DeductionSample[]>(() => {
    const out: DeductionSample[] = [];
    const ordered = [...(sessions ?? [])].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));
    for (const s of ordered) {
      const target = resolveTarget(s, routineById, allSkills);
      if (!target) continue;
      const vals = s.deductions ?? [];
      for (let i = 0; i < vals.length; i++) {
        if (targetSkillIdAt(target, i) !== skillId) continue;
        out.push({
          sessionId: s.id,
          date: s.date,
          targetLabel: targetName(target, allSkills) ?? "?",
          pos: i + 1,
          points: vals[i],
        });
      }
    }
    return out;
  }, [sessions, routineById, allSkills, skillId]);

  const stats = useMemo(() => {
    if (samples.length === 0) return null;
    const pts = samples.map(s => s.points);
    return {
      avg: pts.reduce((a, b) => a + b, 0) / pts.length,
      best: Math.min(...pts),
      worst: Math.max(...pts),
      count: pts.length,
    };
  }, [samples]);

  const chartData = useMemo(
    () =>
      samples.map((s, i) => ({
        idx: i + 1,
        label: format(parseISO(s.date), "MMM d"),
        points: s.points,
        targetLabel: s.targetLabel,
        pos: s.pos,
      })),
    [samples],
  );

  if (skillsLoading || sessionsLoading) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary/60" />
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">Loading skill…</p>
        </div>
      </PageLayout>
    );
  }

  if (!skill) {
    return (
      <PageLayout>
        <div className="text-center py-24">
          <p className="text-muted-foreground">Skill not found.</p>
          <Button variant="ghost" className="mt-4" onClick={() => navigate("/execution")} data-testid="button-back-execution-missing">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Execution
          </Button>
        </div>
      </PageLayout>
    );
  }

  const STATS = stats && [
    { key: "stat-exec-skill-avg", label: "Avg ded.", value: `−${stats.avg.toFixed(2)}` },
    { key: "stat-exec-skill-best", label: "Best (fewest)", value: `−${stats.best.toFixed(1)}` },
    { key: "stat-exec-skill-worst", label: "Worst", value: `−${stats.worst.toFixed(1)}` },
    { key: "stat-exec-skill-count", label: "Attempts", value: String(stats.count) },
  ];

  return (
    <PageLayout>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="relative -mx-4 sm:-mx-6 px-6 pt-safe-top pb-0 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-72"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, hsl(var(--primary)/0.16) 0%, hsl(var(--primary)/0.04) 55%, transparent 78%)",
          }}
        />

        <div className="relative pt-4 pb-6">
          <Button
            variant="ghost"
            size="sm"
            className="mb-5 -ml-2 h-8 text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground/60 hover:text-foreground"
            onClick={() => navigate("/execution")}
            data-testid="button-back-execution"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Execution Tracker
          </Button>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-[9px] font-mono text-muted-foreground/60 tracking-[0.18em] uppercase mb-4">
            <ClipboardCheck className="w-3 h-3 text-rose-400" />
            Skill Deduction History
          </div>

          <h1
            className="font-black leading-[0.95] tracking-[-0.045em]"
            style={{ fontSize: "clamp(30px,8vw,44px)" }}
          >
            <span
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--chart-4)) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
              data-testid="text-exec-skill-code"
            >
              {skillDisplayCode(skill, allSkills)}
            </span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground/60" data-testid="text-exec-skill-name">
            {skillDisplayName(skill, allSkills)}
          </p>
        </div>

        {/* Stat strip */}
        {STATS && (
          <div className="relative -mx-6 px-4 pb-4">
            <div className="flex divide-x divide-white/[0.06] rounded-2xl overflow-hidden border border-white/[0.07] bg-white/[0.025]">
              {STATS.map(s => (
                <div key={s.key} className="flex-1 flex flex-col items-center py-3 gap-1 min-w-0 px-1">
                  <span
                    className="text-[18px] font-bold tabular-nums leading-none"
                    style={{
                      background: "linear-gradient(135deg,#60a5fa,#a78bfa)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                    data-testid={s.key}
                  >
                    {s.value}
                  </span>
                  <span className="text-[8px] font-mono uppercase tracking-[0.12em] text-muted-foreground/60 truncate max-w-full">
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {samples.length === 0 ? (
        <div className="py-24 px-6 flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 mb-5 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ClipboardCheck className="w-7 h-7 text-primary" />
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50 mb-2">No data yet</p>
          <h3 className="text-xl font-black tracking-tight">No execution data for this skill.</h3>
        </div>
      ) : (
        <>
          {/* ── Deduction over time ──────────────────────────────── */}
          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 mb-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60">Deduction over time</span>
              <span className="ml-auto font-mono text-[9px] text-muted-foreground/55">lower is better</span>
            </div>
            <div className="h-52 w-full" data-testid="chart-exec-skill">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="execSkillFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" minTickGap={40} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    domain={[0, "dataMax + 0.1"]}
                    tickFormatter={(v: number) => v.toFixed(1)}
                    width={40}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => [`−${value.toFixed(1)}`, "Deduction"]}
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload;
                      return p ? `${p.label} · ${p.targetLabel} · #${p.pos}` : "";
                    }}
                  />
                  <Area type="monotone" dataKey="points" stroke="#f43f5e" strokeWidth={2} fill="url(#execSkillFill)" dot={false} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* ── Deduction log ────────────────────────────────────── */}
          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60">Deduction log</span>
              <span className="ml-auto font-mono text-[9px] text-muted-foreground/55">newest first</span>
            </div>
            <div className="divide-y divide-white/[0.05] rounded-xl overflow-hidden border border-white/[0.06]">
              {[...samples].reverse().map((s, i) => (
                <div
                  key={`${s.sessionId}-${s.pos}-${i}`}
                  className="flex items-center gap-3 text-xs font-mono px-3 py-2.5"
                  data-testid={`row-exec-skill-log-${s.sessionId}-${s.pos}`}
                >
                  <span className="text-muted-foreground/50 w-20 shrink-0">{format(parseISO(s.date), "dd-MM-yyyy")}</span>
                  <span className="text-muted-foreground flex-1 truncate">{s.targetLabel}</span>
                  <span className="text-muted-foreground/60 shrink-0" title="Position in the sequence (or attempt number)">#{s.pos}</span>
                  <span className={cn("shrink-0 w-14 text-right font-bold tabular-nums", valueClass(s.points))}>
                    −{s.points.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </PageLayout>
  );
}
