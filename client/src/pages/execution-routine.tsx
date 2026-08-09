import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { api } from "@shared/routes";
import { useRoutines } from "@/hooks/use-routines";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ClipboardCheck, Loader2, TrendingDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { totalDeductionPoints, impliedEScore } from "@shared/execution";
import type { ExecutionSession } from "@shared/schema";

const tooltipStyle = {
  borderRadius: "8px",
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
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
        </div>
      </PageLayout>
    );
  }

  if (!routine) {
    return (
      <PageLayout>
        <div className="text-center py-16">
          <p className="text-muted-foreground">Routine not found.</p>
          <Button variant="ghost" className="mt-4" onClick={() => navigate("/execution")} data-testid="button-back-execution-missing">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Execution
          </Button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <Button
        variant="ghost"
        size="sm"
        className="mb-4 -ml-2 text-muted-foreground"
        onClick={() => navigate("/execution")}
        data-testid="button-back-execution"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Execution Tracker
      </Button>

      <div className="mb-6">
        <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
          <ClipboardCheck className="w-3.5 h-3.5" /> Execution · Routine
        </div>
        <h1 className="text-3xl font-display mt-1" data-testid="text-exec-routine-name">{routine.name}</h1>
      </div>

      {samples.length === 0 ? (
        <div className="text-center py-20 card-3d rounded-2xl">
          <ClipboardCheck className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No execution data for this routine yet.</p>
        </div>
      ) : (
        <>
          {/* ---- Summary stats ---- */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="card-3d rounded-2xl p-4 text-center">
              <div className="text-2xl font-display text-rose-400" data-testid="stat-exec-routine-avg">−{stats!.avgTotal.toFixed(2)}</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Avg deductions</div>
            </div>
            <div className="card-3d rounded-2xl p-4 text-center">
              <div className="text-2xl font-display text-foreground" data-testid="stat-exec-routine-best">−{stats!.bestTotal.toFixed(1)}</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Best (fewest)</div>
            </div>
            <div className="card-3d rounded-2xl p-4 text-center">
              <div className="text-2xl font-display text-emerald-500" data-testid="stat-exec-routine-avg-e">
                {stats!.avgE != null ? stats!.avgE.toFixed(2) : "—"}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Avg E score</div>
            </div>
            <div className="card-3d rounded-2xl p-4 text-center">
              <div className="text-2xl font-display text-foreground" data-testid="stat-exec-routine-count">{stats!.count}</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Sessions</div>
            </div>
          </div>

          {/* ---- Total deductions over time ---- */}
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-rose-500" /> Total deductions over time
                <span className="text-[10px] font-mono font-normal text-muted-foreground">lower is better</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52 w-full" data-testid="chart-exec-routine">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" interval="preserveStartEnd" minTickGap={40} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                      domain={[0, "dataMax + 0.2"]}
                      tickFormatter={(v: number) => v.toFixed(1)}
                      width={52}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number) => [`−${value.toFixed(1)}`, "Deductions"]}
                      labelFormatter={(_, payload) => {
                        const p = payload?.[0]?.payload;
                        return p ? `${p.label} · ${p.skillCount} skill${p.skillCount === 1 ? "" : "s"}${p.hasLanding ? " + landing" : ""}` : "";
                      }}
                    />
                    <Line type="monotone" dataKey="totalDeductions" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3, fill: "#f43f5e" }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* ---- E score over time ---- */}
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-emerald-500" /> E score over time
                <span className="text-[10px] font-mono font-normal text-muted-foreground">complete routines only</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52 w-full" data-testid="chart-exec-routine-escore">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" interval="preserveStartEnd" minTickGap={40} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                      domain={["dataMin - 0.2", "dataMax + 0.2"]}
                      tickFormatter={(v: number) => v.toFixed(1)}
                      width={52}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number) => [value.toFixed(1), "E score"]}
                      labelFormatter={(_, payload) => {
                        const p = payload?.[0]?.payload;
                        return p ? p.label : "";
                      }}
                    />
                    <Line type="monotone" dataKey="eScore" connectNulls stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981" }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* ---- Session log ---- */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-rose-500" /> Session log
                <span className="text-[10px] font-mono font-normal text-muted-foreground">newest first</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {[...samples].reverse().map(s => (
                  <div
                    key={s.sessionId}
                    className="flex items-center gap-3 text-xs font-mono rounded-lg bg-white/[0.025] border border-white/[0.07] px-3 py-2"
                    data-testid={`row-exec-routine-log-${s.sessionId}`}
                  >
                    <span className="text-muted-foreground w-20 shrink-0">{format(parseISO(s.date), "dd-MM-yyyy")}</span>
                    <span className="text-muted-foreground/60 flex-1" title="Skills scored in this session">
                      {s.skillCount} skill{s.skillCount === 1 ? "" : "s"}{s.hasLanding ? " + landing" : ""}
                    </span>
                    <span className="text-rose-500 font-bold shrink-0 w-14 text-right">−{s.totalDeductions.toFixed(1)}</span>
                    <span className={cn("shrink-0 w-14 text-right", s.eScore == null ? "text-muted-foreground/50" : "text-emerald-500 font-bold")} title="Implied E score (20 − deductions), complete routines only">
                      {s.eScore == null ? "—" : s.eScore.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </PageLayout>
  );
}
