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
import { ArrowLeft, ClipboardCheck, Loader2, TrendingDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ExecutionSession } from "@shared/schema";

const tooltipStyle = {
  borderRadius: "8px",
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
          <ClipboardCheck className="w-3.5 h-3.5" /> Execution · Skill
        </div>
        <h1 className="text-3xl font-display mt-1 flex items-baseline gap-3 flex-wrap">
          <span data-testid="text-exec-skill-code">{skillDisplayCode(skill, allSkills)}</span>
          <span className="text-lg text-muted-foreground font-body" data-testid="text-exec-skill-name">{skillDisplayName(skill, allSkills)}</span>
        </h1>
      </div>

      {samples.length === 0 ? (
        <div className="text-center py-20 card-3d rounded-2xl">
          <ClipboardCheck className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No execution data for this skill yet.</p>
        </div>
      ) : (
        <>
          {/* ---- Summary stats ---- */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="card-3d rounded-2xl p-4 text-center">
              <div className="text-2xl font-display text-rose-400" data-testid="stat-exec-skill-avg">−{stats!.avg.toFixed(2)}</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Avg deduction</div>
            </div>
            <div className="card-3d rounded-2xl p-4 text-center">
              <div className="text-2xl font-display text-emerald-500" data-testid="stat-exec-skill-best">−{stats!.best.toFixed(1)}</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Best (fewest)</div>
            </div>
            <div className="card-3d rounded-2xl p-4 text-center">
              <div className="text-2xl font-display text-red-500" data-testid="stat-exec-skill-worst">−{stats!.worst.toFixed(1)}</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Worst</div>
            </div>
            <div className="card-3d rounded-2xl p-4 text-center">
              <div className="text-2xl font-display text-foreground" data-testid="stat-exec-skill-count">{stats!.count}</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Judged attempts</div>
            </div>
          </div>

          {/* ---- Deduction over time ---- */}
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-rose-500" /> Deduction over time
                <span className="text-[10px] font-mono font-normal text-muted-foreground">lower is better</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52 w-full" data-testid="chart-exec-skill">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" interval="preserveStartEnd" minTickGap={40} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                      domain={[0, "dataMax + 0.1"]}
                      tickFormatter={(v: number) => v.toFixed(1)}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number) => [`−${value.toFixed(1)}`, "Deduction"]}
                      labelFormatter={(_, payload) => {
                        const p = payload?.[0]?.payload;
                        return p ? `${p.label} · ${p.targetLabel} · #${p.pos}` : "";
                      }}
                    />
                    <Line type="monotone" dataKey="points" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3, fill: "#f43f5e" }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* ---- Deduction log ---- */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-rose-500" /> Deduction log
                <span className="text-[10px] font-mono font-normal text-muted-foreground">newest first</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {[...samples].reverse().map((s, i) => (
                  <div
                    key={`${s.sessionId}-${s.pos}-${i}`}
                    className="flex items-center gap-3 text-xs font-mono rounded-lg bg-white/[0.025] border border-white/[0.07] px-3 py-2"
                    data-testid={`row-exec-skill-log-${s.sessionId}-${s.pos}`}
                  >
                    <span className="text-muted-foreground w-20 shrink-0">{format(parseISO(s.date), "dd-MM-yyyy")}</span>
                    <span className="text-muted-foreground flex-1 truncate">{s.targetLabel}</span>
                    <span className="text-muted-foreground/60 shrink-0" title="Position in the sequence (or attempt number)">#{s.pos}</span>
                    <span className={cn("shrink-0 w-14 text-right font-bold", valueClass(s.points))}>
                      −{s.points.toFixed(1)}
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
