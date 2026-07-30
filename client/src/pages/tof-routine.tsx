import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { api } from "@shared/routes";
import { useRoutines } from "@/hooks/use-routines";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Timer, Loader2, TrendingDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { TofSession } from "@shared/schema";

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
  totalTof: number;
  jumps: number;
  avgDrop: number | null; // avg loss vs previous jump across the session (positive = losing height)
}

function fmtDrop(drop: number | null): string {
  if (drop == null) return "—";
  return `${drop > 0 ? "-" : "+"}${Math.abs(drop).toFixed(3)}s`;
}

export default function TofRoutinePage() {
  const [, params] = useRoute("/tof/routine/:id");
  const [, navigate] = useLocation();
  const routineId = Number(params?.id);

  const { data: routines, isLoading: routinesLoading } = useRoutines();
  const { data: sessions, isLoading: sessionsLoading } = useQuery<TofSession[]>({
    queryKey: [api.tofSessions.list.path],
  });

  const routine = routines?.find(r => r.id === routineId);

  // Every ToF session recorded against this routine, oldest first.
  const samples = useMemo<RoutineSample[]>(() => {
    const out: RoutineSample[] = [];
    const ordered = [...(sessions ?? [])]
      .filter(s => s.routineId === routineId)
      .sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));
    for (const s of ordered) {
      const vals = s.tofValues ?? [];
      if (vals.length === 0) continue;
      let dropSum = 0;
      let dropCount = 0;
      for (let i = 0; i < vals.length; i++) {
        const prev = i > 0 ? vals[i - 1] : s.preJumpTof;
        if (prev != null) {
          dropSum += prev - vals[i];
          dropCount += 1;
        }
      }
      out.push({
        sessionId: s.id,
        date: s.date,
        totalTof: vals.reduce((a, b) => a + b, 0),
        jumps: vals.length,
        avgDrop: dropCount > 0 ? dropSum / dropCount : null,
      });
    }
    return out;
  }, [sessions, routineId]);

  const stats = useMemo(() => {
    if (samples.length === 0) return null;
    const totals = samples.map(s => s.totalTof);
    const drops = samples.filter(s => s.avgDrop != null).map(s => s.avgDrop!);
    return {
      avgTotal: totals.reduce((a, b) => a + b, 0) / totals.length,
      bestTotal: Math.max(...totals),
      avgDrop: drops.length > 0 ? drops.reduce((a, b) => a + b, 0) / drops.length : null,
      count: samples.length,
    };
  }, [samples]);

  const chartData = useMemo(
    () =>
      samples.map(s => ({
        label: format(parseISO(s.date), "MMM d"),
        totalTof: s.totalTof,
        jumps: s.jumps,
        avgDrop: s.avgDrop,
        // Same sign convention as fmtDrop: below 0 = losing height.
        dropDelta: s.avgDrop == null ? null : -s.avgDrop,
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
          <Button variant="ghost" className="mt-4" onClick={() => navigate("/tof")} data-testid="button-back-tof-missing">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to ToF
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
        onClick={() => navigate("/tof")}
        data-testid="button-back-tof"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> ToF Tracker
      </Button>

      <div className="mb-6">
        <div className="text-[10px] font-mono uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
          <Timer className="w-3.5 h-3.5" /> Time of Flight · Routine
        </div>
        <h1 className="text-3xl font-display mt-1" data-testid="text-tof-routine-name">{routine.name}</h1>
      </div>

      {samples.length === 0 ? (
        <div className="text-center py-20 card-3d rounded-2xl">
          <Timer className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No ToF data for this routine yet.</p>
        </div>
      ) : (
        <>
          {/* ---- Summary stats ---- */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="card-3d rounded-2xl p-4 text-center">
              <div className="text-2xl font-display text-amber-400" data-testid="stat-tof-routine-avg">{stats!.avgTotal.toFixed(2)}s</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Avg total ToF</div>
            </div>
            <div className="card-3d rounded-2xl p-4 text-center">
              <div className="text-2xl font-display text-foreground" data-testid="stat-tof-routine-best">{stats!.bestTotal.toFixed(2)}s</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Best total ToF</div>
            </div>
            <div className="card-3d rounded-2xl p-4 text-center">
              <div
                className={cn("text-2xl font-display", stats!.avgDrop != null && stats!.avgDrop > 0 ? "text-red-500" : "text-emerald-500")}
                data-testid="stat-tof-routine-drop"
              >
                {fmtDrop(stats!.avgDrop)}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Avg drop / jump</div>
            </div>
            <div className="card-3d rounded-2xl p-4 text-center">
              <div className="text-2xl font-display text-foreground" data-testid="stat-tof-routine-count">{stats!.count}</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Sessions</div>
            </div>
          </div>

          {/* ---- Total ToF over time ---- */}
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Timer className="w-4 h-4 text-amber-500" /> Total ToF over time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52 w-full" data-testid="chart-tof-routine">
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
                      formatter={(value: number) => [`${value.toFixed(3)}s`, "Total ToF"]}
                      labelFormatter={(_, payload) => {
                        const p = payload?.[0]?.payload;
                        return p ? `${p.label} · ${p.jumps} jump${p.jumps === 1 ? "" : "s"}` : "";
                      }}
                    />
                    <Line type="monotone" dataKey="totalTof" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: "#f59e0b" }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* ---- Avg drop over time ---- */}
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-500" /> Avg drop over time
                <span className="text-[10px] font-mono font-normal text-muted-foreground">per jump · below 0 = lost height</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52 w-full" data-testid="chart-tof-routine-drop">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
                      formatter={(_value: number, _name, entry) => [fmtDrop(entry?.payload?.avgDrop ?? null), "Avg drop"]}
                      labelFormatter={(_, payload) => {
                        const p = payload?.[0]?.payload;
                        return p ? `${p.label} · ${p.jumps} jump${p.jumps === 1 ? "" : "s"}` : "";
                      }}
                    />
                    <Line type="monotone" dataKey="dropDelta" connectNulls stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: "#ef4444" }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* ---- Session log ---- */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-amber-500" /> Session log
                <span className="text-[10px] font-mono font-normal text-muted-foreground">newest first</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {[...samples].reverse().map(s => (
                  <div
                    key={s.sessionId}
                    className="flex items-center gap-3 text-xs font-mono rounded-lg bg-secondary/30 border border-border/50 px-3 py-2"
                    data-testid={`row-tof-routine-log-${s.sessionId}`}
                  >
                    <span className="text-muted-foreground w-20 shrink-0">{format(parseISO(s.date), "dd-MM-yyyy")}</span>
                    <span className="text-muted-foreground/60 flex-1" title="Recorded jumps in this session">{s.jumps} jump{s.jumps === 1 ? "" : "s"}</span>
                    <span className="text-foreground font-bold shrink-0 w-16 text-right">{s.totalTof.toFixed(2)}s</span>
                    <span
                      className={cn("shrink-0 w-16 text-right", s.avgDrop == null ? "text-muted-foreground/50" : s.avgDrop > 0 ? "text-red-500" : "text-emerald-500")}
                      title="Average change vs the previous jump (positive drop = lost height)"
                    >
                      {fmtDrop(s.avgDrop)}
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
