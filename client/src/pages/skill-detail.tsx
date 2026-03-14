import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useSkills } from "@/hooks/use-skills";
import { PageLayout } from "@/components/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Hash, Star, TrendingUp, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, parseISO, startOfWeek, eachWeekOfInterval } from "date-fns";

interface HistoryEntry {
  noteId: number;
  date: string;
  reps: number;
  rating: number | null;
}

export default function SkillDetailPage() {
  const [, params] = useRoute("/skills/:id");
  const [, navigate] = useLocation();
  const skillId = Number(params?.id);

  const { data: allSkills, isLoading: skillsLoading } = useSkills();
  const skill = allSkills?.find(s => s.id === skillId);

  const { data: history, isLoading: historyLoading } = useQuery<HistoryEntry[]>({
    queryKey: ["/api/skills", skillId, "history"],
    queryFn: async () => {
      const res = await fetch(`/api/skills/${skillId}/history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    enabled: !!skillId,
  });

  if (skillsLoading || historyLoading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
        </div>
      </PageLayout>
    );
  }

  if (!skill) {
    return (
      <PageLayout>
        <div className="text-center py-16">
          <p className="text-muted-foreground">Skill not found.</p>
          <Button variant="ghost" className="mt-4" onClick={() => navigate("/skills")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Skills
          </Button>
        </div>
      </PageLayout>
    );
  }

  const entries = history || [];
  const totalReps = entries.reduce((sum, e) => sum + e.reps, 0);
  const totalSessions = entries.length;
  const firstPracticed = entries.length > 0 ? entries[0].date : null;
  const lastPracticed = entries.length > 0 ? entries[entries.length - 1].date : null;

  const typeLabel = skill.isDrill === 0 ? "Skill" : skill.isDrill === 1 ? "Drill" : "Connection";

  const weeklyData = buildWeeklyData(entries);

  return (
    <PageLayout>
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 -ml-2 mb-2 text-muted-foreground"
          onClick={() => navigate("/skills")}
          data-testid="button-back-to-skills"
        >
          <ArrowLeft className="w-4 h-4" /> Skills
        </Button>
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-display font-bold" data-testid="text-skill-name">{skill.name}</h1>
              <Badge variant="secondary" data-testid="badge-skill-type">{typeLabel}</Badge>
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              Code: <span className="font-mono font-medium" data-testid="text-skill-code">{skill.code}</span>
              {" · "}
              Difficulty: <span className="font-medium" data-testid="text-skill-difficulty">{skill.difficulty.toFixed(1)}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={<Hash className="w-4 h-4" />}
          label="Total Reps"
          value={totalReps.toString()}
          testId="stat-total-reps"
        />
        <StatCard
          icon={<Calendar className="w-4 h-4" />}
          label="Sessions"
          value={totalSessions.toString()}
          testId="stat-total-sessions"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="First Practiced"
          value={firstPracticed ? format(parseISO(firstPracticed), "MMM d, yyyy") : "—"}
          testId="stat-first-practiced"
        />
        <StatCard
          icon={<Star className="w-4 h-4" />}
          label="Last Practiced"
          value={lastPracticed ? format(parseISO(lastPracticed), "MMM d, yyyy") : "—"}
          testId="stat-last-practiced"
        />
      </div>

      {weeklyData.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Reps per Week</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--popover))",
                      color: "hsl(var(--popover-foreground))",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="reps" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Session History</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center" data-testid="text-no-history">
              No training sessions found for this skill yet.
            </p>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto" data-testid="list-session-history">
              {[...entries].reverse().map((entry) => (
                <div
                  key={`${entry.noteId}-${entry.date}`}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  data-testid={`row-session-${entry.noteId}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium" data-testid={`text-date-${entry.noteId}`}>
                      {format(parseISO(entry.date), "MMM d, yyyy")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono text-xs" data-testid={`badge-reps-${entry.noteId}`}>
                      {entry.reps} rep{entry.reps !== 1 ? "s" : ""}
                    </Badge>
                    {entry.rating != null && (
                      <div className="flex items-center gap-1" data-testid={`text-rating-${entry.noteId}`}>
                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                        <span className="text-xs font-medium">{entry.rating}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  );
}

function StatCard({ icon, label, value, testId }: { icon: React.ReactNode; label: string; value: string; testId: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <p className="text-lg font-bold truncate" data-testid={testId}>{value}</p>
      </CardContent>
    </Card>
  );
}

function buildWeeklyData(entries: HistoryEntry[]) {
  if (entries.length === 0) return [];

  const dates = entries.map(e => parseISO(e.date));
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  const weeks = eachWeekOfInterval({ start: minDate, end: maxDate }, { weekStartsOn: 1 });

  const weekMap = new Map<string, number>();
  for (const weekStart of weeks) {
    weekMap.set(weekStart.toISOString(), 0);
  }

  for (const entry of entries) {
    const d = parseISO(entry.date);
    const ws = startOfWeek(d, { weekStartsOn: 1 });
    const key = ws.toISOString();
    weekMap.set(key, (weekMap.get(key) || 0) + entry.reps);
  }

  return Array.from(weekMap.entries()).map(([key, reps]) => ({
    label: format(new Date(key), "MMM d"),
    reps,
  }));
}
