import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { invalidateCoachPush } from "@/lib/coach-push";
import { PageLayout } from "@/components/page-layout";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { OfflinePlaceholder } from "@/components/offline-placeholder";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Unplug, AlertTriangle, RefreshCw, Lock, HeartPulse, Heart, Moon, Zap, Activity } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, parseISO, subDays } from "date-fns";
import whoopLogoPath from "@assets/image_1784922999270.png";

type WhoopRange = 7 | 30 | 90 | 180;

interface WhoopData {
  recovery: Array<{ date: string; recoveryScore: number | null; restingHeartRate: number | null; hrvMs: number | null }>;
  sleep: Array<{ date: string; start: string; end: string; nap: boolean; asleepHours: number | null; performancePct: number | null }>;
  cycles: Array<{ date: string; strain: number | null; avgHeartRate: number | null; maxHeartRate: number | null }>;
  workouts: Array<{ id: string; sport: string; start: string; end: string; durationMin: number; strain: number | null; avgHeartRate: number | null }>;
}

// ── Sample data for the unlinked state ──
// Deterministic per-date PRNG so the preview doesn't reshuffle on every
// render/refetch, and overlapping ranges (7/30/90/180) agree with each other.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function generateSampleWhoopData(days: number): WhoopData {
  const recovery: WhoopData["recovery"] = [];
  const sleep: WhoopData["sleep"] = [];
  const cycles: WhoopData["cycles"] = [];
  const workouts: WhoopData["workouts"] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const day = subDays(today, i);
    const date = format(day, "yyyy-MM-dd");
    const d = Math.floor(day.getTime() / 86_400_000); // day index since epoch = per-date seed
    const rng = mulberry32(d * 2654435761);

    // Slow overlapping waves + per-day noise → organic-looking trends.
    const rec = clamp(62 + 16 * Math.sin(d / 3.9) + 10 * Math.sin(d / 11.3) + (rng() - 0.5) * 16, 22, 98);
    const hrv = clamp(58 + (rec - 50) * 0.55 + (rng() - 0.5) * 14, 38, 125);
    const rhr = clamp(55 - (rec - 50) * 0.09 + (rng() - 0.5) * 3, 45, 62);
    recovery.push({ date, recoveryScore: Math.round(rec), restingHeartRate: Math.round(rhr), hrvMs: Math.round(hrv) });

    const rough = rng() < 0.14; // the odd short night
    const asleepH = rough ? 4.6 + rng() * 1.4 : 6.4 + rng() * 2.2;
    const perf = clamp(Math.round(52 + asleepH * 5.5 + (rng() - 0.5) * 10), 48, 99);
    const bed = new Date(day);
    bed.setDate(bed.getDate() - 1);
    bed.setHours(21, 40 + Math.round(rng() * 110), 0, 0); // 21:40 – 23:30
    const wake = new Date(bed.getTime() + (asleepH + 0.4 + rng() * 0.5) * 3_600_000);
    sleep.push({
      date,
      start: bed.toISOString(),
      end: wake.toISOString(),
      nap: false,
      asleepHours: Math.round(asleepH * 10) / 10,
      performancePct: perf,
    });

    const restDay = rng() < 0.2;
    const strain = restDay ? 3 + rng() * 3.5 : 7.5 + rng() * 9;
    const avgHr = clamp(88 + strain * 2.6 + (rng() - 0.5) * 8, 80, 150);
    const maxHr = clamp(avgHr + 35 + rng() * 25, 120, 196);
    cycles.push({ date, strain: Math.round(strain * 10) / 10, avgHeartRate: Math.round(avgHr), maxHeartRate: Math.round(maxHr) });

    if (!restDay && rng() < 0.85) {
      const sports = ["Trampolining", "Trampolining", "Strength", "Running", "Mobility"];
      const sport = sports[Math.floor(rng() * sports.length)];
      const startAt = new Date(day);
      startAt.setHours(16 + Math.floor(rng() * 3), Math.round(rng() * 59), 0, 0);
      const durationMin = Math.round(45 + rng() * 70);
      workouts.push({
        id: `sample-${date}`,
        sport,
        start: startAt.toISOString(),
        end: new Date(startAt.getTime() + durationMin * 60_000).toISOString(),
        durationMin,
        strain: Math.round(clamp(strain * (0.65 + rng() * 0.3), 2, 19) * 10) / 10,
        avgHeartRate: Math.round(avgHr + 8 + rng() * 10),
      });
    }
  }
  workouts.reverse(); // newest first, matching the API
  return { recovery, sleep, cycles, workouts };
}

