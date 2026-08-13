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
import { format, parseISO } from "date-fns";
import whoopLogoPath from "@assets/image_1784922999270.png";

type WhoopRange = 7 | 30 | 90 | 180;

interface WhoopData {
  recovery: Array<{ date: string; recoveryScore: number | null; restingHeartRate: number | null; hrvMs: number | null }>;
  sleep: Array<{ date: string; start: string; end: string; nap: boolean; asleepHours: number | null; performancePct: number | null }>;
  cycles: Array<{ date: string; strain: number | null; avgHeartRate: number | null; maxHeartRate: number | null }>;
  workouts: Array<{ id: string; sport: string; start: string; end: string; durationMin: number; strain: number | null; avgHeartRate: number | null }>;
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
    const recoveryData = (data?.recovery ?? []).filter(
      (r) => r.recoveryScore != null || r.hrvMs != null || r.restingHeartRate != null,
    );
    const sleepData = (data?.sleep ?? []).filter(
      (s) => !s.nap && (s.asleepHours != null || s.performancePct != null),
    );
    const strainData = (data?.cycles ?? []).filter((c) => c.strain != null);
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
  }, [data]);

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/whoop/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whoop/data"] });
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

  const errMessage = error instanceof Error ? error.message : "";
  const notConnected = errMessage.startsWith("503");

  const rangeSelect = (
    <div className="flex items-center justify-between mb-4 gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60" data-testid="text-whoop-range-label">
        Last {range} days
      </span>
      <div className="flex items-center gap-2">
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

  if (error) {
    return (
      <PageLayout accent="whoop">
        {hero}
        {notConnected ? (
          <div
            className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] px-5 py-10 sm:p-10 flex flex-col items-center text-center"
            data-testid="card-whoop-not-connected"
          >
            {/* Rose body-pulse glow — the same identity device the connected
                vitals band uses, so the empty state already belongs to the page. */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-16 h-52 w-52 rounded-full blur-2xl"
              style={{ background: "radial-gradient(circle, hsl(var(--page-accent) / 0.2) 0%, transparent 70%)" }}
            />

            {/* The handoff: WHOOP's signal flowing into the app. */}
            <div className="relative flex items-center gap-2.5 mb-6" data-testid="icon-whoop-link">
              <img
                src={whoopLogoPath}
                alt="WHOOP"
                className="w-14 h-14 rounded-2xl border border-white/[0.08]"
                data-testid="icon-whoop-logo"
              />
              <svg
                width="72"
                height="24"
                viewBox="0 0 72 24"
                fill="none"
                aria-hidden
                className="text-[hsl(var(--page-accent))] animate-pulse motion-reduce:animate-none"
              >
                <path
                  d="M0 12 H22 L28 12 L32 4 L38 20 L42 12 H72"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.8"
                />
              </svg>
              <img
                src="/icon-192.png"
                alt="Trampoline Note"
                className="w-14 h-14 rounded-2xl border border-white/[0.08]"
                data-testid="icon-app-logo"
              />
            </div>

            <h3 className="relative text-2xl font-black tracking-tight mb-2">
              Connect WHOOP<span className="text-[hsl(var(--page-accent))]">.</span>
            </h3>
            <p className="relative text-sm text-muted-foreground max-w-sm leading-relaxed">
              Recovery, sleep, strain and heart — next to every session you log.
            </p>
            {oauthError && (
              <p className="relative text-xs font-mono text-amber-400 max-w-sm mt-3" data-testid="text-whoop-oauth-error">
                {oauthError}
              </p>
            )}

            {/* Ghosted vitals strip — exactly what appears once linked. Purely
                decorative preview (placeholder dashes), so hidden from AT. */}
            <div aria-hidden className="relative w-full max-w-md grid grid-cols-4 border-y border-white/[0.06] divide-x divide-white/[0.05] py-3.5 my-7">
              {[
                { icon: Zap, color: "text-emerald-400/60", label: "Recovery" },
                { icon: Moon, color: "text-[hsl(var(--chart-4)/0.6)]", label: "Sleep" },
                { icon: Activity, color: "text-amber-400/60", label: "Strain" },
                { icon: Heart, color: "text-[hsl(var(--page-accent)/0.6)]", label: "HRV" },
              ].map(({ icon: Icon, color, label }) => (
                <div key={label} className="flex flex-col items-center gap-1.5 px-1 min-w-0">
                  <Icon className={cn("w-3.5 h-3.5", color)} />
                  <span className="text-base font-extrabold tracking-[-0.04em] leading-none tabular-nums text-foreground/25">
                    —
                  </span>
                  <span className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.14em] text-muted-foreground truncate w-full">
                    {label}
                  </span>
                </div>
              ))}
            </div>

            <Button
              className="relative bg-gradient-cta text-primary-foreground font-semibold rounded-xl h-11 px-6 pressable"
              onClick={() => {
                // WHOOP's login page refuses to load inside an iframe (e.g. the
                // Replit preview pane), so break out to the top-level window —
                // falling back to a new tab if top navigation is blocked.
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
              }}
              data-testid="button-whoop-signin"
            >
              Sign in with WHOOP
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="relative mt-2 rounded-xl font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/60"
              onClick={() => refetch()}
              disabled={isRefetching}
              data-testid="button-whoop-recheck"
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", isRefetching && "animate-spin")} />
              {isRefetching ? "Checking…" : "Check connection"}
            </Button>

            <p className="relative flex items-center gap-1.5 mt-6 text-[11px] text-muted-foreground">
              <Lock className="w-3 h-3 shrink-0" />
              Sign-in happens on WHOOP&apos;s own page — this app never sees your password.
            </p>
          </div>
        ) : (
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
        )}
      </PageLayout>
    );
  }

  if (isLoading || !data) {
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

  const recoveryData = data.recovery.filter((r) => r.recoveryScore != null || r.hrvMs != null || r.restingHeartRate != null);
  const sleepData = data.sleep.filter((s) => !s.nap && (s.asleepHours != null || s.performancePct != null));
  const strainData = data.cycles.filter((c) => c.strain != null);
  const hasAny =
    recoveryData.length > 0 || sleepData.length > 0 || strainData.length > 0 || data.workouts.length > 0;

  return (
    <PageLayout accent="whoop">
      {hero}

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

      {data.workouts.length > 0 && (
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
            {data.workouts.slice(0, 20).map((w) => (
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
