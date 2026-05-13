import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { OfflinePlaceholder } from "@/components/offline-placeholder";
import { useOfflineMode } from "@/hooks/use-offline-mode";
import { useOnline } from "@/hooks/use-online";
import {
  format, parseISO, eachDayOfInterval,
  startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear,
  addWeeks, addMonths, addYears,
} from "date-fns";

type Range = "week" | "month" | "year" | "all";
type DailyDDPoint = { date: string; difficulty: number; sessions: number };

// How long to keep a non-current-or-prior week range cached on the device.
// Current week + last week stay cached the full session; everything else
// (other weeks, months, years, all-time) is dropped 30 s after the user
// navigates away from it so the device doesn't hold a year of data.
const SHORT_GC_MS = 30 * 1000;
const LONG_GC_MS = 60 * 60 * 1000;

function rangeBounds(range: Range, offset: number, today: Date) {
  if (range === "week") {
    const baseMonday = startOfWeek(today, { weekStartsOn: 1 });
    const weekStart = addWeeks(baseMonday, offset);
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    return { from: weekStart, to: weekEnd };
  }
  if (range === "month") {
    const ref = addMonths(today, offset);
    return { from: startOfMonth(ref), to: endOfMonth(ref) };
  }
  if (range === "year") {
    const ref = addYears(today, offset);
    return { from: startOfYear(ref), to: endOfYear(ref) };
  }
  // "all" — use a wide window starting in 2000.
  return { from: new Date(2000, 0, 1), to: today };
}

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export default function StatsPage() {
  const [range, setRange] = useState<Range>("week");
  const [offset, setOffset] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const [offlineModeEnabled] = useOfflineMode();
  const isOnline = useOnline();
  const offlineView = offlineModeEnabled && !isOnline;
  const queryClient = useQueryClient();

  const today = useMemo(() => startOfDay(new Date()), []);
  const { from, to } = useMemo(
    () => rangeBounds(range, offset, today),
    [range, offset, today],
  );
  const fromKey = ymd(from);
  const toKey = ymd(to);

  // Keep current week and previous week cached for the full session;
  // everything else expires quickly so old data doesn't stay on the device.
  const isRecentWeek = range === "week" && (offset === 0 || offset === -1);
  const gcTime = isRecentWeek ? LONG_GC_MS : SHORT_GC_MS;

  const { data, isLoading } = useQuery<DailyDDPoint[]>({
    queryKey: ["/api/stats/daily-dd", fromKey, toKey],
    queryFn: async () => {
      const res = await fetch(
        `/api/stats/daily-dd?from=${fromKey}&to=${toKey}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: !offlineView,
    staleTime: 5 * 60 * 1000,
    gcTime,
  });

  const ddByDate = useMemo(() => {
    const acc: Record<string, { difficulty: number; sessions: number }> = {};
    (data || []).forEach((p) => {
      acc[p.date] = { difficulty: p.difficulty, sessions: p.sessions };
    });
    return acc;
  }, [data]);

  // Prefetch last week as soon as the user opens the page on the current
  // week, so flipping back is instant without keeping older ranges cached.
  useEffect(() => {
    if (offlineView) return;
    if (range !== "week" || offset !== 0) return;
    const prev = rangeBounds("week", -1, today);
    const prevFrom = ymd(prev.from);
    const prevTo = ymd(prev.to);
    void queryClient.prefetchQuery({
      queryKey: ["/api/stats/daily-dd", prevFrom, prevTo],
      queryFn: async () => {
        const res = await fetch(
          `/api/stats/daily-dd?from=${prevFrom}&to=${prevTo}`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
        return res.json();
      },
      staleTime: 5 * 60 * 1000,
      gcTime: LONG_GC_MS,
    });
  }, [range, offset, today, offlineView, queryClient]);

  type ChartPoint = { date: string; difficulty: number | null; sessions: number; isFuture?: boolean };
  const chartBuild = useMemo(() => {
    let chartData: ChartPoint[] = [];
    let xTickInterval: number | "preserveStartEnd" = 0;
    let xTicks: string[] | undefined;
    let xTickFormatter: ((v: string) => string) | undefined;
    let periodLabel = "";

    if (range === "week") {
      const days = eachDayOfInterval({ start: from, end: to });
      periodLabel = `${format(from, "d MMM")} – ${format(to, "d MMM yyyy")}`;
      chartData = days.map((day) => {
        const key = format(day, "yyyy-MM-dd");
        const found = ddByDate[key];
        return {
          date: format(day, "EEE d"),
          difficulty: found?.difficulty ?? null,
          sessions: found?.sessions ?? 0,
          isFuture: day > today,
        };
      });
    } else if (range === "month") {
      const days = eachDayOfInterval({ start: from, end: to });
      xTickInterval = 4;
      periodLabel = `${format(from, "d MMM")} – ${format(to, "d MMM yyyy")}`;
      chartData = days.map((day) => {
        const key = format(day, "yyyy-MM-dd");
        const found = ddByDate[key];
        return {
          date: format(day, "d MMM"),
          difficulty: found?.difficulty ?? null,
          sessions: found?.sessions ?? 0,
          isFuture: day > today,
        };
      });
    } else if (range === "year") {
      const days = eachDayOfInterval({ start: from, end: to });
      periodLabel = `${format(from, "d MMM yyyy")} – ${format(to, "d MMM yyyy")}`;
      chartData = days.map((day) => {
        const key = format(day, "yyyy-MM-dd");
        const found = ddByDate[key];
        return {
          date: key,
          difficulty: found?.difficulty ?? null,
          sessions: found?.sessions ?? 0,
          isFuture: day > today,
        };
      });
      xTicks = days
        .filter((d) => d.getDate() === 1)
        .map((d) => format(d, "yyyy-MM-dd"));
      xTickInterval = 0;
      xTickFormatter = (v: string) => {
        try { return format(parseISO(v), "MMM"); } catch { return v; }
      };
    } else {
      const allKeys = Object.keys(ddByDate).sort();
      if (allKeys.length > 0) {
        const earliest = parseISO(allKeys[0]);
        const days = eachDayOfInterval({ start: earliest, end: today });
        periodLabel = `${format(earliest, "d MMM yyyy")} – ${format(today, "d MMM yyyy")}`;
        let lastMonth = -1;
        let lastYear = -1;
        chartData = days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const found = ddByDate[key];
          const m = day.getMonth();
          const y = day.getFullYear();
          let label = "";
          if (y !== lastYear) label = format(day, "MMM yyyy");
          else if (m !== lastMonth) label = format(day, "MMM");
          lastMonth = m;
          lastYear = y;
          return { date: label, difficulty: found?.difficulty ?? null, sessions: found?.sessions ?? 0 };
        });
        xTickInterval = Math.max(1, Math.floor(days.length / 12));
      } else {
        periodLabel = "No data yet";
      }
    }

    return { chartData, xTickInterval, xTicks, xTickFormatter, periodLabel };
  }, [ddByDate, range, from, to, today]);

  const { chartData, xTickInterval, xTicks, xTickFormatter, periodLabel } = chartBuild;

  const { trainingDaysInRange, totalDDInRange, totalSessionsInRange } = useMemo(() => ({
    trainingDaysInRange: chartData.filter((d) => d.difficulty !== null).length,
    totalDDInRange: chartData.reduce((sum, d) => sum + (d.difficulty ?? 0), 0),
    totalSessionsInRange: chartData.reduce((sum, d) => sum + d.sessions, 0),
  }), [chartData]);

  if (offlineView) {
    return (
      <PageLayout>
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-slate-100 dark:bg-slate-800/30 rounded-2xl icon-3d">
            <TrendingUp className="w-6 h-6 text-slate-500" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold">Progress Analytics</h1>
            <p className="text-muted-foreground text-sm">Tracking your daily training intensity</p>
          </div>
        </div>
        <OfflinePlaceholder
          testId="card-offline-stats"
          hint="Stats need your full training history. They'll be back when you reconnect."
        />
      </PageLayout>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
      </div>
    );
  }

  const isCurrentPeriod = offset === 0;
  const navigable = range !== "all";

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || !navigable) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) {
      if (dx > 0) setOffset((w) => w - 1);
      else if (dx < 0 && !isCurrentPeriod) setOffset((w) => w + 1);
    }
    touchStartX.current = null;
  };

  return (
    <PageLayout>
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-slate-100 dark:bg-slate-800/30 rounded-2xl icon-3d">
          <TrendingUp className="w-6 h-6 text-slate-500" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold">Progress Analytics</h1>
          <p className="text-muted-foreground text-sm">Tracking your daily training intensity</p>
        </div>
      </div>

      <div className="grid gap-6">
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold flex items-center justify-between gap-3">
              <span>Daily Total Difficulty</span>
              <Select value={range} onValueChange={(v) => { setRange(v as Range); setOffset(0); }}>
                <SelectTrigger className="w-36 h-8 rounded-xl text-xs border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">A Week</SelectItem>
                  <SelectItem value="month">A Month</SelectItem>
                  <SelectItem value="year">A Year</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </CardTitle>

            <div className="flex items-center justify-between mt-2">
              {navigable ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-lg"
                    onClick={() => setOffset((w) => w - 1)}
                    data-testid="button-prev-period"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs font-medium text-foreground/80 min-w-[180px] text-center" data-testid="text-period-label">
                    {periodLabel}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-lg"
                    disabled={isCurrentPeriod}
                    onClick={() => setOffset((w) => w + 1)}
                    data-testid="button-next-period"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">{periodLabel}</span>
              )}
              <span className="text-xs text-muted-foreground">
                {trainingDaysInRange} training days
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div
              className="h-[300px] w-full mt-4"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    dy={10}
                    interval={xTickInterval}
                    ticks={xTicks}
                    tickFormatter={xTickFormatter}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '16px',
                      border: 'none',
                      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                      fontSize: '12px'
                    }}
                    formatter={(value: any) => value !== null ? [Number(value).toFixed(1), "DD"] : ["Rest day", ""]}
                    labelFormatter={range === "year" ? (v: string) => {
                      try { return format(parseISO(v), "d MMM"); } catch { return v; }
                    } : undefined}
                    cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  <Line
                    type="linear"
                    dataKey="difficulty"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    connectNulls={true}
                    dot={{ fill: 'hsl(var(--primary))', r: 4, strokeWidth: 0 }}
                    activeDot={{ r: 6, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="bg-gradient-to-br from-blue-50/60 to-background dark:from-blue-950/20">
            <CardContent className="pt-6">
              <div className="text-sm font-medium text-muted-foreground mb-1">Total DD</div>
              <div className="text-3xl font-display font-bold text-blue-600 dark:text-blue-400">
                {totalDDInRange.toFixed(1)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{periodLabel}</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-slate-100/60 to-background dark:from-slate-800/20">
            <CardContent className="pt-6">
              <div className="text-sm font-medium text-muted-foreground mb-1">Sessions</div>
              <div className="text-3xl font-display font-bold text-slate-600 dark:text-slate-400">
                {totalSessionsInRange}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{periodLabel}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}