const tooltipStyle = {
  borderRadius: "12px",
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  color: "hsl(var(--foreground))",
  boxShadow: "0 10px 25px -5px rgba(0,0,0,0.5)",
  fontFamily: "var(--font-mono)",
  fontSize: "12px",
} as const;

function AxisTick(props: any) {
  const { x, y, payload, index, visibleTicksCount } = props;
  const v = payload?.value;
  if (!v) return null;
  let label = v;
  try {
    label = format(parseISO(v), "d MMM");
  } catch {}
  const anchor = index === 0 ? "start" : index === visibleTicksCount - 1 ? "end" : "middle";
  return (
    <text x={x} y={y} dy={12} textAnchor={anchor} fill="hsl(var(--muted-foreground))" fontSize={10} fontFamily="var(--font-mono)">
      {label}
    </text>
  );
}

function dateLabel(v: string) {
  try {
    return format(parseISO(v), "d MMM yyyy");
  } catch {
    return v;
  }
}

interface ChartCardProps {
  title: string;
  accent: string;
  accentClass: string;
  icon: typeof Heart;
  iconColor: string;
  figure?: string;
  children: React.ReactNode;
  testId: string;
}

function ChartCard({ title, accent, accentClass, icon: Icon, iconColor, figure, children, testId }: ChartCardProps) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5" data-testid={testId}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.06] shrink-0">
            <Icon className={cn("w-4 h-4", iconColor)} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight leading-none truncate">{title}</div>
            <div className={cn("font-mono text-[9px] uppercase tracking-[0.16em] mt-1", accentClass)}>{accent}</div>
          </div>
        </div>
        {figure && (
          <span className="font-mono text-lg tabular-nums font-semibold text-foreground/80 shrink-0">{figure}</span>
        )}
      </div>
      <div className="h-[200px] w-full">{children}</div>
    </div>
  );
}

// Messages for the ?whoop=... status the OAuth callback redirects back with.
const OAUTH_MESSAGES: Record<string, string> = {
  denied: "WHOOP sign-in was cancelled. Nothing was linked.",
  state_mismatch: "The sign-in attempt expired or didn't match. Please try again.",
  link_failed: "WHOOP sign-in failed while finishing the link. Please try again.",
  not_configured: "WHOOP sign-in isn't configured yet — the app owner needs to add the WHOOP app credentials.",
};

