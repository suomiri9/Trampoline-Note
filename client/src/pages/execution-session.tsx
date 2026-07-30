import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { api } from "@shared/routes";
import { useRoutines } from "@/hooks/use-routines";
import { useSkills } from "@/hooks/use-skills";
import { skillDisplayCode } from "@/lib/training-utils";
import { resolveTarget, targetSkillIdAt, targetName } from "@/lib/tracker-target";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ClipboardCheck, Loader2, TrendingDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { totalDeductionPoints, impliedEScore, pointsToTenths } from "@shared/execution";
import type { ExecutionSession } from "@shared/schema";

const tooltipStyle = {
  borderRadius: "8px",
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  fontSize: "12px",
};

function barColor(points: number): string {
  if (points >= 0.3) return "#ef4444";
  if (points >= 0.2) return "#f59e0b";
  return "#10b981";
}

export default function ExecutionSessionPage() {
  const [, params] = useRoute("/execution/session/:id");
  const [, navigate] = useLocation();
  const sessionId = Number(params?.id);

  const { data: routines } = useRoutines();
  const { data: allSkills, isLoading: skillsLoading } = useSkills();
  const { data: sessions, isLoading: sessionsLoading } = useQuery<ExecutionSession[]>({
    queryKey: [api.executionSessions.list.path],
  });

  const routineById = useMemo(() => new Map((routines ?? []).map(r => [r.id, r])), [routines]);
  const session = sessions?.find(s => s.id === sessionId);
  const target = session ? resolveTarget(session, routineById, allSkills) : undefined;
  const name = session ? (targetName(target, allSkills) ?? "Session") : "";

  const rows = useMemo(() => {
    if (!session) return [];
    const ded = session.deductions ?? [];
    const out = ded.map((d, i) => {
      const skillId = target ? targetSkillIdAt(target, i) : null;
      const sk = skillId != null ? allSkills?.find(s => s.id === skillId) : undefined;
      return {
        pos: i + 1,
        code: sk ? skillDisplayCode(sk, allSkills) : `#${i + 1}`,
        points: d,
        isLanding: false,
      };
    });
    if (session.landingDeduction != null) {
      out.push({ pos: ded.length + 1, code: "Landing", points: session.landingDeduction, isLanding: true });
    }
    return out;
  }, [session, target, allSkills]);

  const total = session ? totalDeductionPoints(session.deductions ?? [], session.landingDeduction) : 0;
  const eScore = session ? impliedEScore(session.deductions ?? [], session.landingDeduction) : null;
  const worst = rows.length > 0 ? rows.reduce((a, b) => (b.points > a.points ? b : a)) : null;

  if (skillsLoading || sessionsLoading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
        </div>
      </PageLayout>
    );
  }

  if (!session) {
    return (
      <PageLayout>
        <div className="text-center py-16">
          <p className="text-muted-foreground">Session not found.</p>
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
          <ClipboardCheck className="w-3.5 h-3.5" /> Execution · Session
        </div>
        <h1 className="text-3xl font-display mt-1" data-testid="text-exec-session-name">{name}</h1>
        <div className="text-xs font-mono text-muted-foreground mt-1">{format(parseISO(session.date), "dd-MM-yyyy")}</div>
      </div>

      {/* ---- Summary stats ---- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="card-3d rounded-2xl p-4 text-center">
          <div className="text-2xl font-display text-rose-400" data-testid="stat-exec-session-total">−{total.toFixed(1)}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Total deductions</div>
        </div>
        <div className="card-3d rounded-2xl p-4 text-center">
          <div className="text-2xl font-display text-emerald-500" data-testid="stat-exec-session-e">{eScore != null ? eScore.toFixed(1) : "—"}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">E score</div>
        </div>
        <div className="card-3d rounded-2xl p-4 text-center">
          <div className="text-2xl font-display text-red-500" data-testid="stat-exec-session-worst">
            {worst ? `−${worst.points.toFixed(1)}` : "—"}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">
            Worst{worst ? ` (${worst.code})` : ""}
          </div>
        </div>
        <div className="card-3d rounded-2xl p-4 text-center">
          <div className="text-2xl font-display text-foreground" data-testid="stat-exec-session-skills">{(session.deductions ?? []).length}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Skills scored</div>
        </div>
      </div>

      {/* ---- Deductions per skill ---- */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-rose-500" /> Deductions per skill
            <span className="text-[10px] font-mono font-normal text-muted-foreground">in tenths, as judged</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-52 w-full" data-testid="chart-exec-session">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="code" tick={{ fontSize: 10 }} className="fill-muted-foreground" interval={0} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  allowDecimals={false}
                  tickFormatter={(v: number) => String(Math.round(v))}
                  width={40}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                  formatter={(value: number) => [`−${(value / 10).toFixed(1)} pts`, "Deduction"]}
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload;
                    return p ? (p.isLanding ? "Landing" : `Skill ${p.pos} · ${p.code}`) : "";
                  }}
                />
                <Bar dataKey={(r: (typeof rows)[number]) => pointsToTenths(r.points)} radius={[4, 4, 0, 0]}>
                  {rows.map(r => (
                    <Cell key={r.pos} fill={barColor(r.points)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ---- Deduction list ---- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-emerald-500" /> Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {rows.map(r => (
              <div
                key={`${r.pos}-${r.isLanding ? "landing" : "skill"}`}
                className={cn(
                  "flex items-center gap-3 text-xs font-mono rounded-lg px-3 py-2",
                  r.isLanding ? "bg-secondary/10 border border-dashed border-border/50" : "bg-secondary/30 border border-border/50",
                )}
                data-testid={`row-exec-session-${r.isLanding ? "landing" : r.pos}`}
              >
                <span className="text-muted-foreground/60 w-8 shrink-0">{r.isLanding ? "L" : `#${r.pos}`}</span>
                <span className="font-bold text-foreground flex-1 truncate">{r.code}</span>
                <span className={cn("shrink-0 w-14 text-right font-bold", r.points >= 0.3 ? "text-red-500" : r.points >= 0.2 ? "text-amber-500" : "text-emerald-500")}>
                  −{r.points.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
          {session.note && <p className="text-xs text-muted-foreground mt-3 italic">{session.note}</p>}
        </CardContent>
      </Card>
    </PageLayout>
  );
}
