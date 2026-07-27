import { useState, useRef } from "react";
import { useNotes } from "@/hooks/use-notes";
import { useSkills } from "@/hooks/use-skills";
import { useRoutines } from "@/hooks/use-routines";
import { parseNoteSkills, calculateTotalDD, computeTurns } from "@/lib/training-utils";
import { useTrackTurns } from "@/hooks/use-track-turns";
import { PageLayout } from "@/components/page-layout";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { OfflinePlaceholder } from "@/components/offline-placeholder";
import { cn } from "@/lib/utils";
import { useOfflineMode } from "@/hooks/use-offline-mode";
import { useOnline } from "@/hooks/use-online";
import {
  format, parseISO, eachDayOfInterval, eachWeekOfInterval,
  startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear,
  addWeeks, addMonths, addYears, isWithinInterval,
} from "date-fns";

type Range = "week" | "month" | "year" | "all";

function AxisTick(props: any) {
  const { x, y, payload, index, visibleTicksCount, formatter } = props;
  const label = formatter ? formatter(payload?.value) : payload?.value;
  if (label === undefined || label === null || label === "") return null;
  const anchor =
    index === 0 ? "start" : index === visibleTicksCount - 1 ? "end" : "middle";
  return (
    <text
      x={x}
      y={y}
      dy={12}
      textAnchor={anchor}
      fill="hsl(var(--muted-foreground))"
      fontSize={10}
      fontFamily="var(--font-mono)"
    >
      {label}
    </text>
  );
}

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
  const [trackTurns] = useTrackTurns();

  if (offlineView) {
    return (
      <PageLayout>
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-slate-100 dark:bg-slate-800/30 rounded-2xl icon-3d">
            <TrendingUp className="w-6 h-6 text-slate-500" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-normal">Progress Analytics</h1>
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

  const parseHM = (t: string | null | undefined): number | null => {
    const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  };

  // Compute DD per note keyed by raw date string (YYYY-MM-DD)
  const ddByDate: Record<string, { difficulty: number; sessions: number; turns: number; timedTurns: number; timedMinutes: number }> = {};

  notes?.forEach(note => {
    const skillsData = parseNoteSkills(note.skills);
    const noteDD = calculateTotalDD(skillsData, allItems, routines);

    const key = note.date.substring(0, 10);
    if (!ddByDate[key]) ddByDate[key] = { difficulty: 0, sessions: 0, turns: 0, timedTurns: 0, timedMinutes: 0 };
    ddByDate[key].difficulty += noteDD;
    ddByDate[key].sessions += 1;
    const noteTurns = computeTurns(skillsData).totalTurns;
    ddByDate[key].turns += noteTurns;
    const start = parseHM(note.startTime);
    const end = parseHM(note.endTime);
    if (start != null && end != null && end > start && noteTurns > 0) {
      ddByDate[key].timedTurns += noteTurns;
      ddByDate[key].timedMinutes += end - start;
    }
  });

  const tphOf = (found: { timedTurns: number; timedMinutes: number } | undefined): number | null =>
    found && found.timedMinutes > 0
      ? Math.round((found.timedTurns / (found.timedMinutes / 60)) * 10) / 10
      : null;

  const today = startOfDay(new Date());

  // Build chart data based on selected range
  type ChartPoint = { date: string; difficulty: number | null; sessions: number; turns: number | null; tph: number | null };
  let chartData: ChartPoint[] = [];
  let xTickInterval: number | "preserveStartEnd" = 0;
  let xTicks: string[] | undefined;
  let xTickFormatter: ((v: string) => string) | undefined;
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
        date: format(day, "EEEEE"),
        difficulty: found?.difficulty ?? null,
        sessions: found?.sessions ?? 0,
        turns: found?.turns ?? null,
        tph: tphOf(found),
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
      return { date: format(day, "d MMM"), difficulty: found?.difficulty ?? null, sessions: found?.sessions ?? 0, turns: found?.turns ?? null, tph: tphOf(found), isFuture };
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
      return { date: key, difficulty: found?.difficulty ?? null, sessions: found?.sessions ?? 0, turns: found?.turns ?? null, tph: tphOf(found), isFuture };
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
      chartData = days.map(day => {
        const key = format(day, "yyyy-MM-dd");
        const found = ddByDate[key];
        return { date: key, difficulty: found?.difficulty ?? null, sessions: found?.sessions ?? 0, turns: found?.turns ?? null, tph: tphOf(found) };
      });
      // Adaptive month/year ticks: denser labels for short spans, yearly for long ones.
      const monthsSpan =
        (today.getFullYear() - earliest.getFullYear()) * 12 +
        (today.getMonth() - earliest.getMonth()) + 1;
      const stepMonths =
        monthsSpan <= 12 ? 1 : monthsSpan <= 24 ? 2 : monthsSpan <= 36 ? 3 : 12;
      const tickLabels: Record<string, string> = {};
      let tickDays: Date[];
      if (stepMonths === 12) {
        tickDays = days.filter((d) => d.getMonth() === 0 && d.getDate() === 1);
        if (tickDays.length === 0) tickDays = [days[0]];
        tickDays.forEach((d) => { tickLabels[format(d, "yyyy-MM-dd")] = format(d, "yyyy"); });
      } else {
        const firstsOfMonth = days.filter((d) => d.getDate() === 1);
        tickDays = firstsOfMonth.filter((_, i) => i % stepMonths === 0);
        if (tickDays.length === 0) tickDays = [days[0]];
        tickDays.forEach((d, i) => {
          tickLabels[format(d, "yyyy-MM-dd")] =
            d.getMonth() === 0 || i === 0 ? format(d, "MMM yyyy") : format(d, "MMM");
        });
      }
      xTicks = tickDays.map((d) => format(d, "yyyy-MM-dd"));
      xTickInterval = 0;
      xTickFormatter = (v: string) => tickLabels[v] ?? "";
    } else {
      periodLabel = "No data yet";
    }
  }

  const totalDDInRange = chartData.reduce((sum, d) => sum + (d.difficulty ?? 0), 0);

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

  // ---- Selected-period aggregates: the cards follow the chart's range + offset ----
  let periodStart: Date | null = null;
  let periodEnd: Date | null = null;
  if (range === "week") {
    const ws = addWeeks(startOfWeek(today, { weekStartsOn: 1 }), offset);
    periodStart = ws; periodEnd = endOfWeek(ws, { weekStartsOn: 1 });
  } else if (range === "month") {
    const ref = addMonths(today, offset); periodStart = startOfMonth(ref); periodEnd = endOfMonth(ref);
  } else if (range === "year") {
    const ref = addYears(today, offset); periodStart = startOfYear(ref); periodEnd = endOfYear(ref);
  }
  const notesInPeriod = periodStart && periodEnd
    ? (notes ?? []).filter(n => isWithinInterval(parseISO(n.date.substring(0, 10)), { start: periodStart!, end: periodEnd! }))
    : (notes ?? []);
  const sessionsInPeriod = chartData.reduce((s, d) => s + d.sessions, 0);
  const activeDays = chartData.reduce((n, d) => n + (d.sessions > 0 ? 1 : 0), 0);
  const periodTotalDD = totalDDInRange;
  const periodAvgDD = sessionsInPeriod > 0 ? periodTotalDD / sessionsInPeriod : 0;
  const periodBest = notesInPeriod.reduce((m, n) => Math.max(m, calculateTotalDD(parseNoteSkills(n.skills), allItems, routines)), 0);

  // ---- Turn efficiency (period-scoped, gated by the Track Turns preference) ----
  let periodTurns = 0;
  let timedTurns = 0;
  let timedMinutes = 0;
  notesInPeriod.forEach(n => {
    const t = computeTurns(parseNoteSkills(n.skills)).totalTurns;
    periodTurns += t;
    const start = parseHM(n.startTime);
    const end = parseHM(n.endTime);
    if (start != null && end != null && end > start && t > 0) {
      timedTurns += t;
      timedMinutes += end - start;
    }
  });
  // Average duration of a single turn (session time ÷ turns), shown as "3m 05s".
  const secondsPerTurn =
    timedTurns > 0 && timedMinutes > 0 ? Math.round((timedMinutes * 60) / timedTurns) : null;
  const timePerTurn =
    secondsPerTurn != null
      ? secondsPerTurn >= 60
        ? `${Math.floor(secondsPerTurn / 60)}m ${String(secondsPerTurn % 60).padStart(2, "0")}s`
        : `${secondsPerTurn}s`
      : null;
  const avgDDPerTurn = periodTurns > 0 ? periodTotalDD / periodTurns : null;

  // ---- All-time overview (not period-scoped) ----
  const allNotes = notes ?? [];
  const allTimeTotalDD = allNotes.reduce((sum, n) => sum + calculateTotalDD(parseNoteSkills(n.skills), allItems, routines), 0);
  const allTimeSessions = allNotes.length;
  const earliestNoteDate = allNotes.reduce<string | null>((min, n) => {
    const d = n.date.substring(0, 10);
    return min === null || d < min ? d : min;
  }, null);
  const activeSince = earliestNoteDate ? format(parseISO(earliestNoteDate), "MMM yyyy") : "—";
  const skillsInLibrary = (allItems ?? []).filter(i => i.isDrill === 0 && i.archived !== 1).length;

  // ---- Period delta (current vs previous comparable period) ----
  const periodSumFor = (off: number, pick: (v: (typeof ddByDate)[string]) => number): number => {
    let start: Date, end: Date;
    if (range === "week") {
      const ws = addWeeks(startOfWeek(today, { weekStartsOn: 1 }), off);
      start = ws; end = endOfWeek(ws, { weekStartsOn: 1 });
    } else if (range === "month") {
      const ref = addMonths(today, off); start = startOfMonth(ref); end = endOfMonth(ref);
    } else if (range === "year") {
      const ref = addYears(today, off); start = startOfYear(ref); end = endOfYear(ref);
    } else {
      return 0;
    }
    let sum = 0;
    for (const [k, v] of Object.entries(ddByDate)) {
      if (isWithinInterval(parseISO(k), { start, end })) sum += pick(v);
    }
    return sum;
  };
  const prevPeriodTotal = navigable ? periodSumFor(offset - 1, v => v.difficulty) : 0;
  const deltaPct = prevPeriodTotal > 0
    ? ((totalDDInRange - prevPeriodTotal) / prevPeriodTotal) * 100
    : (totalDDInRange > 0 ? 100 : 0);
  const showDelta = navigable && (prevPeriodTotal > 0 || totalDDInRange > 0);
  const periodTitle = range === "all"
    ? "All Time"
    : range === "week"
      ? (offset === 0 ? "This Week" : offset === -1 ? "Last Week" : "Week")
      : range === "month"
        ? (offset === 0 ? "This Month" : offset === -1 ? "Last Month" : "Month")
        : (offset === 0 ? "This Year" : offset === -1 ? "Last Year" : "Year");
  const prevLabel = range === "week" ? "vs last week" : range === "month" ? "vs last month" : range === "year" ? "vs last year" : "";

  const prevPeriodTurns = navigable ? periodSumFor(offset - 1, v => v.turns) : 0;
  const turnsDeltaPct = prevPeriodTurns > 0
    ? ((periodTurns - prevPeriodTurns) / prevPeriodTurns) * 100
    : (periodTurns > 0 ? 100 : 0);
  const showTurnsDelta = navigable && (prevPeriodTurns > 0 || periodTurns > 0);

  return (
    <PageLayout>
      <PageHeader
        eyebrow="Analytics"
        title="Your Progress"
        accent="Progress"
        subtitle="Difficulty and session trends over time."
      />

      <div className="grid gap-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div className="flex items-baseline gap-2">
              <span className="eyebrow" data-testid="text-stats-scope">{periodTitle}</span>
              <span className="text-xs font-mono text-muted-foreground" data-testid="text-stats-period">{periodLabel}</span>
            </div>
            <span className="text-[11px] text-muted-foreground/70">Totals reflect the selected range</span>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:gap-4">
            <div className="relative card-3d rounded-2xl p-3 pl-4 sm:p-5 sm:pl-6 overflow-hidden">
              <span className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-full" aria-hidden="true" />
              <div className="eyebrow eyebrow-compact mb-1.5 sm:mb-2">Sessions</div>
              <div className="text-2xl sm:text-4xl lg:text-5xl font-display font-normal text-primary tracking-tight" data-testid="stat-sessions">{sessionsInPeriod}</div>
              <div className="text-[9px] sm:text-[11px] leading-tight text-muted-foreground/70 mt-1 sm:mt-1.5" data-testid="text-sessions-caption">over {activeDays} day{activeDays === 1 ? "" : "s"}</div>
            </div>
            <div className="relative card-3d rounded-2xl p-3 pl-4 sm:p-5 sm:pl-6 overflow-hidden">
              <span className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-full" aria-hidden="true" />
              <div className="eyebrow eyebrow-compact mb-1.5 sm:mb-2">Total DD</div>
              <div className="text-2xl sm:text-4xl lg:text-5xl font-display font-normal text-emerald-400 tracking-tight" data-testid="stat-total-dd">{periodTotalDD.toFixed(1)}</div>
              <div className="text-[9px] sm:text-[11px] leading-tight text-muted-foreground/70 mt-1 sm:mt-1.5">total difficulty</div>
            </div>
            <div className="relative card-3d rounded-2xl p-3 pl-4 sm:p-5 sm:pl-6 overflow-hidden">
              <span className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 rounded-full" aria-hidden="true" />
              <div className="eyebrow eyebrow-compact mb-1.5 sm:mb-2">Avg DD</div>
              <div className="text-2xl sm:text-4xl lg:text-5xl font-display font-normal text-amber-400 tracking-tight" data-testid="stat-avg-dd">{periodAvgDD.toFixed(1)}</div>
              <div className="text-[9px] sm:text-[11px] leading-tight text-muted-foreground/70 mt-1 sm:mt-1.5">DD per session</div>
            </div>
            <div className="relative card-3d rounded-2xl p-3 pl-4 sm:p-5 sm:pl-6 overflow-hidden">
              <span className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500 rounded-full" aria-hidden="true" />
              <div className="eyebrow eyebrow-compact mb-1.5 sm:mb-2">Best DD</div>
              <div className="text-2xl sm:text-4xl lg:text-5xl font-display font-normal text-rose-400 tracking-tight" data-testid="stat-best">{periodBest.toFixed(1)}</div>
              <div className="text-[9px] sm:text-[11px] leading-tight text-muted-foreground/70 mt-1 sm:mt-1.5">highest single session</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
          <div className="card-3d rounded-2xl p-5 lg:col-span-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="eyebrow mb-2">{periodTitle} <span className="text-emerald-400">/ DD</span></div>
                <div className="text-4xl font-display font-normal tracking-tight" data-testid="text-period-total">{totalDDInRange.toFixed(1)}</div>
              </div>
              <div className="flex items-start gap-2 shrink-0">
                {showDelta && (
                  <div className="text-right">
                    <div className={cn("flex items-center justify-end gap-0.5 text-sm font-semibold", deltaPct >= 0 ? "text-emerald-400" : "text-rose-400")} data-testid="text-delta">
                      {deltaPct >= 0 ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                      {deltaPct >= 0 ? "+" : ""}{Math.round(deltaPct)}%
                    </div>
                    {prevLabel && <div className="text-[11px] text-muted-foreground mt-0.5">{prevLabel}</div>}
                  </div>
                )}
                <Select value={range} onValueChange={(v) => { setRange(v as Range); setOffset(0); }}>
                  <SelectTrigger className="w-[120px] h-8 rounded-xl text-xs border-border/50 font-mono" data-testid="select-range"><SelectValue /></SelectTrigger>
                  <SelectContent className="font-mono">
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                    <SelectItem value="year">Year</SelectItem>
                    <SelectItem value="all">All Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div
              className="h-[200px] w-full mt-4"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={<AxisTick formatter={xTickFormatter} />}
                    interval={xTickInterval}
                    ticks={xTicks}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--card))',
                      color: 'hsl(var(--foreground))',
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px'
                    }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                    formatter={(value: any, _n: any, item: any) => {
                      if (value === null || value === undefined) return ["Rest day", ""];
                      const s = item?.payload?.sessions ?? 0;
                      const sessionPart = s > 1 ? ` · ${s} sessions` : "";
                      return [`${Number(value).toFixed(1)} DD${sessionPart}`, ""];
                    }}
                    labelFormatter={
                      range === "all"
                        ? (v: string) => { try { return format(parseISO(v), "d MMM yyyy"); } catch { return v; } }
                        : range === "year"
                        ? (v: string) => { try { return format(parseISO(v), "d MMM"); } catch { return v; } }
                        : undefined
                    }
                    cursor={{ stroke: 'hsl(var(--primary) / 0.3)', strokeWidth: 1 }}
                  />
                  <Line
                    type="linear"
                    dataKey="difficulty"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    connectNulls
                    dot={{ r: chartData.length > 60 ? 2 : 3, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {navigable ? (
              <div className="flex items-center justify-between mt-1">
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={() => setOffset(w => w - 1)} data-testid="button-prev-period">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs font-mono text-muted-foreground text-center" data-testid="text-period-label">{periodLabel}</span>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" disabled={isCurrentPeriod} onClick={() => setOffset(w => w + 1)} data-testid="button-next-period">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="text-center mt-2 text-xs font-mono text-muted-foreground" data-testid="text-period-label">{periodLabel}</div>
            )}
          </div>

          <div className="card-3d rounded-2xl p-5 lg:col-span-1">
            <div className="eyebrow mb-2">All-Time</div>
            <div className="divide-y divide-border/50">
              {[
                { label: "Total DD Trained", value: allTimeTotalDD.toFixed(1), testId: "overview-total-dd" },
                { label: "Sessions Logged", value: String(allTimeSessions), testId: "overview-sessions" },
                { label: "Active Since", value: activeSince, testId: "overview-active-since" },
                { label: "Skills in Library", value: String(skillsInLibrary), testId: "overview-skills" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between py-3.5">
                  <span className="text-sm text-muted-foreground">{row.label}</span>
                  <span className="font-mono text-base text-foreground" data-testid={row.testId}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {trackTurns && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
            <div className="card-3d rounded-2xl p-5 lg:col-span-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="eyebrow mb-2">{periodTitle} <span className="text-sky-400">/ Turns</span></div>
                  <div className="text-4xl font-display font-normal tracking-tight" data-testid="text-period-turns">{periodTurns}</div>
                  <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground mt-1.5" data-testid="legend-turns-chart">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-4 border-t-2" style={{ borderColor: 'hsl(200 90% 60%)' }} />
                      turns
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: 'hsl(150 70% 55%)' }} />
                      turns/hr
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-2 shrink-0">
                  {showTurnsDelta && (
                    <div className="text-right">
                      <div className={cn("flex items-center justify-end gap-0.5 text-sm font-semibold", turnsDeltaPct >= 0 ? "text-emerald-400" : "text-rose-400")} data-testid="text-turns-delta">
                        {turnsDeltaPct >= 0 ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                        {turnsDeltaPct >= 0 ? "+" : ""}{Math.round(turnsDeltaPct)}%
                      </div>
                      {prevLabel && <div className="text-[11px] text-muted-foreground mt-0.5">{prevLabel}</div>}
                    </div>
                  )}
                  <Select value={range} onValueChange={(v) => { setRange(v as Range); setOffset(0); }}>
                    <SelectTrigger className="w-[120px] h-8 rounded-xl text-xs border-border/50 font-mono" data-testid="select-range-turns"><SelectValue /></SelectTrigger>
                    <SelectContent className="font-mono">
                      <SelectItem value="week">Week</SelectItem>
                      <SelectItem value="month">Month</SelectItem>
                      <SelectItem value="year">Year</SelectItem>
                      <SelectItem value="all">All Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div
                className="h-[200px] w-full mt-4"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={<AxisTick formatter={xTickFormatter} />}
                      interval={xTickInterval}
                      ticks={xTicks}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid hsl(var(--border))',
                        background: 'hsl(var(--card))',
                        color: 'hsl(var(--foreground))',
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px'
                      }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                      formatter={(value: any, _n: any, item: any) => {
                        if (value === null || value === undefined) return ["Rest day", ""];
                        if (item?.dataKey === "tph") {
                          return [`${Number(value).toFixed(1)} turns/hr`, ""];
                        }
                        const s = item?.payload?.sessions ?? 0;
                        const sessionPart = s > 1 ? ` · ${s} sessions` : "";
                        return [`${Number(value)} turn${Number(value) === 1 ? "" : "s"}${sessionPart}`, ""];
                      }}
                      labelFormatter={
                        range === "all"
                          ? (v: string) => { try { return format(parseISO(v), "d MMM yyyy"); } catch { return v; } }
                          : range === "year"
                          ? (v: string) => { try { return format(parseISO(v), "d MMM"); } catch { return v; } }
                          : undefined
                      }
                      cursor={{ stroke: 'hsl(200 90% 60% / 0.3)', strokeWidth: 1 }}
                    />
                    <YAxis yAxisId="turns" hide />
                    <YAxis yAxisId="tph" hide />
                    <Line
                      yAxisId="turns"
                      type="linear"
                      dataKey="turns"
                      stroke="hsl(200 90% 60%)"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: chartData.length > 60 ? 2 : 3, fill: 'hsl(200 90% 60%)', strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: 'hsl(200 90% 60%)', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                    />
                    <Line
                      yAxisId="tph"
                      type="linear"
                      dataKey="tph"
                      stroke="hsl(150 70% 55%)"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      connectNulls
                      dot={{ r: chartData.length > 60 ? 1.5 : 2.5, fill: 'hsl(150 70% 55%)', strokeWidth: 0 }}
                      activeDot={{ r: 4, fill: 'hsl(150 70% 55%)', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {navigable ? (
                <div className="flex items-center justify-between mt-1">
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={() => setOffset(w => w - 1)} data-testid="button-prev-period-turns">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs font-mono text-muted-foreground text-center" data-testid="text-period-label-turns">{periodLabel}</span>
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" disabled={isCurrentPeriod} onClick={() => setOffset(w => w + 1)} data-testid="button-next-period-turns">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="text-center mt-2 text-xs font-mono text-muted-foreground" data-testid="text-period-label-turns">{periodLabel}</div>
              )}
            </div>

            <div className="card-3d rounded-2xl p-5 lg:col-span-1">
              <div className="eyebrow mb-2">Efficiency</div>
              <div className="divide-y divide-border/50">
                {[
                  { label: "Turns", value: String(periodTurns), testId: "stat-turns" },
                  { label: "Time / Turn", value: timePerTurn ?? "—", testId: "stat-time-per-turn" },
                  { label: "Avg DD / Turn", value: avgDDPerTurn != null ? avgDDPerTurn.toFixed(1) : "—", testId: "stat-avg-dd-per-turn" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-3.5">
                    <span className="text-sm text-muted-foreground">{row.label}</span>
                    <span className="font-mono text-base text-foreground" data-testid={row.testId}>{row.value}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground/70 mt-3 leading-snug">
                Time per turn counts only sessions with start and end times.
              </p>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
