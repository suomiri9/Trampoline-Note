import { useState, useMemo, useEffect, useCallback } from "react";
import {
  format, subDays, addDays, startOfDay, getDay, startOfWeek, endOfWeek,
  eachDayOfInterval, parseISO,
} from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";

interface HeatmapCalendarProps {
  ddByDate: Record<string, { difficulty: number; sessions: number }>;
}

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const CELL_SIZE = 13;
const CELL_GAP = 3;

function getIntensityClass(dd: number | undefined): string {
  if (!dd || dd === 0) return "bg-slate-100 dark:bg-slate-800/40";
  if (dd < 5) return "bg-green-200 dark:bg-green-900/60";
  if (dd < 15) return "bg-green-400 dark:bg-green-700/80";
  if (dd < 30) return "bg-green-500 dark:bg-green-600";
  return "bg-green-700 dark:bg-green-500";
}

export function HeatmapCalendar({ ddByDate }: HeatmapCalendarProps) {
  const [tooltip, setTooltip] = useState<{ date: string; dd: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!tooltip) return;
    const dismiss = () => setTooltip(null);
    document.addEventListener("touchstart", dismiss, { passive: true });
    return () => document.removeEventListener("touchstart", dismiss);
  }, [tooltip]);

  const dismissTooltip = useCallback(() => setTooltip(null), []);

  const today = useMemo(() => startOfDay(new Date()), []);

  const { weeks, monthLabels } = useMemo(() => {
    const numWeeks = 13;
    const currentWeekEnd = endOfWeek(today, { weekStartsOn: 1 });
    const startDate = startOfWeek(subDays(today, (numWeeks - 1) * 7), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: startDate, end: currentWeekEnd });

    const weeksMap: Map<number, { date: Date; key: string }[]> = new Map();
    days.forEach((day) => {
      const weekStart = startOfWeek(day, { weekStartsOn: 1 });
      const weekKey = weekStart.getTime();
      if (!weeksMap.has(weekKey)) weeksMap.set(weekKey, []);
      weeksMap.get(weekKey)!.push({ date: day, key: format(day, "yyyy-MM-dd") });
    });

    const weeksList = Array.from(weeksMap.values());

    const labels: { text: string; col: number }[] = [];
    let lastMonth = -1;
    weeksList.forEach((week, colIdx) => {
      const firstDay = week[0].date;
      const month = firstDay.getMonth();
      if (month !== lastMonth) {
        labels.push({ text: format(firstDay, "MMM"), col: colIdx });
        lastMonth = month;
      }
    });

    return { weeks: weeksList, monthLabels: labels };
  }, [today]);

  const labelWidth = 28;
  const gridWidth = weeks.length * (CELL_SIZE + CELL_GAP);
  const totalWidth = labelWidth + gridWidth;
  const totalHeight = 7 * (CELL_SIZE + CELL_GAP) + 20;

  const handleCellInteraction = (
    e: React.MouseEvent | React.TouchEvent,
    dateKey: string,
    dd: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const containerRect = (e.currentTarget as HTMLElement).closest("[data-testid='heatmap-grid']")?.getBoundingClientRect();
    if (!containerRect) return;
    const rawX = rect.left - containerRect.left + CELL_SIZE / 2;
    const clampedX = Math.max(60, Math.min(rawX, containerRect.width - 60));
    setTooltip({
      date: dateKey,
      dd,
      x: clampedX,
      y: rect.top - containerRect.top - 4,
    });
  };

  return (
    <Card data-testid="heatmap-calendar-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-muted-foreground" />
          Training Activity
        </CardTitle>
        <p className="text-xs text-muted-foreground">Last ~3 months</p>
      </CardHeader>
      <CardContent>
        <div
          className="overflow-x-auto pb-2"
          data-testid="heatmap-grid"
          style={{ position: "relative" }}
          onMouseLeave={dismissTooltip}
        >
          <svg
            width={totalWidth}
            height={totalHeight}
            className="block"
            style={{ minWidth: totalWidth }}
          >
            {monthLabels.map((label, i) => (
              <text
                key={i}
                x={labelWidth + label.col * (CELL_SIZE + CELL_GAP)}
                y={10}
                className="fill-muted-foreground"
                fontSize={10}
                fontFamily="var(--font-body)"
              >
                {label.text}
              </text>
            ))}

            {DAY_LABELS.map((label, i) => (
              label ? (
                <text
                  key={i}
                  x={0}
                  y={20 + i * (CELL_SIZE + CELL_GAP) + CELL_SIZE - 2}
                  className="fill-muted-foreground"
                  fontSize={9}
                  fontFamily="var(--font-body)"
                >
                  {label}
                </text>
              ) : null
            ))}

            {weeks.map((week, colIdx) =>
              week.map(({ date, key }) => {
                const dayOfWeek = (getDay(date) + 6) % 7;
                const isFuture = date > today;
                const dd = ddByDate[key]?.difficulty ?? 0;
                const x = labelWidth + colIdx * (CELL_SIZE + CELL_GAP);
                const y = 18 + dayOfWeek * (CELL_SIZE + CELL_GAP);
                const cellClass = isFuture
                  ? "bg-slate-50 dark:bg-slate-800/20"
                  : getIntensityClass(dd);

                return (
                  <foreignObject
                    key={key}
                    x={x}
                    y={y}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                  >
                    <div
                      data-testid={`heatmap-cell-${key}`}
                      className={`w-full h-full rounded-[3px] transition-colors ${isFuture ? "" : "cursor-pointer"} ${cellClass}`}
                      {...(!isFuture ? {
                        onMouseEnter: (e: React.MouseEvent) => handleCellInteraction(e, key, dd),
                        onTouchStart: (e: React.TouchEvent) => handleCellInteraction(e, key, dd),
                        onClick: (e: React.MouseEvent) => handleCellInteraction(e, key, dd),
                      } : {})}
                    />
                  </foreignObject>
                );
              })
            )}
          </svg>

          {tooltip && (
            <div
              className="absolute z-50 px-2.5 py-1.5 rounded-lg bg-popover text-popover-foreground border border-border shadow-lg text-xs font-medium pointer-events-none whitespace-nowrap"
              style={{
                left: tooltip.x,
                top: tooltip.y,
                transform: "translate(-50%, -100%)",
              }}
              data-testid="heatmap-tooltip"
            >
              <span>{format(parseISO(tooltip.date), "EEE, d MMM yyyy")}</span>
              <span className="ml-2 text-muted-foreground">
                {tooltip.dd > 0 ? `${tooltip.dd.toFixed(1)} DD` : "Rest day"}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-1.5 mt-3" data-testid="heatmap-legend">
          <span className="text-[10px] text-muted-foreground mr-1">Less</span>
          <div className="w-3 h-3 rounded-[3px] bg-slate-100 dark:bg-slate-800/40" />
          <div className="w-3 h-3 rounded-[3px] bg-green-200 dark:bg-green-900/60" />
          <div className="w-3 h-3 rounded-[3px] bg-green-400 dark:bg-green-700/80" />
          <div className="w-3 h-3 rounded-[3px] bg-green-500 dark:bg-green-600" />
          <div className="w-3 h-3 rounded-[3px] bg-green-700 dark:bg-green-500" />
          <span className="text-[10px] text-muted-foreground ml-1">More</span>
        </div>
      </CardContent>
    </Card>
  );
}
