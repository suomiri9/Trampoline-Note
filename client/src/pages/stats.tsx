import { useState, useRef } from "react";
import { useNotes } from "@/hooks/use-notes";
import { useSkills } from "@/hooks/use-skills";
import { useRoutines } from "@/hooks/use-routines";
import { parseNoteSkills, calculateTotalDD } from "@/lib/training-utils";
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
  format, parseISO, eachDayOfInterval, eachWeekOfInterval,
  startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear,
  addWeeks, addMonths, addYears, isWithinInterval,
} from "date-fns";

type Range = "week" | "month" | "year" | "all";

export default function StatsPage() {
  const [range, setRange] = useState<Range>("week");
  const [offset, setOffset] = useState(0); // 0 = current period, -1 = previous, etc.
  const touchStartX = useRef<number | null>(null);
  const [offlineModeEnabled] = useOfflineMode();
  const isOnline = useOnline();
  const offlineView = offlineModeEnabled && !isOnline;

  const { data: notes, isLoading: notesLoading } = useNotes();
  const { data: allItems, isLoading: skillsLoading } = useSkills();
  const { data: routines, isLoading: routinesLoading } = useRoutines();

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

  if (notesLoading || skillsLoading || routinesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
      </div>
    );
  }

  // Compute DD per note keyed by raw date string (YYYY-MM-DD)
  const ddByDate: Record<string, { difficulty: number; sessions: number }> = {};

  notes?.forEach(note => {
    const skillsData = parseNoteSkills(note.skills);
    const noteDD = calculateTotalDD(skillsData, allItems, routines);

    const key = note.date.substring(0, 10);
    if (!ddByDate[key]) ddByDate[key] = { difficulty: 0, sessions: 0 };
    ddByDate[key].difficulty += noteDD;
    ddByDate[key].sessions += 1;
  });

  const today = startOfDay(new Date());

  // Build chart data based on selected range
  type ChartPoint = { date: string; difficulty: number | null; sessions: number };
  let chartData: ChartPoint[] = [];
  let xTickInterval: number | "preserveStartEnd" = 0;
  let xTicks: string[] | undefined;
  let xTickFormatter: ((v: string) => string) | undefined;
  let useWeekly = false;
  let periodLabel = "";

  if (range === "week") {
    const baseMonday = startOfWeek(today, { weekStartsOn: 1 });
    const weekStart = addWeeks(baseMonday, offset);
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

    const startLabel = format(weekStart, "d MMM");
    const endLabel = format(weekEnd, "d MMM yyyy");
    periodLabel = `${startLabel} – ${endLabel}`;

    chartData = days.map(day => {
      const key = format(day, "yyyy-MM-dd");
      const found = ddByDate[key];
      const isFuture = day > today;
      return {
        date: format(day, "EEE d"),
        difficulty: found?.difficulty ?? null,
        sessions: found?.sessions ?? 0,
        isFuture,
      };
    });
  } else if (range === "month") {
    const refDay = addMonths(today, offset);
    const monthStart = startOfMonth(refDay);
    const monthEnd = endOfMonth(refDay);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    xTickInterval = 4;
    periodLabel = `${format(monthStart, "d MMM")} – ${format(monthEnd, "d MMM yyyy")}`;
    chartData = days.map(day => {
      const key = format(day, "yyyy-MM-dd");
      const found = ddByDate[key];
      const isFuture = day > today;
      return { date: format(day, "d MMM"), difficulty: found?.difficulty ?? null, sessions: found?.sessions ?? 0, isFuture };
    });
  } else if (range === "year") {
    const refDay = addYears(today, offset);
    const yearStart = startOfYear(refDay);
    const yearEnd = endOfYear(refDay);
    const days = eachDayOfInterval({ start: yearStart, end: yearEnd });
    periodLabel = `${format(yearStart, "d MMM yyyy")} – ${format(yearEnd, "d MMM yyyy")}`;
    chartData = days.map(day => {
      const key = format(day, "yyyy-MM-dd");
      const found = ddByDate[key];
      const isFuture = day > today;
      return { date: key, difficulty: found?.difficulty ?? null, sessions: found?.sessions ?? 0, isFuture };
    });
    // Force a tick on the first of every month so all 12 month labels render.
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
      chartData = days.map(day => {
        const key = format(day, "yyyy-MM-dd");
        const found = ddByDate[key];
        const m = day.getMonth();
        const y = day.getFullYear();
        let label = "";
        if (y !== lastYear) {
          label = format(day, "MMM yyyy");
        } else if (m !== lastMonth) {
          label = format(day, "MMM");
        }
        lastMonth = m;
        lastYear = y;
        return { date: label, difficulty: found?.difficulty ?? null, sessions: found?.sessions ?? 0 };
      });
      xTickInterval = Math.max(1, Math.floor(days.length / 12));
    } else {
      periodLabel = "No data yet";
    }
  }

  const trainingDaysInRange = chartData.filter(d => d.difficulty !== null).length;
  const totalDDInRange = chartData.reduce((sum, d) => sum + (d.difficulty ?? 0), 0);
  const totalSessionsInRange = chartData.reduce((sum, d) => sum + d.sessions, 0);

  const isCurrentPeriod = offset === 0;
  const navigable = range !== "all";

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || !navigable) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) {
      if (dx > 0) setOffset(w => w - 1);        // swipe right = go back
      else if (dx < 0 && !isCurrentPeriod) setOffset(w => w + 1); // swipe left = go forward
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
              <span>{useWeekly ? "Weekly" : "Daily"} Total Difficulty</span>
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
                    onClick={() => setOffset(w => w - 1)}
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
                    onClick={() => setOffset(w => w + 1)}
                    data-testid="button-next-period"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">{periodLabel}</span>
              )}
              <span className="text-xs text-muted-foreground">
                {trainingDaysInRange} training {useWeekly ? "weeks" : "days"}
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
                    formatter={(value: any) => value !== null ? [Number(value).toFixed(1), useWeekly ? "Week DD" : "DD"] : [useWeekly ? "No training" : "Rest day", ""]}
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
