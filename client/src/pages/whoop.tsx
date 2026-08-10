import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { invalidateCoachPush } from "@/lib/coach-push";
import { PageLayout } from "@/components/page-layout";
import { OfflinePlaceholder } from "@/components/offline-placeholder";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useOfflineMode } from "@/hooks/use-offline-mode";
import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Unplug, AlertTriangle, RefreshCw, ArrowRight, Activity } from "lucide-react";
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
  children: React.ReactNode;
  testId: string;
}

function ChartCard({ title, accent, accentClass, children, testId }: ChartCardProps) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5" data-testid={testId}>
      <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/45 mb-3">
        {title} <span className={accentClass}>/ {accent}</span>
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
  const [offlineModeEnabled] = useOfflineMode();
  const isOnline = useOnline();
  const { toast } = useToast();
  const offlineView = (offlineModeEnabled && !isOnline) || !isOnline;

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const onScroll = () => setScrolled(root.scrollTop > 40);
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, []);

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
      { label: "Recovery", value: rec != null ? `${Math.round(rec)}%` : "—" },
      { label: "Sleep", value: slp != null ? `${slp.toFixed(1)}h` : "—" },
      { label: "Strain", value: str != null ? str.toFixed(1) : "—" },
      { label: "HRV", value: hrv != null ? `${Math.round(hrv)}` : "—" },
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
    <div className="relative -mx-4 sm:-mx-6 px-6 pt-safe-top pb-0 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, hsl(var(--chart-2)/0.16) 0%, hsl(var(--primary)/0.04) 55%, transparent 78%)",
        }}
      />
      <div
        className={`relative flex flex-col items-center text-center transition-all duration-300 ${
          scrolled ? "pt-3 pb-4" : "pt-7 pb-7"
        }`}
      >
        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/25 bg-card/60 text-[9px] font-mono text-muted-foreground/60 tracking-[0.18em] uppercase transition-all duration-300 ${
            scrolled ? "mb-3" : "mb-6"
          }`}
        >
          <Activity className="w-3 h-3 text-emerald-400" />
          Readiness
        </div>
        <h1
          className="font-black leading-[0.94] tracking-[-0.05em] transition-all duration-300"
          style={{ fontSize: scrolled ? "clamp(22px,6vw,26px)" : "clamp(38px,10vw,48px)", marginBottom: scrolled ? "0" : "12px" }}
        >
          <span className="text-foreground">Know your </span>
          <span
            style={{
              background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--chart-4)) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            body.
          </span>
        </h1>
        {!scrolled && (
          <p className="text-[11px] text-muted-foreground/50 leading-relaxed max-w-[230px]">
            Recovery, sleep, strain and heart-rate trends from your WHOOP.
          </p>
        )}
      </div>
    </div>
  );

  // Offline: previously-loaded WHOOP data is served from the offline mirror;
  // only show the placeholder when nothing was ever cached for this range.
  if (offlineView && !data && !isLoading) {
    return (
      <PageLayout>
        {hero}
        <OfflinePlaceholder
          testId="card-offline-whoop"
          hint="WHOOP data hasn't been downloaded yet. It will be back when you reconnect."
        />
      </PageLayout>
    );
  }

  const errMessage = error instanceof Error ? error.message : "";
  const notConnected = errMessage.startsWith("503");

  const rangeSelect = (
    <div className="flex items-center justify-between mb-4 gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/40" data-testid="text-whoop-range-label">
        Last {range} days
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => disconnectMutation.mutate()}
          disabled={disconnectMutation.isPending}
          className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-white/[0.07] bg-white/[0.025] font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60 hover:bg-white/[0.06] active:scale-[0.98] transition-all disabled:opacity-50"
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
      <PageLayout>
        {hero}
        <div
          className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-8 flex flex-col items-center text-center"
          data-testid={notConnected ? "card-whoop-not-connected" : "card-whoop-error"}
        >
          {notConnected ? (
            <div className="flex items-center gap-3 mb-4" data-testid="icon-whoop-link">
              <img
                src={whoopLogoPath}
                alt="WHOOP"
                className="w-14 h-14 rounded-2xl"
                data-testid="icon-whoop-logo"
              />
              <ArrowRight className="w-6 h-6 text-muted-foreground/50" />
              <img
                src="/icon-192.png"
                alt="Trampoline Note"
                className="w-14 h-14 rounded-2xl"
                data-testid="icon-app-logo"
              />
            </div>
          ) : (
            <div className="w-12 h-12 mb-4 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
            </div>
          )}
          {notConnected ? (
            <>
              <h3 className="text-xl font-black tracking-tight mb-2">Connect WHOOP.</h3>
              <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                Sign in with your WHOOP account to see your recovery, sleep,
                strain and workout trends here. Your login happens on WHOOP&apos;s
                own page — this app never sees your WHOOP password.
              </p>
              {oauthError && (
                <p className="text-xs font-mono text-amber-400 max-w-sm mt-3" data-testid="text-whoop-oauth-error">
                  {oauthError}
                </p>
              )}
              <Button
                className="mt-5 bg-gradient-cta text-primary-foreground font-semibold rounded-xl h-10 px-5"
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
                className="mt-2 rounded-xl font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/60"
                onClick={() => refetch()}
                disabled={isRefetching}
                data-testid="button-whoop-recheck"
              >
                <RefreshCw className={cn("w-4 h-4 mr-2", isRefetching && "animate-spin")} />
                {isRefetching ? "Checking…" : "Check connection"}
              </Button>
            </>
          ) : (
            <>
              <h3 className="text-xl font-black tracking-tight mb-2">Couldn&apos;t load WHOOP data</h3>
              <p className="text-sm text-muted-foreground max-w-sm break-words leading-relaxed">
                {errMessage.replace(/^\d+:\s*/, "") || "The WHOOP service returned an error. Try again shortly."}
              </p>
            </>
          )}
        </div>
      </PageLayout>
    );
  }

  if (isLoading || !data) {
    return (
      <PageLayout>
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
    <PageLayout>
      {hero}

      {hasAny && (
        <div className="-mx-1 mb-5">
          <div className="flex divide-x divide-white/[0.06] rounded-2xl overflow-hidden border border-white/[0.07] bg-white/[0.025]">
            {summaryStats.map((s) => (
              <div key={s.label} className="flex-1 flex flex-col items-center py-3.5 gap-1">
                <span
                  className="text-[19px] font-bold tabular-nums leading-none"
                  style={{
                    background: "linear-gradient(135deg,#60a5fa,#a78bfa)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {s.value}
                </span>
                <span className="text-[8px] font-mono uppercase tracking-[0.15em] text-muted-foreground/40">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/25">
            {range}-day averages
          </p>
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
          <ChartCard title="Recovery" accent="%" accentClass="text-emerald-400" testId="card-chart-recovery">
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

          <ChartCard title="Sleep" accent="hours & quality" accentClass="text-[hsl(var(--chart-4))]" testId="card-chart-sleep">
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

          <ChartCard title="Strain" accent="daily" accentClass="text-amber-400" testId="card-chart-strain">
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

          <ChartCard title="Heart" accent="RHR & HRV" accentClass="text-rose-400" testId="card-chart-heart">
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
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/45 mb-3">
            Workouts <span className="text-orange-400">/ recent</span>
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
