import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  BarChart3,
  Check,
  CircleHelp,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ExecutionSession, Routine, Skill, TofSession } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  alignComparisonSeries,
  buildComparisonTargetOptions,
  buildExecutionComparisonSeries,
  buildTofComparisonSeries,
  comparisonMetric,
  filterComparisonTargets,
  type AlignedComparisonPoint,
  type ComparisonMetric,
  type ComparisonSeries,
  type ComparisonTargetOption,
  type ComparisonTracker,
} from "@/lib/tracker-comparison";

const SERIES_COLORS = [
  "#f59e0b",
  "#38bdf8",
  "#a78bfa",
  "#34d399",
  "#fb7185",
  "#facc15",
];

const chartTooltipStyle = {
  borderRadius: "12px",
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  fontSize: "12px",
};

export function TrackerComparison({
  tracker,
  sessions,
  routines,
  allSkills,
}: {
  tracker: ComparisonTracker;
  sessions: TofSession[] | ExecutionSession[] | undefined;
  routines: Routine[] | undefined;
  allSkills: Skill[] | undefined;
}) {
  const metricOptions = tracker === "tof"
    ? [
        comparisonMetric("tof", "total"),
        comparisonMetric("tof", "skill"),
      ]
    : [
        comparisonMetric("execution", "total"),
        comparisonMetric("execution", "eScore"),
        comparisonMetric("execution", "skill"),
      ];
  const [metricId, setMetricId] = useState<ComparisonMetric>(metricOptions[0].id);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const metric = comparisonMetric(tracker, metricId);

  const options = useMemo(
    () =>
      buildComparisonTargetOptions({
        tracker,
        routines,
        allSkills,
        sessions,
      }),
    [tracker, routines, allSkills, sessions],
  );
  const compatibleOptions = useMemo(
    () => filterComparisonTargets(options, metric),
    [options, metric],
  );
  const selectedOptions = useMemo(
    () => compatibleOptions.filter(option => selectedKeys.includes(option.key)),
    [compatibleOptions, selectedKeys],
  );
  const series = useMemo<ComparisonSeries[]>(() => {
    if (tracker === "tof") {
      return buildTofComparisonSeries({
        selectedKeys,
        sessions: sessions as TofSession[] | undefined,
        routines,
        allSkills,
        metric: metricId === "skill" ? "skill" : "total",
      });
    }
    return buildExecutionComparisonSeries({
      selectedKeys,
      sessions: sessions as ExecutionSession[] | undefined,
      routines,
      allSkills,
      metric: metricId,
    });
  }, [tracker, sessions, routines, allSkills, selectedKeys, metricId]);
  const chartData = useMemo(() => alignComparisonSeries(series), [series]);

  const toggleTarget = (option: ComparisonTargetOption) => {
    if (option.recordCount === 0) return;
    setSelectedKeys(current =>
      current.includes(option.key)
        ? current.filter(key => key !== option.key)
        : [...current, option.key],
    );
  };

  const changeMetric = (value: string) => {
    setMetricId(value as ComparisonMetric);
    // A routine total and a skill sample have different meanings even when
    // their underlying units happen to match, so never carry a selection
    // across metric scopes.
    setSelectedKeys([]);
  };

  return (
    <div className="space-y-4" data-testid={`tracker-comparison-${tracker}`}>
      <section className="rounded-2xl border border-border/15 bg-white/[0.02] p-4 sm:p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-9 w-9 shrink-0 rounded-xl bg-[hsl(var(--page-accent)/0.12)] border border-[hsl(var(--page-accent)/0.22)] flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-[hsl(var(--page-accent))]" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-base">Build a comparison</h2>
            <p className="text-xs text-muted-foreground/70 mt-0.5 leading-relaxed">
              Choose one metric, then add two or more recorded series. Each line uses its own recorded dates.
            </p>
          </div>
        </div>

        <label className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/60 block mb-1.5" htmlFor={`comparison-metric-${tracker}`}>
          Metric
        </label>
        <Select value={metricId} onValueChange={changeMetric}>
          <SelectTrigger
            id={`comparison-metric-${tracker}`}
            className="w-full sm:w-[min(100%,360px)] rounded-xl border-white/[0.08] bg-white/[0.025]"
            data-testid={`select-comparison-metric-${tracker}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {metricOptions.map(option => (
              <SelectItem key={option.id} value={option.id} data-testid={`option-comparison-metric-${option.id}`}>
                <span className="flex flex-col text-left">
                  <span>{option.label} · {option.unit}</span>
                  <span className="text-[10px] text-muted-foreground">{option.description}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground/65 leading-relaxed">
          <CircleHelp className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          Totals and per-skill records are kept in separate views, so seconds or points are never overlaid as if they were the same measure.
        </p>
      </section>

      <section className="rounded-2xl border border-border/15 bg-white/[0.02] p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <div>
            <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/65">
              {metric.targetKind === "routine" ? "Routine series" : "Skill series"}
            </h2>
            <p className="text-xs text-muted-foreground/65 mt-1">
              {selectedOptions.length === 0
                ? "Select one or more recorded series below."
                : `${selectedOptions.length} selected · ${metric.unit}`}
            </p>
          </div>
          {selectedOptions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-muted-foreground"
              onClick={() => setSelectedKeys([])}
              data-testid={`button-clear-comparison-${tracker}`}
            >
              Clear
            </Button>
          )}
        </div>

        {selectedOptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3" data-testid={`selected-comparison-${tracker}`}>
            {selectedOptions.map(option => (
              <button
                key={option.key}
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--page-accent)/0.3)] bg-[hsl(var(--page-accent)/0.1)] px-2.5 py-1 text-xs font-medium text-foreground hover:bg-[hsl(var(--page-accent)/0.17)] pressable"
                onClick={() => toggleTarget(option)}
                aria-label={`Remove ${option.label}`}
                data-testid={`chip-comparison-${option.key}`}
              >
                <span className="max-w-[180px] truncate">{option.label}</span>
                <X className="h-3 w-3 shrink-0" />
              </button>
            ))}
          </div>
        )}

        {compatibleOptions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.1] px-4 py-6 text-center text-xs text-muted-foreground/70">
            Add a routine or skill first to create a comparison.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-0.5" data-testid={`picker-comparison-${tracker}`}>
            {compatibleOptions.map(option => {
              const checked = selectedKeys.includes(option.key);
              const disabled = option.recordCount === 0;
              return (
                <button
                  key={option.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleTarget(option)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors min-w-0",
                    checked
                      ? "border-[hsl(var(--page-accent)/0.38)] bg-[hsl(var(--page-accent)/0.1)]"
                      : "border-white/[0.08] bg-white/[0.015] hover:bg-white/[0.05]",
                    disabled && "cursor-not-allowed opacity-40",
                  )}
                  data-testid={`option-comparison-target-${option.key}`}
                >
                  <span className={cn(
                    "h-4 w-4 shrink-0 rounded border flex items-center justify-center",
                    checked
                      ? "border-[hsl(var(--page-accent))] bg-[hsl(var(--page-accent))] text-background"
                      : "border-muted-foreground/40",
                  )}>
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate">{option.label}</span>
                    <span className="block text-[10px] text-muted-foreground/65 truncate">{option.description}</span>
                  </span>
                  <span className="shrink-0 text-[10px] font-mono text-muted-foreground/55">
                    {option.recordCount > 0 ? `${option.recordCount} record${option.recordCount === 1 ? "" : "s"}` : "No history"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selectedOptions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.1] px-5 py-14 text-center" data-testid={`empty-comparison-${tracker}`}>
          <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground/35 mb-3" />
          <h2 className="font-semibold">Nothing to compare yet.</h2>
          <p className="text-sm text-muted-foreground/65 mt-1 max-w-sm mx-auto">
            Add at least two series for the clearest comparison, or start with one to inspect its recorded history.
          </p>
        </div>
      ) : chartData.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.1] px-5 py-14 text-center" data-testid={`empty-comparison-data-${tracker}`}>
          <h2 className="font-semibold">No recorded values for this metric.</h2>
          <p className="text-sm text-muted-foreground/65 mt-1 max-w-sm mx-auto">
            Try a different metric or select a series with matching historical records.
          </p>
        </div>
      ) : (
        <ComparisonChart
          tracker={tracker}
          metric={metric}
          series={series}
          data={chartData}
        />
      )}
    </div>
  );
}

function ComparisonChart({
  tracker,
  metric,
  series,
  data,
}: {
  tracker: ComparisonTracker;
  metric: ReturnType<typeof comparisonMetric>;
  series: ComparisonSeries[];
  data: AlignedComparisonPoint[];
}) {
  const seriesByKey = useMemo(
    () => new Map(series.map(item => [item.key, item])),
    [series],
  );

  return (
    <section className="rounded-2xl border border-border/15 bg-white/[0.02] p-4 sm:p-5" data-testid={`chart-comparison-${tracker}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/65">
            {metric.label}
          </h2>
          <p className="text-xs text-muted-foreground/65 mt-1">
            Recorded dates only · {metric.unit} · straight lines connect adjacent records
          </p>
        </div>
        <span className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/55">
          {metric.higherIsBetter ? "higher is better" : "lower is better"}
        </span>
      </div>

      <div className="h-64 sm:h-72 w-full" data-testid={`plot-comparison-${tracker}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.45)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={value => formatChartDate(String(value))}
              interval="preserveStartEnd"
              minTickGap={38}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={value => formatValue(Number(value), metric.unit)}
              domain={["auto", "auto"]}
              width={48}
              axisLine={false}
              tickLine={false}
            />
            <ChartTooltip
              content={
                <ComparisonTooltip metric={metric} seriesByKey={seriesByKey} />
              }
            />
            <Legend content={<ComparisonLegend series={series} metric={metric} />} />
            {series.map((item, index) => (
              <Line
                key={item.key}
                type="linear"
                dataKey={item.key}
                name={item.label}
                stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                strokeWidth={2}
                connectNulls={false}
                dot={{
                  r: 3,
                  fill: SERIES_COLORS[index % SERIES_COLORS.length],
                  stroke: SERIES_COLORS[index % SERIES_COLORS.length],
                  strokeWidth: 0,
                }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-muted-foreground/55 mt-2">
        Missing records remain gaps; they are not treated as zero.
      </p>
    </section>
  );
}

function ComparisonTooltip({
  active,
  payload,
  label,
  metric,
  seriesByKey,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number | null }>;
  label?: string;
  metric: ReturnType<typeof comparisonMetric>;
  seriesByKey: Map<string, ComparisonSeries>;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload
    .filter(entry => entry.value != null && typeof entry.dataKey === "string")
    .map(entry => {
      const item = seriesByKey.get(entry.dataKey!);
      return item ? { item, value: Number(entry.value) } : null;
    })
    .filter((entry): entry is { item: ComparisonSeries; value: number } => entry != null);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-popover px-3 py-2 shadow-xl">
      <div className="font-mono text-[10px] text-muted-foreground/75 mb-1.5">
        {label ? formatChartDate(label, true) : ""}
      </div>
      <div className="space-y-1">
        {rows.map(({ item, value }) => {
          const point = item.points.find(candidate => candidate.date === label);
          return (
            <div key={item.key} className="flex items-center gap-3 text-xs">
              <span className="truncate max-w-[150px]">{item.label}</span>
              <span className="ml-auto font-mono font-semibold tabular-nums">
                {formatValue(value, metric.unit)} {metric.unit === "seconds" ? "s" : "pts"}
                {point?.count && point.count > 1 ? ` · n=${point.count}` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ComparisonLegend({
  series,
  metric,
}: {
  series: ComparisonSeries[];
  metric: ReturnType<typeof comparisonMetric>;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 pt-2">
      {series.map((item, index) => (
        <span key={item.key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }}
          />
          <span className="max-w-[150px] truncate">{item.label}</span>
          <span className="font-mono text-[9px] text-muted-foreground/55">{metric.unit}</span>
        </span>
      ))}
    </div>
  );
}

function formatChartDate(value: string, long = false): string {
  try {
    return format(parseISO(value), long ? "MMM d, yyyy" : "MMM d");
  } catch {
    return value;
  }
}

function formatValue(value: number, unit: "seconds" | "points"): string {
  return value.toFixed(unit === "seconds" ? 3 : 2);
}
