import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { api } from "@shared/routes";
import { useRoutines } from "@/hooks/use-routines";
import { useSkills } from "@/hooks/use-skills";
import { skillDisplayCode } from "@/lib/training-utils";
import { resolveTarget, targetSkillIdAt, targetName } from "@/lib/tracker-target";
import { PageLayout } from "@/components/page-layout";
import { Timer, Loader2, TrendingDown } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { TofSession } from "@shared/schema";

const tooltipStyle = {
  borderRadius: "12px",
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
      <PageLayout accent="tof">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
        </div>
      </PageLayout>
    );
  }

  if (!session) {
    return (
      <PageLayout accent="tof">
        <BackLink to="/tof" label="ToF Tracker" testId="button-back-tof-missing" className="mb-5" />
        <div className="py-24 flex flex-col items-center text-center">
          <div className="w-14 h-14 mb-5 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-center">
            <Timer className="w-7 h-7 text-muted-foreground/60" />
          </div>
          <h3 className="text-2xl font-black tracking-tight mb-2">Session not found.</h3>
          <p className="text-sm text-muted-foreground/60">It may have been deleted.</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout accent="tof">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="relative -mx-4 sm:-mx-6 -mt-6 md:-mt-8 px-4 sm:px-6 pb-2">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-96"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, hsl(var(--page-accent) / 0.20) 0%, hsl(var(--page-accent) / 0.05) 60%, transparent 82%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
            maskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
          }}
        />
        <div className="relative pt-6 md:pt-8 pb-5">
          <div className="mb-5">
            <BackLink to="/tof" label="ToF Tracker" testId="button-back-tof" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.07] bg-white/[0.025] text-[9px] font-mono text-amber-400/70 tracking-[0.18em] uppercase mb-4">
            <Timer className="w-3 h-3" /> Time of Flight · Session
          </div>
          <h1
            className="font-black leading-[0.95] tracking-[-0.04em] break-words"
            style={{ fontSize: "clamp(28px,8vw,40px)" }}
            data-testid="text-tof-session-name"
          >
            <span
              style={{
                background: "linear-gradient(135deg, hsl(var(--page-accent)) 0%, hsl(var(--page-accent-2)) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {name}
            </span>
          </h1>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50">
            {format(parseISO(session.date), "dd-MM-yyyy")}
          </div>
        </div>
      </div>

      {/* ── Stat strip ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-8">
        <StatCell value={`${stats!.total.toFixed(2)}s`} label="Total ToF" amber testId="stat-tof-session-total" />
        <StatCell value={`${stats!.best.toFixed(3)}s`} label="Best jump" amber testId="stat-tof-session-best" />
        <StatCell
          value={stats!.worstDrop ? fmtDrop(stats!.worstDrop.drop) : "—"}
          label={`Biggest drop${stats!.worstDrop ? ` (${stats!.worstDrop.code})` : ""}`}
          drop
          testId="stat-tof-session-worst-drop"
        />
        <StatCell value={String(jumps.length)} label="Jumps" testId="stat-tof-session-jumps" />
      </div>

      {/* ── ToF per jump chart ───────────────────────────────────── */}
      <Panel
        title="ToF per jump"
        icon={<Timer className="w-3.5 h-3.5 text-amber-400" />}
        meta={session.preJumpTof != null ? `in-bounce ${session.preJumpTof.toFixed(3)}s` : undefined}
      >
        <div className="h-52 w-full" data-testid="chart-tof-session">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={jumps} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="tofSessionFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
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
              <Area type="monotone" dataKey="tof" stroke="#f59e0b" strokeWidth={2} fill="url(#tofSessionFill)" dot={false} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* ── Jump list ────────────────────────────────────────────── */}
      <Panel title="Jumps" icon={<TrendingDown className="w-3.5 h-3.5 text-amber-400" />}>
        <div className="rounded-xl overflow-hidden border border-white/[0.07] divide-y divide-white/[0.05]">
          {jumps.map(j => (
            <div
              key={j.jumpNo}
              className="flex items-center gap-3 text-xs font-mono px-3.5 py-2.5 bg-white/[0.015]"
              data-testid={`row-tof-session-jump-${j.jumpNo}`}
            >
              <span className="text-muted-foreground/60 w-8 shrink-0 tabular-nums">#{j.jumpNo}</span>
              <span className="font-bold text-foreground flex-1 truncate">{j.code}</span>
              <span className="text-foreground font-bold shrink-0 w-16 text-right tabular-nums">{j.tof.toFixed(3)}s</span>
              <span
                className={cn("shrink-0 w-16 text-right tabular-nums", j.drop == null ? "text-muted-foreground/60" : j.drop > 0 ? "text-red-500" : "text-emerald-500")}
                title="Change vs the previous jump (positive drop = lost height)"
              >
                {fmtDrop(j.drop)}
              </span>
            </div>
          ))}
        </div>
        {session.note && <p className="text-xs text-muted-foreground/70 mt-3 whitespace-pre-wrap leading-relaxed">{session.note}</p>}
      </Panel>
    </PageLayout>
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
            ? { background: "linear-gradient(135deg, hsl(var(--page-accent)) 0%, hsl(var(--page-accent-2)) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }
            : drop
              ? { color: isNegDrop ? "hsl(var(--destructive))" : "#10b981" }
              : undefined
        }
        data-testid={testId}
      >
        {value}
      </span>
      <span className="text-[8px] font-mono uppercase tracking-[0.14em] text-muted-foreground/60 text-center px-1">{label}</span>
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
        {meta && <span className="font-mono text-[9px] text-muted-foreground/55 ml-auto">{meta}</span>}
      </div>
      {children}
    </div>
  );
}
