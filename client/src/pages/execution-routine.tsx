import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { api } from "@shared/routes";
import { useRoutines } from "@/hooks/use-routines";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ClipboardCheck, Loader2, TrendingDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { totalDeductionPoints, impliedEScore } from "@shared/execution";
import type { ExecutionSession } from "@shared/schema";

const tooltipStyle = {
  borderRadius: "12px",
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  fontSize: "12px",
};

interface RoutineSample {
  sessionId: number;
  date: string;
  totalDeductions: number; // points, incl. landing when recorded
  eScore: number | null; // only for complete routines with a landing
  skillCount: number;
  hasLanding: boolean;
}

export default function ExecutionRoutinePage() {
  const [, params] = useRoute("/execution/routine/:id");
  const [, navigate] = useLocation();
  const routineId = Number(params?.id);

  const { data: routines, isLoading: routinesLoading } = useRoutines();
  const { data: sessions, isLoading: sessionsLoading } = useQuery<ExecutionSession[]>({
    queryKey: [api.executionSessions.list.path],
  });

  const routine = routines?.find(r => r.id === routineId);

  // Every execution session recorded against this routine, oldest first.
  const samples = useMemo<RoutineSample[]>(() => {
    const out: RoutineSample[] = [];
    const ordered = [...(sessions ?? [])]
      .filter(s => s.routineId === routineId)
      .sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));
    for (const s of ordered) {
      const deductions = s.deductions ?? [];
      out.push({
        sessionId: s.id,
        date: s.date,
        totalDeductions: totalDeductionPoints(deductions, s.landingDeduction),
        eScore: impliedEScore(deductions, s.landingDeduction),
        skillCount: deductions.length,
        hasLanding: s.landingDeduction != null,
      });
    }
    return out;
  }, [sessions, routineId]);

  const stats = useMemo(() => {
    if (samples.length === 0) return null;
    const totals = samples.map(s => s.totalDeductions);
    const eScores = samples.filter(s => s.eScore != null).map(s => s.eScore!);
    return {
      avgTotal: totals.reduce((a, b) => a + b, 0) / totals.length,
      bestTotal: Math.min(...totals),
      avgE: eScores.length > 0 ? eScores.reduce((a, b) => a + b, 0) / eScores.length : null,
      bestE: eScores.length > 0 ? Math.max(...eScores) : null,
      count: samples.length,
    };
  }, [samples]);

  const chartData = useMemo(
    () =>
      samples.map(s => ({
        label: format(parseISO(s.date), "MMM d"),
        totalDeductions: s.totalDeductions,
        eScore: s.eScore,
        skillCount: s.skillCount,
        hasLanding: s.hasLanding,
      })),
    [samples],
  );

  if (routinesLoading || sessionsLoading) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary/60" />
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">Loading routine…</p>
        </div>
      </PageLayout>
    );
  }

  if (!routine) {
    return (
      <PageLayout>
        <div className="text-center py-24">
          <p className="text-muted-foreground">Routine not found.</p>
          <Button variant="ghost" className="mt-4" onClick={() => navigate("/execution")} data-testid="button-back-execution-missing">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Execution
          </Button>
        </div>
      </PageLayout>
    );
  }

  const STATS = stats && [
    { key: "stat-exec-routine-avg", label: "Avg ded.", value: `−${stats.avgTotal.toFixed(2)}` },
    { key: "stat-exec-routine-best", label: "Best (fewest)", value: `−${stats.bestTotal.toFixed(1)}` },
    { key: "stat-exec-routine-avg-e", label: "Avg E", value: stats.avgE != null ? stats.avgE.toFixed(2) : "—" },
    { key: "stat-exec-routine-count", label: "Sessions", value: String(stats.count) },
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
            Routine Execution Graph
          </div>

          <h1
            className="font-black leading-[0.95] tracking-[-0.045em]"
            style={{ fontSize: "clamp(30px,8vw,44px)" }}
            data-testid="text-exec-routine-name"
          >
            <span
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--chart-4)) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {routine.name}
            </span>
          </h1>
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
          <h3 className="text-xl font-black tracking-tight">No execution data for this routine.</h3>
        </div>
      ) : (
        <>
          {/* ── Total deductions over time ───────────────────────── */}
          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 mb-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60">Total deductions over time</span>
              <span className="ml-auto font-mono text-[9px] text-muted-foreground/55">lower is better</span>
            </div>
            <div className="h-52 w-full" data-testid="chart-exec-routine">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="execRoutineFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" minTickGap={40} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    domain={[0, "dataMax + 0.2"]}
                    tickFormatter={(v: number) => v.toFixed(1)}
                    width={52}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => [`−${value.toFixed(1)}`, "Deductions"]}
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload;
                      return p ? `${p.label} · ${p.skillCount} skill${p.skillCount === 1 ? "" : "s"}${p.hasLanding ? " + landing" : ""}` : "";
                    }}
                  />
                  <Area type="monotone" dataKey="totalDeductions" stroke="#f43f5e" strokeWidth={2} fill="url(#execRoutineFill)" dot={false} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* ── E score over time ────────────────────────────────── */}
          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 mb-4">
            <div className="flex items-center gap-2 mb-4">
              <ClipboardCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60">E score over time</span>
              <span className="ml-auto font-mono text-[9px] text-muted-foreground/55">complete routines only</span>
            </div>
            <div className="h-52 w-full" data-testid="chart-exec-routine-escore">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="execRoutineEscoreFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" minTickGap={40} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    domain={["dataMin - 0.2", "dataMax + 0.2"]}
                    tickFormatter={(v: number) => v.toFixed(1)}
                    width={52}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => [value.toFixed(1), "E score"]}
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload;
                      return p ? p.label : "";
                    }}
                  />
                  <Area type="monotone" dataKey="eScore" connectNulls stroke="#10b981" strokeWidth={2} fill="url(#execRoutineEscoreFill)" dot={false} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* ── Session log ──────────────────────────────────────── */}
          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60">Session log</span>
              <span className="ml-auto font-mono text-[9px] text-muted-foreground/55">newest first</span>
            </div>
            <div className="divide-y divide-white/[0.05] rounded-xl overflow-hidden border border-white/[0.06]">
              {[...samples].reverse().map(s => (
                <div
                  key={s.sessionId}
                  className="flex items-center gap-3 text-xs font-mono px-3 py-2.5"
                  data-testid={`row-exec-routine-log-${s.sessionId}`}
                >
                  <span className="text-muted-foreground/50 w-20 shrink-0">{format(parseISO(s.date), "dd-MM-yyyy")}</span>
                  <span className="text-muted-foreground/60 flex-1 truncate" title="Skills scored in this session">
                    {s.skillCount} skill{s.skillCount === 1 ? "" : "s"}{s.hasLanding ? " + landing" : ""}
                  </span>
                  <span className="text-rose-500 font-bold shrink-0 w-14 text-right tabular-nums">−{s.totalDeductions.toFixed(1)}</span>
                  <span className={cn("shrink-0 w-14 text-right tabular-nums", s.eScore == null ? "text-muted-foreground/60" : "text-emerald-500 font-bold")} title="Implied E score (20 − deductions), complete routines only">
                    {s.eScore == null ? "—" : s.eScore.toFixed(1)}
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
