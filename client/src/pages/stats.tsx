import { useState, useRef, useEffect } from "react";
import { useNotes } from "@/hooks/use-notes";
import { useSkills } from "@/hooks/use-skills";
import { useRoutines } from "@/hooks/use-routines";
import { parseNoteSkills, calculateTotalDD, computeTurns } from "@/lib/training-utils";
import { useTrackTurns } from "@/hooks/use-track-turns";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, TrendingUp } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
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

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const onScroll = () => setScrolled(root.scrollTop > 40);
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, []);

  const { data: notes, isLoading: notesLoading } = useNotes();
  const { data: allItems, isLoading: skillsLoading } = useSkills();
  const { data: routines, isLoading: routinesLoading } = useRoutines();
  const [trackTurns] = useTrackTurns();

  // Offline: stats render from the mirrored notes/skills/routines caches.
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
    // Pass the note's date so routine entries count the lineup trained that day.
    const noteDD = calculateTotalDD(skillsData, allItems, routines, note.date);

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

  // "3m 05s" / "45s" formatting shared by the Efficiency card and the chart tooltip.
  const formatSecondsPerTurn = (sec: number) =>
    sec >= 60 ? `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, "0")}s` : `${sec}s`;

  // Average minutes one turn took that day (plotted; tooltip shows it as m/s).
  const minPerTurnOf = (found: { timedTurns: number; timedMinutes: number } | undefined): number | null =>
    found && found.timedTurns > 0 && found.timedMinutes > 0
      ? Math.round((found.timedMinutes / found.timedTurns) * 10) / 10
      : null;

  // Average DD of one turn that day (day total DD ÷ day turns), same math as the Efficiency card.
  const ddPerTurnOf = (found: { difficulty: number; turns: number } | undefined): number | null =>
    found && found.turns > 0 ? Math.round((found.difficulty / found.turns) * 100) / 100 : null;

  const today = startOfDay(new Date());

  // Build chart data based on selected range
  type ChartPoint = { date: string; difficulty: number | null; sessions: number; turns: number | null; minPerTurn: number | null; ddPerTurn: number | null };
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
        minPerTurn: minPerTurnOf(found),
        ddPerTurn: ddPerTurnOf(found),
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
      return { date: format(day, "d MMM"), difficulty: found?.difficulty ?? null, sessions: found?.sessions ?? 0, turns: found?.turns ?? null, minPerTurn: minPerTurnOf(found), ddPerTurn: ddPerTurnOf(found), isFuture };
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
      return { date: key, difficulty: found?.difficulty ?? null, sessions: found?.sessions ?? 0, turns: found?.turns ?? null, minPerTurn: minPerTurnOf(found), ddPerTurn: ddPerTurnOf(found), isFuture };
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
        return { date: key, difficulty: found?.difficulty ?? null, sessions: found?.sessions ?? 0, turns: found?.turns ?? null, minPerTurn: minPerTurnOf(found), ddPerTurn: ddPerTurnOf(found) };
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
  const periodBest = notesInPeriod.reduce((m, n) => Math.max(m, calculateTotalDD(parseNoteSkills(n.skills), allItems, routines, n.date)), 0);

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
  const timePerTurn =
    timedTurns > 0 && timedMinutes > 0
      ? formatSecondsPerTurn(Math.round((timedMinutes * 60) / timedTurns))
      : null;
  const avgDDPerTurn = periodTurns > 0 ? periodTotalDD / periodTurns : null;

  // ---- All-time overview (not period-scoped) ----
  const allNotes = notes ?? [];
  const allTimeTotalDD = allNotes.reduce((sum, n) => sum + calculateTotalDD(parseNoteSkills(n.skills), allItems, routines, n.date), 0);
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
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="relative -mx-4 sm:-mx-6 px-6 pt-safe-top pb-0 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-72"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, hsl(var(--primary)/0.18) 0%, hsl(var(--primary)/0.04) 55%, transparent 78%)",
          }}
        />
        <div className={`relative flex flex-col items-center text-center transition-all duration-300 ${scrolled ? "pt-3 pb-4" : "pt-7 pb-6"}`}>
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/25 bg-card/60 text-[9px] font-mono text-muted-foreground/60 tracking-[0.18em] uppercase transition-all duration-300 ${scrolled ? "mb-3" : "mb-6"}`}>
            <TrendingUp className="w-3 h-3 text-primary" />
            Analytics
          </div>
          <h1
            className="font-black leading-[0.94] tracking-[-0.05em] transition-all duration-300"
            style={{ fontSize: scrolled ? "clamp(22px,6vw,26px)" : "clamp(38px,10vw,48px)", marginBottom: scrolled ? "0" : "12px" }}
          >
            <span className="text-foreground">Watch it </span>
            <span
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--chart-4)) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              add up.
            </span>
          </h1>
          {!scrolled && (
            <p className="text-[11px] text-muted-foreground/50 leading-relaxed max-w-[220px]">
              Difficulty and session trends over every week, month, and year.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-6">
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/35" data-testid="text-stats-scope">{periodTitle}</span>
              <span className="font-mono text-[10px] text-muted-foreground/25" data-testid="text-stats-period">{periodLabel}</span>
            </div>
          </div>
          {/* Range selector — Apple Stocks style segmented control */}
          <div className="flex rounded-xl border border-border/20 p-0.5 font-mono text-[10px] mb-4">
            {(["week", "month", "year", "all"] as Range[]).map(r => (
              <button
                key={r}
                type="button"
                onClick={() => { setRange(r); setOffset(0); }}
                className={cn(
                  "flex-1 rounded-[10px] px-2.5 py-1.5 uppercase tracking-wider transition-colors",
                  range === r
                    ? "bg-foreground/[0.08] text-foreground"
                    : "text-muted-foreground/40 hover:text-muted-foreground/70"
                )}
                data-testid={`range-${r}`}
              >
                {r === "week" ? "1W" : r === "month" ? "1M" : r === "year" ? "1Y" : "All"}
              </button>
            ))}
          </div>
          {/* Stat strip */}
          <div className="-mx-4 sm:-mx-6 grid grid-cols-4 border-y border-border/20 py-4 px-4 sm:px-6">
            {[
              { label: "Sessions", value: String(sessionsInPeriod), testId: "stat-sessions" },
              { label: "Total DD", value: periodTotalDD.toFixed(1), testId: "stat-total-dd" },
              { label: "Avg DD", value: periodAvgDD.toFixed(1), testId: "stat-avg-dd" },
              { label: "Best DD", value: periodBest.toFixed(1), testId: "stat-best" },
            ].map((s, i) => (
              <div key={s.label} className={cn("space-y-1 min-w-0", i > 0 && "border-l border-border/20 pl-3")}>
                <div className="text-[20px] sm:text-[26px] font-medium tracking-[-0.05em] leading-none tabular-nums text-gradient-primary" data-testid={s.testId}>
                  {s.value}
                </div>
                <div className="font-mono text-[8px] sm:text-[10px] uppercase tracking-[0.13em] text-muted-foreground/40">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 lg:col-span-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/35 mb-2">{periodTitle} <span className="text-primary/70">/ DD</span></div>
                <div className="text-4xl font-medium tracking-[-0.05em] tabular-nums" data-testid="text-period-total">{totalDDInRange.toFixed(1)}</div>
              </div>
              {showDelta && (
                <div className="text-right shrink-0">
                  <div className={cn("flex items-center justify-end gap-0.5 text-sm font-semibold tabular-nums", deltaPct >= 0 ? "text-emerald-400" : "text-rose-400")} data-testid="text-delta">
                    {deltaPct >= 0 ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                    {deltaPct >= 0 ? "+" : ""}{Math.round(deltaPct)}%
                  </div>
                  {prevLabel && <div className="text-[11px] text-muted-foreground/50 mt-0.5">{prevLabel}</div>}
                </div>
              )}
            </div>

            <div
              className="h-[200px] w-full mt-4"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
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
                  <Area
                    type="linear"
                    dataKey="difficulty"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#ddFill)"
                    connectNulls
                    dot={chartData.length > 35 ? false : { r: 2.5, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                  />
                </AreaChart>
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

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 lg:col-span-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/35 mb-2">All-Time</div>
            <div>
              {[
                { label: "Total DD Trained", value: allTimeTotalDD.toFixed(1), testId: "overview-total-dd" },
                { label: "Sessions Logged", value: String(allTimeSessions), testId: "overview-sessions" },
                { label: "Active Since", value: activeSince, testId: "overview-active-since" },
                { label: "Skills in Library", value: String(skillsInLibrary), testId: "overview-skills" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between py-3.5 border-b border-border/[0.07] last:border-b-0">
                  <span className="text-[13px] text-muted-foreground/70">{row.label}</span>
                  <span className="font-mono text-sm tabular-nums text-foreground/90" data-testid={row.testId}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {trackTurns && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 lg:col-span-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/35 mb-2">{periodTitle} <span className="text-primary/80">/ Turns</span></div>
                  <div className="text-4xl font-medium tracking-[-0.05em] tabular-nums" data-testid="text-period-turns">{periodTurns}</div>
                  <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground/50 mt-1.5" data-testid="legend-turns-chart">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-4 border-t-2" style={{ borderColor: 'hsl(200 90% 60%)' }} />
                      turns
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: 'hsl(150 70% 55%)' }} />
                      time/turn
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-4 border-t-2 border-dotted" style={{ borderColor: 'hsl(35 90% 60%)' }} />
                      DD/turn
                    </span>
                  </div>
                </div>
                {showTurnsDelta && (
                  <div className="text-right shrink-0">
                    <div className={cn("flex items-center justify-end gap-0.5 text-sm font-semibold tabular-nums", turnsDeltaPct >= 0 ? "text-emerald-400" : "text-rose-400")} data-testid="text-turns-delta">
                      {turnsDeltaPct >= 0 ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                      {turnsDeltaPct >= 0 ? "+" : ""}{Math.round(turnsDeltaPct)}%
                    </div>
                    {prevLabel && <div className="text-[11px] text-muted-foreground/50 mt-0.5">{prevLabel}</div>}
                  </div>
                )}
              </div>
              <div
                className="h-[200px] w-full mt-4"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="turnsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(200 90% 60%)" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="hsl(200 90% 60%)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="minPerTurnFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(150 70% 55%)" stopOpacity={0.08} />
                        <stop offset="100%" stopColor="hsl(150 70% 55%)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="ddPerTurnFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(35 90% 60%)" stopOpacity={0.08} />
                        <stop offset="100%" stopColor="hsl(35 90% 60%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
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
                        if (item?.dataKey === "minPerTurn") {
                          return [`${formatSecondsPerTurn(Math.round(Number(value) * 60))} / turn`, ""];
                        }
                        if (item?.dataKey === "ddPerTurn") {
                          return [`${Number(value).toFixed(1)} DD / turn`, ""];
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
                    <YAxis yAxisId="minPerTurn" hide />
                    <YAxis yAxisId="ddPerTurn" hide />
                    <Area
                      yAxisId="turns"
                      type="monotone"
                      dataKey="turns"
                      stroke="hsl(200 90% 60%)"
                      strokeWidth={2}
                      fill="url(#turnsFill)"
                      connectNulls
                      dot={false}
                      activeDot={{ r: 5, fill: 'hsl(200 90% 60%)', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                    />
                    <Area
                      yAxisId="minPerTurn"
                      type="monotone"
                      dataKey="minPerTurn"
                      stroke="hsl(150 70% 55%)"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      fill="url(#minPerTurnFill)"
                      connectNulls
                      dot={false}
                      activeDot={{ r: 4, fill: 'hsl(150 70% 55%)', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                    />
                    <Area
                      yAxisId="ddPerTurn"
                      type="monotone"
                      dataKey="ddPerTurn"
                      stroke="hsl(35 90% 60%)"
                      strokeWidth={1.5}
                      strokeDasharray="1 3"
                      fill="url(#ddPerTurnFill)"
                      connectNulls
                      dot={false}
                      activeDot={{ r: 4, fill: 'hsl(35 90% 60%)', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                    />
                  </AreaChart>
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

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 lg:col-span-1">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/35 mb-2">Efficiency</div>
              <div>
                {[
                  { label: "Turns", value: String(periodTurns), testId: "stat-turns" },
                  { label: "Time / Turn", value: timePerTurn ?? "—", testId: "stat-time-per-turn" },
                  { label: "Avg DD / Turn", value: avgDDPerTurn != null ? avgDDPerTurn.toFixed(1) : "—", testId: "stat-avg-dd-per-turn" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-3.5 border-b border-border/[0.07] last:border-b-0">
                    <span className="text-[13px] text-muted-foreground/70">{row.label}</span>
                    <span className="font-mono text-sm tabular-nums text-foreground/90" data-testid={row.testId}>{row.value}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground/50 mt-3 leading-snug">
                Time per turn counts only sessions with start and end times.
              </p>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
