import { useNotes } from "@/hooks/use-notes";
import { useSkills } from "@/hooks/use-skills";
import { useRoutines } from "@/hooks/use-routines";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";

export default function StatsPage() {
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

  const dailyStats = notes?.reduce((acc: any[], note) => {
    const dateStr = format(parseISO(note.date), "MMM dd");
    let skillsData: any[] = [];
    try {
      skillsData = note.skills ? JSON.parse(note.skills) : [];
      if (!Array.isArray(skillsData)) {
        skillsData = note.skills.split(',').map((s: string) => ({ id: parseInt(s) }));
      }
    } catch (e) {
      skillsData = note.skills ? note.skills.split(',').map((s: string) => ({ id: parseInt(s) })) : [];
    }

    let noteDD = 0;
    let currentGroupDD = 0;
    let currentGroupReps = 1;

    skillsData.forEach((item) => {
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

    const existingDay = acc.find(d => d.date === dateStr);
    if (existingDay) {
      existingDay.difficulty += noteDD;
      existingDay.sessions += 1;
    } else {
      acc.push({ date: dateStr, difficulty: noteDD, sessions: 1, rawDate: note.date });
    }
    return acc;
  }, []) || [];

  const chartData = dailyStats.sort((a, b) => new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime());

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
            <CardTitle className="text-lg font-semibold flex items-center justify-between">
              Daily Total Difficulty
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-secondary px-2 py-1 rounded-lg">Last {chartData.length} Days</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    dy={10}
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
                    cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                  />
                  <Bar 
                    dataKey="difficulty" 
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]} 
                    barSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="rounded-2xl border-border/50 shadow-lg shadow-black/5">
            <CardContent className="pt-6">
              <div className="text-sm font-medium text-muted-foreground mb-1">Total DD Earned</div>
              <div className="text-3xl font-display font-bold text-primary">
                {chartData.reduce((sum, d) => sum + d.difficulty, 0).toFixed(1)}
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-border/50 shadow-lg shadow-black/5">
            <CardContent className="pt-6">
              <div className="text-sm font-medium text-muted-foreground mb-1">Total Sessions</div>
              <div className="text-3xl font-display font-bold text-primary">
                {chartData.reduce((sum, d) => sum + d.sessions, 0)}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
