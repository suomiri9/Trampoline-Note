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
import { ArrowLeft, ClipboardCheck, Loader2, TrendingDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { totalDeductionPoints, impliedEScore, pointsToTenths } from "@shared/execution";
import type { ExecutionSession } from "@shared/schema";

const tooltipStyle = {
  borderRadius: "12px",
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
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary/60" />
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">Loading session…</p>
        </div>
      </PageLayout>
    );
  }

  if (!session) {
    return (
      <PageLayout>
        <div className="text-center py-24">
          <p className="text-muted-foreground">Session not found.</p>
          <Button variant="ghost" className="mt-4" onClick={() => navigate("/execution")} data-testid="button-back-execution-missing">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Execution
          </Button>
        </div>
      </PageLayout>
    );
  }

  const STATS = [
    { label: "Total ded.", value: `−${total.toFixed(1)}` },
    { label: "E score", value: eScore != null ? eScore.toFixed(1) : "—" },
    { label: worst ? `Worst · ${worst.code}` : "Worst", value: worst ? `−${worst.points.toFixed(1)}` : "—" },
    { label: "Skills", value: String((session.deductions ?? []).length) },
  ];

  return (
    <PageLayout>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="relative -mx-4 sm:-mx-6 -mt-6 md:-mt-8 px-6 pt-safe-top pb-0 overflow-hidden">
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
            Session Deductions
          </div>

          <h1
            className="font-black leading-[0.95] tracking-[-0.045em]"
            style={{ fontSize: "clamp(30px,8vw,44px)" }}
            data-testid="text-exec-session-name"
          >
            <span
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--chart-4)) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {name}
            </span>
          </h1>
          <p className="mt-2 text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground/60">
            {format(parseISO(session.date), "dd-MM-yyyy")}
          </p>
        </div>

        {/* Stat strip */}
        <div className="relative -mx-6 px-4 pb-4">
          <div className="flex divide-x divide-white/[0.06] rounded-2xl overflow-hidden border border-white/[0.07] bg-white/[0.025]">
            {STATS.map((s, i) => (
              <div key={i} className="flex-1 flex flex-col items-center py-3 gap-1 min-w-0 px-1">
                <span
                  className="text-[18px] font-bold tabular-nums leading-none"
                  style={{
                    background: "linear-gradient(135deg,#60a5fa,#a78bfa)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                  data-testid={i === 0 ? "stat-exec-session-total" : i === 1 ? "stat-exec-session-e" : i === 2 ? "stat-exec-session-worst" : "stat-exec-session-skills"}
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
      </div>

      {/* ── Deductions per skill ─────────────────────────────────── */}
      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60">Deductions per skill</span>
          <span className="ml-auto font-mono text-[9px] text-muted-foreground/55">in tenths</span>
        </div>
        <div className="h-52 w-full" data-testid="chart-exec-session">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="code" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={0} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                allowDecimals={false}
                tickFormatter={(v: number) => String(Math.round(v))}
                width={40}
                axisLine={false}
                tickLine={false}
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
      </section>

      {/* ── Breakdown ────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60">Breakdown</span>
        </div>
        <div className="divide-y divide-white/[0.05] rounded-xl overflow-hidden border border-white/[0.06]">
          {rows.map(r => (
            <div
              key={`${r.pos}-${r.isLanding ? "landing" : "skill"}`}
              className={cn(
                "flex items-center gap-3 text-xs font-mono px-3 py-2.5",
                r.isLanding && "bg-white/[0.01]",
              )}
              data-testid={`row-exec-session-${r.isLanding ? "landing" : r.pos}`}
            >
              <span className="text-muted-foreground/60 w-8 shrink-0">{r.isLanding ? "L" : `#${r.pos}`}</span>
              <span className="font-bold text-foreground flex-1 truncate">{r.code}</span>
              <span className={cn("shrink-0 w-14 text-right font-bold tabular-nums", r.points >= 0.3 ? "text-red-500" : r.points >= 0.2 ? "text-amber-500" : "text-emerald-500")}>
                −{r.points.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
        {session.note && <p className="text-xs text-muted-foreground mt-4 italic whitespace-pre-wrap">{session.note}</p>}
      </section>
    </PageLayout>
  );
}
