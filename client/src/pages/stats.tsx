import { useState } from "react";
import { useNotes } from "@/hooks/use-notes";
import { useSkills } from "@/hooks/use-skills";
import { useRoutines } from "@/hooks/use-routines";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  format, parseISO, eachDayOfInterval, eachMonthOfInterval,
  startOfDay, startOfWeek, endOfWeek, startOfMonth,
  subDays, subMonths,
} from "date-fns";

type Range = "week" | "month" | "year" | "all";

export default function StatsPage() {
  const [range, setRange] = useState<Range>("week");

  const { data: notes, isLoading: notesLoading } = useNotes();
  const { data: allItems, isLoading: skillsLoading } = useSkills();
  const { data: routines, isLoading: routinesLoading } = useRoutines();

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
    let skillsData: any[] = [];
    try {
      skillsData = note.skills ? JSON.parse(note.skills) : [];
      if (!Array.isArray(skillsData)) skillsData = note.skills.split(',').map((s: string) => ({ id: parseInt(s) }));
    } catch (e) {
      skillsData = note.skills ? note.skills.split(',').map((s: string) => ({ id: parseInt(s) })) : [];
    }

    let noteDD = 0;
    let currentGroupDD = 0;
    let currentGroupReps = 1;

    skillsData.forEach((item: any) => {
      if (item.id === -1) {
        noteDD += currentGroupDD * currentGroupReps;
        currentGroupDD = 0;
        currentGroupReps = 1;
      } else if (item.id === -2) {
        const routine = routines?.find(r => r.id === item.routineId);
        if (routine) {
          const routineDD = routine.skillIds.reduce((sum, sid) => {
            const skill = allItems?.find(s => s.id === sid);
            return sum + (skill?.difficulty || 0);
          }, 0);
          noteDD += routineDD * (item.reps || 1);
        }
      } else {
        const skill = allItems?.find(s => s.id === item.id);
        currentGroupDD += (skill?.difficulty || 0);
        currentGroupReps = item.reps || 1;
      }
    });
    noteDD += currentGroupDD * currentGroupReps;

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
  let xDateFormat = "MMM dd";
  let useMonthly = false;

  if (range === "week") {
    const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });     // Sunday
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
    xDateFormat = "EEE";
    chartData = days.map(day => {
      const key = format(day, "yyyy-MM-dd");
      const found = ddByDate[key];
      const isFuture = day > today;
      return { date: format(day, "EEE"), difficulty: found?.difficulty ?? (isFuture ? null : null), sessions: found?.sessions ?? 0 };
    });
  } else if (range === "month") {
    const monthStart = subDays(today, 29);
    const days = eachDayOfInterval({ start: monthStart, end: today });
    xTickInterval = 4; // show every 5th label
    chartData = days.map(day => {
      const key = format(day, "yyyy-MM-dd");
      const found = ddByDate[key];
      return { date: format(day, "MMM dd"), difficulty: found?.difficulty ?? null, sessions: found?.sessions ?? 0 };
    });
  } else if (range === "year") {
    useMonthly = true;
    const yearStart = startOfMonth(subMonths(today, 11));
    const months = eachMonthOfInterval({ start: yearStart, end: today });
    chartData = months.map(month => {
      const label = format(month, "MMM yy");
      const totalDD = Object.entries(ddByDate)
        .filter(([k]) => k.startsWith(format(month, "yyyy-MM")))
        .reduce((sum, [, v]) => sum + v.difficulty, 0);
      const totalSess = Object.entries(ddByDate)
        .filter(([k]) => k.startsWith(format(month, "yyyy-MM")))
        .reduce((sum, [, v]) => sum + v.sessions, 0);
      return { date: label, difficulty: totalDD > 0 ? totalDD : null, sessions: totalSess };
    });
  } else {
    // all — monthly aggregation
    useMonthly = true;
    const allKeys = Object.keys(ddByDate).sort();
    if (allKeys.length > 0) {
      const earliest = startOfMonth(parseISO(allKeys[0]));
      const months = eachMonthOfInterval({ start: earliest, end: today });
      chartData = months.map(month => {
        const label = format(month, "MMM yy");
        const totalDD = Object.entries(ddByDate)
          .filter(([k]) => k.startsWith(format(month, "yyyy-MM")))
          .reduce((sum, [, v]) => sum + v.difficulty, 0);
        const totalSess = Object.entries(ddByDate)
          .filter(([k]) => k.startsWith(format(month, "yyyy-MM")))
          .reduce((sum, [, v]) => sum + v.sessions, 0);
        return { date: label, difficulty: totalDD > 0 ? totalDD : null, sessions: totalSess };
      });
    }
  }

  const trainingDaysInRange = chartData.filter(d => d.difficulty !== null).length;
  const totalDDInRange = chartData.reduce((sum, d) => sum + (d.difficulty ?? 0), 0);
  const totalSessionsInRange = chartData.reduce((sum, d) => sum + d.sessions, 0);

  const rangeLabels: Record<Range, string> = {
    week: "This Week",
    month: "Last 30 Days",
    year: "Last 12 Months",
    all: "All Time",
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-primary/10 rounded-2xl">
          <TrendingUp className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold">Progress Analytics</h1>
          <p className="text-muted-foreground text-sm">Tracking your daily training intensity</p>
        </div>
      </div>

      <div className="grid gap-6">
        <Card className="rounded-[2rem] border-border/50 shadow-xl shadow-black/5 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold flex items-center justify-between gap-3">
              <span>Daily Total Difficulty</span>
              <Select value={range} onValueChange={(v) => setRange(v as Range)}>
                <SelectTrigger className="w-36 h-8 rounded-xl text-xs border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">1 Week</SelectItem>
                  <SelectItem value="month">1 Month</SelectItem>
                  <SelectItem value="year">1 Year</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {rangeLabels[range]} · {trainingDaysInRange} training {useMonthly ? "months" : "days"}
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full mt-4">
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
                    connectNulls={false}
                    dot={{ fill: 'hsl(var(--primary))', r: 4, strokeWidth: 0 }}
                    activeDot={{ r: 6, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="rounded-2xl border-border/50 shadow-lg shadow-black/5">
            <CardContent className="pt-6">
              <div className="text-sm font-medium text-muted-foreground mb-1">Total DD — {rangeLabels[range]}</div>
              <div className="text-3xl font-display font-bold text-primary">
                {totalDDInRange.toFixed(1)}
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-border/50 shadow-lg shadow-black/5">
            <CardContent className="pt-6">
              <div className="text-sm font-medium text-muted-foreground mb-1">Sessions — {rangeLabels[range]}</div>
              <div className="text-3xl font-display font-bold text-primary">
                {totalSessionsInRange}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
