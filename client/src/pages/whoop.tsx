import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { invalidateCoachPush } from "@/lib/coach-push";
import { PageLayout } from "@/components/page-layout";
import { PageHeader } from "@/components/page-header";
import { OfflinePlaceholder } from "@/components/offline-placeholder";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useOfflineMode } from "@/hooks/use-offline-mode";
import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Unplug, AlertTriangle, RefreshCw, ArrowRight } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
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
    <div className="card-3d rounded-2xl p-5" data-testid={testId}>
      <div className="eyebrow mb-3">
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

  const header = (
    <PageHeader
      eyebrow="Readiness"
      title="WHOOP Data"
      accent="Data"
      subtitle="Recovery, sleep, strain and heart-rate trends from your WHOOP."
    />
  );

  // Offline: previously-loaded WHOOP data is served from the offline mirror;
  // only show the placeholder when nothing was ever cached for this range.
  if (offlineView && !data && !isLoading) {
    return (
      <PageLayout>
        {header}
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
      <span className="text-xs font-mono text-muted-foreground" data-testid="text-whoop-range-label">
        Last {range} days
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 rounded-xl font-mono text-xs text-muted-foreground"
          onClick={() => disconnectMutation.mutate()}
          disabled={disconnectMutation.isPending}
          data-testid="button-whoop-disconnect"
        >
          <Unplug className="w-3.5 h-3.5 mr-1.5" />
          {disconnectMutation.isPending ? "Unlinking…" : "Disconnect"}
        </Button>
        <Select value={String(range)} onValueChange={(v) => setRange(Number(v) as WhoopRange)}>
          <SelectTrigger className="w-[130px] h-8 rounded-xl text-xs border-white/[0.07] font-mono" data-testid="select-whoop-range">
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
        {header}
        <div className="rounded-2xl card-3d p-8 flex flex-col items-center text-center" data-testid={notConnected ? "card-whoop-not-connected" : "card-whoop-error"}>
          {notConnected ? (
            <div className="flex items-center gap-3 mb-4" data-testid="icon-whoop-link">
              <img
                src={whoopLogoPath}
                alt="WHOOP"
                className="w-14 h-14 rounded-2xl shadow-black/40"
                data-testid="icon-whoop-logo"
              />
              <ArrowRight className="w-6 h-6 text-muted-foreground" />
              <img
                src="/icon-192.png"
                alt="Trampoline Note"
                className="w-14 h-14 rounded-2xl shadow-black/40"
                data-testid="icon-app-logo"
              />
            </div>
          ) : (
            <div className="w-12 h-12 mb-4 rounded-full bg-white/[0.03] flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
            </div>
          )}
          {notConnected ? (
            <>
              <p className="font-semibold mb-1">Connect WHOOP to see your dashboard</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Sign in with your WHOOP account to see your recovery, sleep,
                strain and workout trends here. Your login happens on WHOOP's
                own page — this app never sees your WHOOP password.
              </p>
              {oauthError && (
                <p className="text-xs font-mono text-amber-400 max-w-sm mt-3" data-testid="text-whoop-oauth-error">
                  {oauthError}
                </p>
              )}
              <Button
                size="sm"
                className="mt-4 rounded-xl font-mono"
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
                className="mt-2 rounded-xl font-mono text-muted-foreground"
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
              <p className="font-semibold mb-1">Couldn't load WHOOP data</p>
              <p className="text-sm text-muted-foreground max-w-sm break-words">
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
        {header}
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
      {header}
      {rangeSelect}

      {!hasAny ? (
        <div className="rounded-2xl card-3d p-8 text-center" data-testid="card-whoop-empty">
          <p className="font-semibold mb-1">No WHOOP data in this range</p>
          <p className="text-sm text-muted-foreground">Try a longer time range, or check that your WHOOP has synced recently.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <ChartCard title="Recovery" accent="%" accentClass="text-emerald-400" testId="card-chart-recovery">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={recoveryData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={<AxisTick />} interval="preserveStartEnd" />
                <YAxis hide domain={[0, 100]} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={dateLabel}
                  formatter={(v: any) => [`${Math.round(Number(v))} %`, "Recovery"]}
                  cursor={{ stroke: "hsl(var(--primary) / 0.3)", strokeWidth: 1 }}
                />
                <Line type="monotone" dataKey="recoveryScore" stroke="hsl(var(--chart-2))" strokeWidth={2} connectNulls dot={{ r: recoveryData.length > 60 ? 0 : 2, fill: "hsl(var(--chart-2))", strokeWidth: 0 }} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Sleep" accent="hours & quality" accentClass="text-[hsl(var(--chart-4))]" testId="card-chart-sleep">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sleepData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
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
                <Line yAxisId="h" name="Sleep (h)" type="monotone" dataKey="asleepHours" stroke="hsl(var(--chart-4))" strokeWidth={2} connectNulls dot={false} activeDot={{ r: 4 }} />
                <Line yAxisId="p" name="Performance %" type="monotone" dataKey="performancePct" stroke="hsl(var(--chart-1))" strokeWidth={1.5} strokeDasharray="4 3" connectNulls dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Strain" accent="daily" accentClass="text-amber-400" testId="card-chart-strain">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={strainData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={<AxisTick />} interval="preserveStartEnd" />
                <YAxis hide domain={[0, 21]} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={dateLabel}
                  formatter={(v: any) => [Number(v).toFixed(1), "Strain"]}
                  cursor={{ stroke: "hsl(var(--primary) / 0.3)", strokeWidth: 1 }}
                />
                <Line type="monotone" dataKey="strain" stroke="hsl(var(--chart-3))" strokeWidth={2} connectNulls dot={{ r: strainData.length > 60 ? 0 : 2, fill: "hsl(var(--chart-3))", strokeWidth: 0 }} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Heart" accent="RHR & HRV" accentClass="text-rose-400" testId="card-chart-heart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={recoveryData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
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
                <Line yAxisId="rhr" name="RHR (bpm)" type="monotone" dataKey="restingHeartRate" stroke="hsl(var(--chart-5))" strokeWidth={2} connectNulls dot={false} activeDot={{ r: 4 }} />
                <Line yAxisId="hrv" name="HRV (ms)" type="monotone" dataKey="hrvMs" stroke="hsl(var(--chart-1))" strokeWidth={1.5} strokeDasharray="4 3" connectNulls dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {data.workouts.length > 0 && (
        <div className="card-3d rounded-2xl p-5 mt-4" data-testid="card-whoop-workouts">
          <div className="eyebrow mb-3">
            Workouts <span className="text-orange-400">/ recent</span>
          </div>
          <div className="divide-y divide-border/50">
            {data.workouts.slice(0, 20).map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-3 py-3" data-testid={`row-workout-${w.id}`}>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate" data-testid={`text-workout-sport-${w.id}`}>{w.sport}</div>
                  <div className="text-[11px] font-mono text-muted-foreground">
                    {dateLabel(w.start)} · {w.durationMin} min
                    {w.avgHeartRate != null ? ` · ${Math.round(w.avgHeartRate)} bpm avg` : ""}
                  </div>
                </div>
                <div
                  className={cn(
                    "font-mono text-sm shrink-0",
                    w.strain != null && w.strain >= 14 ? "text-amber-400" : "text-muted-foreground",
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
