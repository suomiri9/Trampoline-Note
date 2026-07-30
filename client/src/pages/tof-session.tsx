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

function fmtDrop(drop: number | null): string {
  if (drop == null) return "—";
  return `${drop > 0 ? "-" : "+"}${Math.abs(drop).toFixed(3)}s`;
}

export default function TofSessionPage() {
  const [, params] = useRoute("/tof/session/:id");
  const [, navigate] = useLocation();
  const sessionId = Number(params?.id);

  const { data: routines } = useRoutines();
  const { data: allSkills, isLoading: skillsLoading } = useSkills();
  const { data: sessions, isLoading: sessionsLoading } = useQuery<TofSession[]>({
    queryKey: [api.tofSessions.list.path],
  });

  const routineById = useMemo(() => new Map((routines ?? []).map(r => [r.id, r])), [routines]);
  const session = sessions?.find(s => s.id === sessionId);
  const target = session ? resolveTarget(session, routineById, allSkills) : undefined;
  const name = session ? (targetName(target, allSkills) ?? "Session") : "";

  const jumps = useMemo(() => {
    if (!session) return [];
    const vals = session.tofValues ?? [];
    return vals.map((v, i) => {
      const skillId = target ? targetSkillIdAt(target, i) : null;
      const sk = skillId != null ? allSkills?.find(s => s.id === skillId) : undefined;
      const prev = i > 0 ? vals[i - 1] : session.preJumpTof;
      return {
        jumpNo: i + 1,
        code: sk ? skillDisplayCode(sk, allSkills) : `#${i + 1}`,
        tof: v,
        drop: prev != null ? prev - v : null,
      };
    });
  }, [session, target, allSkills]);

  const stats = useMemo(() => {
    if (jumps.length === 0) return null;
    const drops = jumps.filter(j => j.drop != null);
    const worst = drops.length > 0 ? drops.reduce((a, b) => (b.drop! > a.drop! ? b : a)) : null;
    return {
      total: jumps.reduce((a, j) => a + j.tof, 0),
      best: Math.max(...jumps.map(j => j.tof)),
      worstDrop: worst,
    };
  }, [jumps]);

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
          <Timer className="w-3.5 h-3.5" /> Time of Flight · Session
        </div>
        <h1 className="text-3xl font-display mt-1" data-testid="text-tof-session-name">{name}</h1>
        <div className="text-xs font-mono text-muted-foreground mt-1">{format(parseISO(session.date), "dd-MM-yyyy")}</div>
      </div>

      {/* ---- Summary stats ---- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="card-3d rounded-2xl p-4 text-center">
          <div className="text-2xl font-display text-amber-400" data-testid="stat-tof-session-total">{stats!.total.toFixed(2)}s</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Total ToF</div>
        </div>
        <div className="card-3d rounded-2xl p-4 text-center">
          <div className="text-2xl font-display text-foreground" data-testid="stat-tof-session-best">{stats!.best.toFixed(3)}s</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Best jump</div>
        </div>
        <div className="card-3d rounded-2xl p-4 text-center">
          <div className="text-2xl font-display text-red-500" data-testid="stat-tof-session-worst-drop">
            {stats!.worstDrop ? fmtDrop(stats!.worstDrop.drop) : "—"}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">
            Biggest drop{stats!.worstDrop ? ` (${stats!.worstDrop.code})` : ""}
          </div>
        </div>
        <div className="card-3d rounded-2xl p-4 text-center">
          <div className="text-2xl font-display text-foreground" data-testid="stat-tof-session-jumps">{jumps.length}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">Jumps</div>
        </div>
      </div>

      {/* ---- ToF per jump ---- */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="w-4 h-4 text-amber-500" /> ToF per jump
            {session.preJumpTof != null && (
              <span className="text-[10px] font-mono font-normal text-muted-foreground">in-bounce {session.preJumpTof.toFixed(3)}s</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-52 w-full" data-testid="chart-tof-session">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={jumps} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="code" tick={{ fontSize: 10 }} className="fill-muted-foreground" interval={0} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  domain={["dataMin - 0.05", "dataMax + 0.05"]}
                  tickFormatter={(v: number) => v.toFixed(2)}
                  width={52}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number) => [`${value.toFixed(3)}s`, "ToF"]}
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload;
                    return p ? `Jump ${p.jumpNo} · ${p.code}` : "";
                  }}
                />
                <Line type="monotone" dataKey="tof" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: "#f59e0b" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ---- Jump list ---- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-amber-500" /> Jumps
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {jumps.map(j => (
              <div
                key={j.jumpNo}
                className="flex items-center gap-3 text-xs font-mono rounded-lg bg-secondary/30 border border-border/50 px-3 py-2"
                data-testid={`row-tof-session-jump-${j.jumpNo}`}
              >
                <span className="text-muted-foreground/60 w-8 shrink-0">#{j.jumpNo}</span>
                <span className="font-bold text-foreground flex-1 truncate">{j.code}</span>
                <span className="text-foreground font-bold shrink-0 w-16 text-right">{j.tof.toFixed(3)}s</span>
                <span
                  className={cn("shrink-0 w-16 text-right", j.drop == null ? "text-muted-foreground/50" : j.drop > 0 ? "text-red-500" : "text-emerald-500")}
                  title="Change vs the previous jump (positive drop = lost height)"
                >
                  {fmtDrop(j.drop)}
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
