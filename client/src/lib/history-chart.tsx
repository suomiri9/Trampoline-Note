import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, parseISO, eachDayOfInterval } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface CompletionEntry {
  noteId: number;
  date: string;
  rating: number | null;
  attempt: number | null;
  skillCount: number;
  reps?: number;
}

export interface RepsEntry {
  noteId: number;
  date: string;
  reps: number;
  rating: number | null;
}

const repsOf = (e: { reps?: number }) => (e.reps && e.reps > 0 ? e.reps : 1);

export function PartialBar(props: any) {
  const { x, y, width, height, payload, fill } = props;
  if (!height || height <= 0) return null;
  const rounded = payload?.full === 0;
  const r = rounded ? Math.min(4, width / 2, height) : 0;
  if (r === 0) {
    return <rect x={x} y={y} width={width} height={height} fill={fill} />;
  }
  const d = `M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} Z`;
  return <path d={d} fill={fill} />;
}

export function buildDailyCompletion(entries: CompletionEntry[]) {
  if (entries.length === 0) return [];

  const dates = entries.map(e => parseISO(e.date));
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  const days = eachDayOfInterval({ start: minDate, end: maxDate });

  const dayMap = new Map<string, { full: number; partial: number }>();
  for (const day of days) {
    dayMap.set(format(day, "yyyy-MM-dd"), { full: 0, partial: 0 });
  }

  for (const entry of entries) {
    const key = entry.date;
    const reps = repsOf(entry);
    const cur = dayMap.get(key) || { full: 0, partial: 0 };
    if (entry.attempt == null) cur.full += reps;
    else cur.partial += reps;
    dayMap.set(key, cur);
  }

  return Array.from(dayMap.entries())
    .filter(([, v]) => v.full > 0 || v.partial > 0)
    .map(([key, v]) => ({
      label: format(parseISO(key), "MMM d"),
      full: v.full,
      partial: v.partial,
    }));
}

export function buildDailyReps(entries: RepsEntry[]) {
  if (entries.length === 0) return [];

  const dates = entries.map(e => parseISO(e.date));
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  const days = eachDayOfInterval({ start: minDate, end: maxDate });

  const dayMap = new Map<string, number>();
  for (const day of days) {
    dayMap.set(format(day, "yyyy-MM-dd"), 0);
  }

  for (const entry of entries) {
    const key = entry.date;
    dayMap.set(key, (dayMap.get(key) || 0) + repsOf(entry));
  }

  return Array.from(dayMap.entries())
    .filter(([, reps]) => reps > 0)
    .map(([key, reps]) => ({
      label: format(parseISO(key), "MMM d"),
      reps,
    }));
}

const tooltipStyle = {
  borderRadius: "8px",
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  fontSize: "12px",
};

export function CompletionChart({ title, data }: { title: string; data: ReturnType<typeof buildDailyCompletion> }) {
  if (data.length === 0) return null;
  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1" data-testid="legend-full">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "hsl(var(--primary))" }} />
              Full runs
            </span>
            <span className="flex items-center gap-1" data-testid="legend-partial">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "hsl(var(--muted-foreground))" }} />
              Attempts
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="20%" maxBarSize={28}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" interval="preserveStartEnd" minTickGap={40} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="partial" stackId="runs" name="Attempts" fill="hsl(var(--muted-foreground))" shape={<PartialBar />} />
              <Bar dataKey="full" stackId="runs" name="Full runs" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function RepsChart({ title, data }: { title: string; data: ReturnType<typeof buildDailyReps> }) {
  if (data.length === 0) return null;
  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="20%" maxBarSize={28}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" interval="preserveStartEnd" minTickGap={40} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="reps" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
