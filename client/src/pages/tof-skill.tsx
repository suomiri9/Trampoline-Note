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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Timer, Loader2, TrendingDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { TofSession } from "@shared/schema";

const tooltipStyle = {
  borderRadius: "8px",
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
  const [, navigate] = useLocation();
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
        routineName: s.routineName,
        jumpNo: s.jumpNo,
      })),
    [samples],
  );

  if (skillsLoading || sessionsLoading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
        </div>
      </PageLayout>
    );
  }

  if (!skill) {
    return (
      <PageLayout>
        <div className="text-center py-16">
          <p className="text-muted-foreground">Skill not found.</p>
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
          <Timer className="w-3.5 h-3.5" /> Time of Flight · Skill
        </div>
        <h1 className="text-3xl font-display mt-1 flex items-baseline gap-3 flex-wrap">
          <span data-testid="text-tof-skill-code">{skillDisplayCode(skill, allSkills)}</span>
          <span className="text-lg text-muted-foreground font-body" data-testid="text-tof-skill-name">{skillDisplayName(skill, allSkills)}</span>
        </h1>
      </div>

      {samples.length === 0 ? (
        <div className="text-center py-20 card-3d rounded-2xl">
          <Timer className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No ToF data for this skill yet.</p>
        </div>
      ) : (
        <>
          {/* ---- Summary stats ---- */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="card-3d rounded-2xl p-4 text-center">
              <div className="text-2xl font-display text-amber-400" data-testid="stat-tof-avg">{stats!.avgTof.toFixed(2)}s</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Avg ToF</div>
            </div>
            <div className="card-3d rounded-2xl p-4 text-center">
              <div className="text-2xl font-display text-foreground" data-testid="stat-tof-best">{stats!.bestTof.toFixed(2)}s</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Best ToF</div>
            </div>
            <div className="card-3d rounded-2xl p-4 text-center">
              <div
                className={cn("text-2xl font-display", stats!.avgDrop != null && stats!.avgDrop > 0 ? "text-red-500" : "text-emerald-500")}
                data-testid="stat-tof-drop"
              >
                {fmtDrop(stats!.avgDrop)}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Avg drop (n={stats!.dropSamples})</div>
            </div>
            <div className="card-3d rounded-2xl p-4 text-center">
              <div className="text-2xl font-display text-foreground" data-testid="stat-tof-count">{stats!.count}</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Recorded jumps</div>
            </div>
          </div>

          {/* ---- ToF over time ---- */}
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Timer className="w-4 h-4 text-amber-500" /> ToF over time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52 w-full" data-testid="chart-tof-skill">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
                    <Line type="monotone" dataKey="tof" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: "#f59e0b" }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* ---- Jump log ---- */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-amber-500" /> Jump log
                <span className="text-[10px] font-mono font-normal text-muted-foreground">newest first</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {[...samples].reverse().map((s, i) => (
                  <div
                    key={`${s.sessionId}-${s.jumpNo}-${i}`}
                    className="flex items-center gap-3 text-xs font-mono rounded-lg bg-secondary/30 border border-border/50 px-3 py-2"
                    data-testid={`row-tof-log-${s.sessionId}-${s.jumpNo}`}
                  >
                    <span className="text-muted-foreground w-20 shrink-0">{format(parseISO(s.date), "dd-MM-yyyy")}</span>
                    <span className="text-muted-foreground flex-1 truncate">{s.routineName}</span>
                    <span className="text-muted-foreground/60 shrink-0" title="Position in the sequence (or attempt number)">#{s.jumpNo}</span>
                    <span className="text-foreground font-bold shrink-0 w-14 text-right">{s.tof.toFixed(3)}s</span>
                    <span
                      className={cn("shrink-0 w-16 text-right", s.drop == null ? "text-muted-foreground/50" : s.drop > 0 ? "text-red-500" : "text-emerald-500")}
                      title="Change vs the previous jump (positive drop = lost height)"
                    >
                      {fmtDrop(s.drop)}
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