export default function WhoopPage() {
  const [range, setRange] = useState<WhoopRange>(30);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const isOnline = useOnline();
  const { toast } = useToast();
  const offlineView = !isOnline;

  // Pick up the OAuth result the callback redirect put in the URL, then clean it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("whoop");
    if (!status) return;
    if (status === "connected") {
      toast({ title: "WHOOP connected", description: "Your WHOOP data is loading." });
      // Recovery data just became available — make the Coach card refetch a
      // freshly generated recommendation instead of its cached copy.
      invalidateCoachPush(queryClient);
    } else if (OAUTH_MESSAGES[status]) {
      setOauthError(OAUTH_MESSAGES[status]);
    }
    params.delete("whoop");
    const rest = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading, error, refetch, isRefetching } = useQuery<WhoopData>({
    queryKey: ["/api/whoop/data", range],
    staleTime: 5 * 60 * 1000,
  });

  const errMessage = error instanceof Error ? error.message : "";
  const notConnected = errMessage.startsWith("503");
  // No WHOOP linked → show the dashboard filled with generated sample data,
  // clearly labelled, with the sign-in entry in a banner instead of a wall.
  // A 503 is the server's authoritative "no account linked", so it wins over
  // any stale cached data — never present old real data as current.
  const sampleData = useMemo(() => generateSampleWhoopData(range), [range]);
  const demoMode = notConnected;
  const whoop = demoMode ? sampleData : data;

  // Self-heal when connectivity returns: if the last attempt failed and the
  // online signal flips back on, fetch again instead of stranding the page
  // on the offline card until an app restart.
  useEffect(() => {
    if (isOnline && !data && !isLoading && !isRefetching) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // ── Summary stat strip: range-average figures across the trends ──
  // Computed before any early return so hook order stays stable.
  const summaryStats = useMemo(() => {
    const recoveryData = (whoop?.recovery ?? []).filter(
      (r) => r.recoveryScore != null || r.hrvMs != null || r.restingHeartRate != null,
    );
    const sleepData = (whoop?.sleep ?? []).filter(
      (s) => !s.nap && (s.asleepHours != null || s.performancePct != null),
    );
    const strainData = (whoop?.cycles ?? []).filter((c) => c.strain != null);
    const avg = (nums: Array<number | null | undefined>) => {
      const vals = nums.filter((n): n is number => n != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const rec = avg(recoveryData.map((r) => r.recoveryScore));
    const slp = avg(sleepData.map((s) => s.asleepHours));
    const str = avg(strainData.map((c) => c.strain));
    const hrv = avg(recoveryData.map((r) => r.hrvMs));
    return [
      { label: "Recovery", value: rec != null ? `${Math.round(rec)}%` : "—", accent: "page" as const, testId: "stat-whoop-recovery" },
      { label: "Sleep", value: slp != null ? `${slp.toFixed(1)}h` : "—", accent: "page" as const, testId: "stat-whoop-sleep" },
      { label: "Strain", value: str != null ? str.toFixed(1) : "—", accent: "page" as const, testId: "stat-whoop-strain" },
      { label: "HRV", value: hrv != null ? `${Math.round(hrv)}` : "—", accent: "page" as const, testId: "stat-whoop-hrv" },
    ];
  }, [whoop]);

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/whoop/disconnect");
    },
    onSuccess: () => {
      // Reset (not just invalidate) so no stale real data survives the unlink —
      // the refetch 503s and the page lands cleanly in sample mode.
      queryClient.resetQueries({ queryKey: ["/api/whoop/data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whoop/daily"] });
      invalidateCoachPush(queryClient);
      toast({ title: "WHOOP disconnected", description: "Your WHOOP account was unlinked." });
    },
  });

  // ── Bold hero (replaces PageHeader; no back-nav on this top-level page) ──
  const hero = (
    <PageHeader
      kicker="WHOOP · Body"
      title="Listen to your body."
      accent="body."
      subtitle="Recovery, sleep, strain and heart — the signals underneath every session."
    />
  );

  // Offline: previously-loaded WHOOP data is served from the offline mirror;
  // only show the placeholder when nothing was ever cached for this range.
  if (offlineView && !data && !isLoading) {
    return (
      <PageLayout accent="whoop">
        {hero}
        <OfflinePlaceholder
          testId="card-offline-whoop"
          hint="WHOOP data hasn't been downloaded yet. It will be back when you reconnect."
          onRetry={() => refetch()}
          retrying={isRefetching}
        />
      </PageLayout>
    );
  }

  // Breaks out of the preview iframe: WHOOP's login page refuses to render
  // inside one, so navigate the top-level window (new tab if that's blocked).
  const signInWithWhoop = () => {
    const url = "/api/whoop/auth";
    const framed = window.self !== window.top;
    if (framed) {
      try {
        window.top!.location.href = url;
      } catch {
        window.open(url, "_blank", "noopener");
      }
    } else {
      window.location.href = url;
    }
  };

  const rangeSelect = (
    <div className="flex items-center justify-between mb-4 gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60" data-testid="text-whoop-range-label">
        Last {range} days
      </span>
      <div className="flex items-center gap-2">
        {!demoMode && (
          <button
            type="button"
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-white/[0.07] bg-white/[0.025] font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60 hover:bg-white/[0.06] pressable disabled:opacity-50"
            data-testid="button-whoop-disconnect"
          >
            <Unplug className="w-3.5 h-3.5" />
            {disconnectMutation.isPending ? "Unlinking…" : "Disconnect"}
          </button>
        )}
        <Select value={String(range)} onValueChange={(v) => setRange(Number(v) as WhoopRange)}>
          <SelectTrigger className="w-[130px] h-8 rounded-xl text-xs border-white/[0.07] bg-white/[0.025] font-mono" data-testid="select-whoop-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="font-mono">
            <SelectItem value="7">Week</SelectItem>
            <SelectItem value="30">Month</SelectItem>
            <SelectItem value="90">3 Months</SelectItem>
            <SelectItem value="180">6 Months</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  if (error && !notConnected) {
    return (
      <PageLayout accent="whoop">
        {hero}
        <div
          className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-8 flex flex-col items-center text-center"
          data-testid="card-whoop-error"
        >
          <div className="w-12 h-12 mb-4 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
          </div>
          <h3 className="text-xl font-black tracking-tight mb-2">Couldn&apos;t load WHOOP data</h3>
          <p className="text-sm text-muted-foreground max-w-sm break-words leading-relaxed">
            {errMessage.replace(/^\d+:\s*/, "") || "The WHOOP service returned an error. Try again shortly."}
          </p>
        </div>
      </PageLayout>
    );
  }

  if (isLoading || !whoop) {
    return (
      <PageLayout accent="whoop">
        {hero}
        {rangeSelect}
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[260px] rounded-2xl" data-testid={`skeleton-whoop-${i}`} />
          ))}
        </div>
      </PageLayout>
    );
  }

  const recoveryData = whoop.recovery.filter((r) => r.recoveryScore != null || r.hrvMs != null || r.restingHeartRate != null);
  const sleepData = whoop.sleep.filter((s) => !s.nap && (s.asleepHours != null || s.performancePct != null));
  const strainData = whoop.cycles.filter((c) => c.strain != null);
  const hasAny =
    recoveryData.length > 0 || sleepData.length > 0 || strainData.length > 0 || whoop.workouts.length > 0;

  return (
    <PageLayout accent="whoop">
      {hero}

      {demoMode && (
        <div
          className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5 mb-6"
          data-testid="card-whoop-sample-banner"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -left-8 -top-10 h-32 w-32 rounded-full blur-2xl"
            style={{ background: "radial-gradient(circle, hsl(var(--page-accent) / 0.18) 0%, transparent 70%)" }}
          />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <img src={whoopLogoPath} alt="WHOOP" className="w-10 h-10 rounded-xl border border-white/[0.08] shrink-0" />
              <div className="min-w-0">
                <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[hsl(var(--page-accent)/0.8)]">
                  Sample data
                </div>
                <p className="text-sm text-muted-foreground leading-snug mt-1">
                  These numbers are made up. Sign in with WHOOP to see your own recovery, sleep and strain here.
                </p>
                {oauthError && (
                  <p className="text-xs font-mono text-amber-400 mt-2" data-testid="text-whoop-oauth-error">
                    {oauthError}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 sm:self-center">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/60"
                onClick={() => refetch()}
                disabled={isRefetching}
                data-testid="button-whoop-recheck"
                aria-label="Check connection"
              >
                <RefreshCw className={cn("w-4 h-4", isRefetching && "animate-spin")} />
              </Button>
              <Button
                className="bg-gradient-cta text-primary-foreground font-semibold rounded-xl h-10 px-5 pressable"
                onClick={signInWithWhoop}
                data-testid="button-whoop-signin"
              >
                Sign in with WHOOP
              </Button>
            </div>
          </div>
          <p className="relative flex items-center gap-1.5 mt-3 text-[11px] text-muted-foreground">
            <Lock className="w-3 h-3 shrink-0" />
            Sign-in happens on WHOOP&apos;s own page — this app never sees your password.
          </p>
        </div>
      )}

      {hasAny && (
        <div className="mb-6">
          {/* Physiological opening gesture — a body pulse in the page's rose
              identity, sitting above the vitals band. */}
          <div className="relative flex items-center gap-4 pb-5">
            <div
              aria-hidden
              className="pointer-events-none absolute -left-6 -top-8 h-40 w-40 rounded-full blur-2xl"
              style={{ background: "radial-gradient(circle, hsl(var(--page-accent) / 0.18) 0%, transparent 70%)" }}
            />
            <div className="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-[hsl(var(--page-accent)/0.1)] border border-[hsl(var(--page-accent)/0.2)] shrink-0">
              <HeartPulse className="w-5 h-5 text-[hsl(var(--page-accent)/0.9)]" />
            </div>
            <div className="relative min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--page-accent)/0.7)]">
                {range}-Day Vitals
              </p>
              <p className="text-sm text-muted-foreground/70 leading-snug mt-0.5">
                Your rolling averages — the baseline every session pushes against.
              </p>
            </div>
          </div>
          <StatStrip accent="page" items={summaryStats} />
        </div>
      )}

      {rangeSelect}

      {!hasAny ? (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-8 text-center" data-testid="card-whoop-empty">
          <h3 className="text-lg font-black tracking-tight mb-1.5">No WHOOP data in this range</h3>
          <p className="text-sm text-muted-foreground">Try a longer time range, or check that your WHOOP has synced recently.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <ChartCard title="Recovery" accent="daily %" accentClass="text-emerald-400/70" icon={Zap} iconColor="text-emerald-400" figure={summaryStats[0].value} testId="card-chart-recovery">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={recoveryData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="whoopRecoveryFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={<AxisTick />} interval="preserveStartEnd" />
                <YAxis hide domain={[0, 100]} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={dateLabel}
                  formatter={(v: any) => [`${Math.round(Number(v))} %`, "Recovery"]}
                  cursor={{ stroke: "hsl(var(--primary) / 0.3)", strokeWidth: 1 }}
                />
                <Area type="monotone" dataKey="recoveryScore" stroke="hsl(var(--chart-2))" strokeWidth={2} fill="url(#whoopRecoveryFill)" connectNulls dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Sleep" accent="hours & quality" accentClass="text-[hsl(var(--chart-4))]/70" icon={Moon} iconColor="text-[hsl(var(--chart-4))]" figure={summaryStats[1].value} testId="card-chart-sleep">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sleepData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="whoopSleepFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-4))" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="hsl(var(--chart-4))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="whoopSleepPerfFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.08} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={<AxisTick />} interval="preserveStartEnd" />
                <YAxis yAxisId="h" hide domain={[0, 12]} />
                <YAxis yAxisId="p" hide domain={[0, 100]} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={dateLabel}
                  formatter={(v: any, name: any) =>
                    name === "Sleep (h)" ? [`${Number(v).toFixed(1)} h`, name] : [`${Math.round(Number(v))} %`, name]
                  }
                  cursor={{ stroke: "hsl(var(--primary) / 0.3)", strokeWidth: 1 }}
                />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-mono)" }} />
                <Area yAxisId="h" name="Sleep (h)" type="monotone" dataKey="asleepHours" stroke="hsl(var(--chart-4))" strokeWidth={2} fill="url(#whoopSleepFill)" connectNulls dot={false} activeDot={{ r: 4 }} />
                <Area yAxisId="p" name="Performance %" type="monotone" dataKey="performancePct" stroke="hsl(var(--chart-1))" strokeWidth={1.5} strokeDasharray="4 3" fill="url(#whoopSleepPerfFill)" connectNulls dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Strain" accent="daily load" accentClass="text-amber-400/70" icon={Activity} iconColor="text-amber-400" figure={summaryStats[2].value} testId="card-chart-strain">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={strainData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="whoopStrainFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={<AxisTick />} interval="preserveStartEnd" />
                <YAxis hide domain={[0, 21]} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={dateLabel}
                  formatter={(v: any) => [Number(v).toFixed(1), "Strain"]}
                  cursor={{ stroke: "hsl(var(--primary) / 0.3)", strokeWidth: 1 }}
                />
                <Area type="monotone" dataKey="strain" stroke="hsl(var(--chart-3))" strokeWidth={2} fill="url(#whoopStrainFill)" connectNulls dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Heart" accent="RHR & HRV" accentClass="text-[hsl(var(--page-accent)/0.7)]" icon={Heart} iconColor="text-[hsl(var(--page-accent))]" figure={summaryStats[3].value} testId="card-chart-heart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={recoveryData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="whoopRhrFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-5))" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="hsl(var(--chart-5))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="whoopHrvFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.08} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={<AxisTick />} interval="preserveStartEnd" />
                <YAxis yAxisId="rhr" hide domain={["dataMin - 5", "dataMax + 5"]} />
                <YAxis yAxisId="hrv" hide domain={["dataMin - 10", "dataMax + 10"]} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={dateLabel}
                  formatter={(v: any, name: any) =>
                    name === "RHR (bpm)" ? [`${Math.round(Number(v))} bpm`, name] : [`${Math.round(Number(v))} ms`, name]
                  }
                  cursor={{ stroke: "hsl(var(--primary) / 0.3)", strokeWidth: 1 }}
                />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-mono)" }} />
                <Area yAxisId="rhr" name="RHR (bpm)" type="monotone" dataKey="restingHeartRate" stroke="hsl(var(--chart-5))" strokeWidth={2} fill="url(#whoopRhrFill)" connectNulls dot={false} activeDot={{ r: 4 }} />
                <Area yAxisId="hrv" name="HRV (ms)" type="monotone" dataKey="hrvMs" stroke="hsl(var(--chart-1))" strokeWidth={1.5} strokeDasharray="4 3" fill="url(#whoopHrvFill)" connectNulls dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {whoop.workouts.length > 0 && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 mt-4" data-testid="card-whoop-workouts">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-[hsl(var(--page-accent)/0.1)] border border-[hsl(var(--page-accent)/0.2)] shrink-0">
              <Activity className="w-4 h-4 text-[hsl(var(--page-accent))]" />
            </span>
            <div>
              <div className="text-sm font-semibold tracking-tight leading-none">Workouts</div>
              <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[hsl(var(--page-accent)/0.7)] mt-1">Recent effort</div>
            </div>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {whoop.workouts.slice(0, 20).map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-3 py-3" data-testid={`row-workout-${w.id}`}>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate" data-testid={`text-workout-sport-${w.id}`}>{w.sport}</div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.1em] text-muted-foreground/50">
                    {dateLabel(w.start)} · {w.durationMin} min
                    {w.avgHeartRate != null ? ` · ${Math.round(w.avgHeartRate)} bpm avg` : ""}
                  </div>
                </div>
                <div
                  className={cn(
                    "font-mono text-sm tabular-nums shrink-0",
                    w.strain != null && w.strain >= 14 ? "text-amber-400" : "text-muted-foreground/50",
                  )}
                  data-testid={`text-workout-strain-${w.id}`}
                >
                  {w.strain != null ? `${w.strain.toFixed(1)} strain` : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageLayout>
  );
}
