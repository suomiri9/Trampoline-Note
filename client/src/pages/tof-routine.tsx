import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { api } from "@shared/routes";
import { useRoutines } from "@/hooks/use-routines";
import { PageLayout } from "@/components/page-layout";
import { ArrowLeft, Timer, Loader2, TrendingDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { TofSession } from "@shared/schema";

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
        <BackLink navigate={navigate} testId="button-back-tof-missing" />
        <div className="py-24 flex flex-col items-center text-center">
          <div className="w-14 h-14 mb-5 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-center">
            <Timer className="w-7 h-7 text-muted-foreground/40" />
          </div>
          <h3 className="text-2xl font-black tracking-tight mb-2">Routine not found.</h3>
          <p className="text-sm text-muted-foreground/60">It may have been deleted.</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <BackLink navigate={navigate} testId="button-back-tof" />

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="relative -mx-4 sm:-mx-6 px-6 pb-2 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-56"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, hsl(43 96% 56% / 0.14) 0%, hsl(43 96% 56% / 0.03) 55%, transparent 78%)",
          }}
        />
        <div className="relative pt-4 pb-5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.07] bg-white/[0.025] text-[9px] font-mono text-amber-400/70 tracking-[0.18em] uppercase mb-4">
            <Timer className="w-3 h-3" /> Time of Flight · Routine
          </div>
          <h1
            className="font-black leading-[0.95] tracking-[-0.04em] break-words"
            style={{ fontSize: "clamp(28px,8vw,44px)" }}
            data-testid="text-tof-routine-name"
          >
            <span
              style={{
                background: "linear-gradient(135deg,#fbbf24,#f97316)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {routine.name}
            </span>
          </h1>
        </div>
      </div>

      {samples.length === 0 ? (
        <div className="py-24 flex flex-col items-center text-center">
          <div className="w-14 h-14 mb-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Timer className="w-7 h-7 text-amber-400" />
          </div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-2">No data yet</p>
          <h3 className="text-2xl font-black tracking-tight mb-2">No ToF for this routine.</h3>
          <p className="text-sm text-muted-foreground/60 max-w-xs leading-relaxed">
            Log a ToF session against this routine to start tracking its total height.
          </p>
        </div>
      ) : (
        <>
          {/* ── Stat strip ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-8">
            <StatCell value={`${stats!.avgTotal.toFixed(2)}s`} label="Avg total ToF" amber testId="stat-tof-routine-avg" />
            <StatCell value={`${stats!.bestTotal.toFixed(2)}s`} label="Best total ToF" testId="stat-tof-routine-best" />
            <StatCell value={fmtDrop(stats!.avgDrop)} label="Avg drop / jump" drop testId="stat-tof-routine-drop" />
            <StatCell value={String(stats!.count)} label="Sessions" testId="stat-tof-routine-count" />
          </div>

          {/* ── Total ToF over time ────────────────────────────── */}
          <Panel title="Total ToF over time" icon={<Timer className="w-3.5 h-3.5 text-amber-400" />}>
            <div className="h-52 w-full" data-testid="chart-tof-routine">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
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
          </Panel>

          {/* ── Avg drop over time ─────────────────────────────── */}
          <Panel
            title="Avg drop over time"
            icon={<TrendingDown className="w-3.5 h-3.5 text-red-500" />}
            meta="per jump · below 0 = lost height"
          >
            <div className="h-52 w-full" data-testid="chart-tof-routine-drop">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
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
          </Panel>

          {/* ── Session log ────────────────────────────────────── */}
          <Panel title="Session log" icon={<TrendingDown className="w-3.5 h-3.5 text-amber-400" />} meta="newest first">
            <div className="rounded-xl overflow-hidden border border-white/[0.07] divide-y divide-white/[0.05]">
              {[...samples].reverse().map(s => (
                <div
                  key={s.sessionId}
                  className="flex items-center gap-3 text-xs font-mono px-3.5 py-2.5 bg-white/[0.015]"
                  data-testid={`row-tof-routine-log-${s.sessionId}`}
                >
                  <span className="text-muted-foreground/60 w-20 shrink-0 tabular-nums">{format(parseISO(s.date), "dd-MM-yyyy")}</span>
                  <span className="text-muted-foreground/40 flex-1 tabular-nums" title="Recorded jumps in this session">{s.jumps} jump{s.jumps === 1 ? "" : "s"}</span>
                  <span className="text-foreground font-bold shrink-0 w-16 text-right tabular-nums">{s.totalTof.toFixed(2)}s</span>
                  <span
                    className={cn("shrink-0 w-16 text-right tabular-nums", s.avgDrop == null ? "text-muted-foreground/40" : s.avgDrop > 0 ? "text-red-500" : "text-emerald-500")}
                    title="Average change vs the previous jump (positive drop = lost height)"
                  >
                    {fmtDrop(s.avgDrop)}
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

function BackLink({ navigate, testId }: { navigate: (to: string) => void; testId: string }) {
  return (
    <button
      onClick={() => navigate("/tof")}
      className="mb-5 inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground/50 hover:text-amber-400 transition-colors"
      data-testid={testId}
    >
      <ArrowLeft className="w-3.5 h-3.5" /> ToF Tracker
    </button>
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
            ? { background: "linear-gradient(135deg,#fbbf24,#f97316)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }
            : drop
              ? { color: isNegDrop ? "hsl(var(--destructive))" : "#10b981" }
              : undefined
        }
        data-testid={testId}
      >
        {value}
      </span>
      <span className="text-[8px] font-mono uppercase tracking-[0.14em] text-muted-foreground/40 text-center px-1">{label}</span>
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
        {meta && <span className="font-mono text-[9px] text-muted-foreground/35 ml-auto">{meta}</span>}
      </div>
      {children}
    </div>
  );
}
