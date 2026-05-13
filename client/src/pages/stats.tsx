import { useState, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { OfflinePlaceholder } from "@/components/offline-placeholder";
import { useOfflineMode } from "@/hooks/use-offline-mode";
import { useOnline } from "@/hooks/use-online";
import { format, parseISO, addDays } from "date-fns";

interface WeeklyStats {
  thisWeekStart: string;
  lastWeekStart: string;
  days: { date: string; difficulty: number; sessions: number }[];
}

export default function StatsPage() {
  const [showLastWeek, setShowLastWeek] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const [offlineModeEnabled] = useOfflineMode();
  const isOnline = useOnline();
  const offlineView = offlineModeEnabled && !isOnline;

  const { data, isLoading } = useQuery<WeeklyStats>({
    queryKey: ["/api/stats/weekly"],
    enabled: !offlineView,
    staleTime: 60_000,
  });

  const { chartData, periodLabel, totalDD, totalSessions, trainingDays } = useMemo(() => {
    if (!data) {
      return { chartData: [] as { date: string; difficulty: number | null; sessions: number; isFuture: boolean }[], periodLabel: "", totalDD: 0, totalSessions: 0, trainingDays: 0 };
    }
    const weekStartStr = showLastWeek ? data.lastWeekStart : data.thisWeekStart;
    const weekStart = parseISO(weekStartStr);
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const slice = data.days
      .filter(d => d.date >= weekStartStr && d.date < format(addDays(weekStart, 7), "yyyy-MM-dd"))
      .map(d => ({
        date: format(parseISO(d.date), "EEE d"),
        difficulty: d.difficulty > 0 ? d.difficulty : null,
        sessions: d.sessions,
        isFuture: d.date > todayStr,
      }));
    const startLabel = format(weekStart, "d MMM");
    const endLabel = format(addDays(weekStart, 6), "d MMM yyyy");
    return {
      chartData: slice,
      periodLabel: `${startLabel} – ${endLabel}`,
      totalDD: slice.reduce((s, d) => s + (d.difficulty ?? 0), 0),
      totalSessions: slice.reduce((s, d) => s + d.sessions, 0),
      trainingDays: slice.filter(d => d.difficulty !== null).length,
    };
  }, [data, showLastWeek]);

  if (offlineView) {
    return (
      <PageLayout>
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-slate-100 dark:bg-slate-800/30 rounded-2xl icon-3d">
            <TrendingUp className="w-6 h-6 text-slate-500" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold">Progress Analytics</h1>
            <p className="text-muted-foreground text-sm">This week and last week</p>
          </div>
        </div>
        <OfflinePlaceholder
          testId="card-offline-stats"
          hint="Stats need a fresh sync. They'll be back when you reconnect."
        />
      </PageLayout>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
      </div>
    );
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) {
      if (dx > 0) setShowLastWeek(true);
      else if (dx < 0) setShowLastWeek(false);
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
          <p className="text-muted-foreground text-sm">This week and last week</p>
        </div>
      </div>

      <div className="grid gap-6">
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">
              Daily Total Difficulty
            </CardTitle>

            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-lg"
                  disabled={!showLastWeek}
                  onClick={() => setShowLastWeek(true)}
                  data-testid="button-prev-period"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs font-medium text-foreground/80 min-w-[180px] text-center" data-testid="text-period-label">
                  {showLastWeek ? "Last week" : "This week"} · {periodLabel}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-lg"
                  disabled={!showLastWeek}
                  onClick={() => setShowLastWeek(false)}
                  data-testid="button-next-period"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">
                {trainingDays} training days
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
                    interval={0}
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
                {totalDD.toFixed(1)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{periodLabel}</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-slate-100/60 to-background dark:from-slate-800/20">
            <CardContent className="pt-6">
              <div className="text-sm font-medium text-muted-foreground mb-1">Sessions</div>
              <div className="text-3xl font-display font-bold text-slate-600 dark:text-slate-400">
                {totalSessions}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{periodLabel}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}
