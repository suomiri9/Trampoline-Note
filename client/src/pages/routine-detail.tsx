import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useSkills } from "@/hooks/use-skills";
import { useRoutines } from "@/hooks/use-routines";
import { useAuth } from "@/hooks/use-auth";
import { calcDDFromSkillIds } from "@/lib/training-utils";
import { PageLayout } from "@/components/page-layout";
import { PointsToFix, parsePoints } from "@/components/points-to-fix";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Star, TrendingUp, Loader2, Layers, ChevronLeft, ChevronRight, Wrench } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useRef, useCallback, useMemo, useState } from "react";
import { CompletionChart, buildDailyCompletion } from "@/lib/history-chart";

interface RoutineHistoryEntry {
  noteId: number;
  date: string;
  rating: number | null;
  attempt: number | null;
  skillCount: number;
  reps?: number;
}

export default function RoutineDetailPage() {
  const [, params] = useRoute("/routines/:id");
  const [, navigate] = useLocation();
  const routineId = Number(params?.id);

  const { data: allSkills, isLoading: skillsLoading } = useSkills();
  const skills = allSkills?.filter(s => s.isDrill === 0);
  const { data: routines, isLoading: routinesLoading } = useRoutines();
  const { user } = useAuth();
  const routine = routines?.find(r => r.id === routineId);

  const [pointsOpen, setPointsOpen] = useState(false);
  const routinePoints = useMemo(
    () => parsePoints(user?.focusMemo).filter(p => p.routineIds.includes(routineId)),
    [user?.focusMemo, routineId],
  );

  const orderedIds = routines ? routines.filter(r => r.archived !== 1 || r.id === routineId).map(r => r.id) : [];
  const currentIndex = orderedIds.indexOf(routineId);

  const goTo = useCallback((id: number) => navigate(`/routines/${id}`, { replace: true }), [navigate]);
  const goPrev = useCallback(() => { if (currentIndex > 0) goTo(orderedIds[currentIndex - 1]); }, [currentIndex, orderedIds, goTo]);
  const goNext = useCallback(() => { if (currentIndex < orderedIds.length - 1) goTo(orderedIds[currentIndex + 1]); }, [currentIndex, orderedIds, goTo]);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swiping = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swiping.current = true;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!swiping.current) return;
    swiping.current = false;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goNext();
      else goPrev();
    }
  }, [goNext, goPrev]);

  const { data: history, isLoading: historyLoading } = useQuery<RoutineHistoryEntry[]>({
    queryKey: [`/api/routines/${routineId}/history`],
    enabled: !!routineId && routineId > 0,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  if (skillsLoading || routinesLoading || historyLoading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
        </div>
      </PageLayout>
    );
  }

  if (!routine) {
    return (
      <PageLayout>
        <div className="text-center py-16">
          <p className="text-muted-foreground">Routine not found.</p>
          <Button variant="ghost" className="mt-4" onClick={() => navigate("/routines")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Routines
          </Button>
        </div>
      </PageLayout>
    );
  }

  const entries = history || [];
  const repsOf = (e: RoutineHistoryEntry) => (e.reps && e.reps > 0 ? e.reps : 1);
  const totalSessions = entries.reduce((s, e) => s + repsOf(e), 0);
  const firstPracticed = entries.length > 0 ? entries[0].date : null;
  const lastPracticed = entries.length > 0 ? entries[entries.length - 1].date : null;
  const fullRunCount = entries.filter(e => e.attempt == null).reduce((s, e) => s + repsOf(e), 0);
  const partialCount = entries.filter(e => e.attempt != null).reduce((s, e) => s + repsOf(e), 0);
  const totalDD = calcDDFromSkillIds(routine.skillIds, allSkills || []);

  const weeklyData = buildDailyCompletion(entries);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < orderedIds.length - 1;
  const prevRoutine = hasPrev ? routines?.find(r => r.id === orderedIds[currentIndex - 1]) : null;
  const nextRoutine = hasNext ? routines?.find(r => r.id === orderedIds[currentIndex + 1]) : null;

  return (
    <PageLayout>
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 -ml-2 text-muted-foreground"
              onClick={() => navigate("/routines")}
              data-testid="button-back-to-routines"
            >
              <ArrowLeft className="w-4 h-4" /> Routines
            </Button>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={!hasPrev}
                onClick={goPrev}
                data-testid="button-prev-routine"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums min-w-[3ch] text-center">
                {currentIndex + 1}/{orderedIds.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={!hasNext}
                onClick={goNext}
                data-testid="button-next-routine"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-zinc-100 dark:bg-zinc-800/30 rounded-xl shrink-0">
              <Layers className="w-5 h-5 text-zinc-600" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold" data-testid="text-routine-name">{routine.name}</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Total DD: <span className="font-medium" data-testid="text-routine-dd">{totalDD.toFixed(1)}</span>
              </p>
            </div>
          </div>
        </div>

        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3">
              {routine.skillIds.map((id, idx) => {
                const skill = skills?.find(s => s.id === id);
                return (
                  <div key={idx} className="flex flex-col items-center gap-1">
                    <Badge variant="outline" className="px-2 py-1 font-mono" data-testid={`badge-routine-skill-${idx}`}>
                      {skill?.code || "???"}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-semibold">
                      {skill?.difficulty.toFixed(1) || "0.0"}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <StatCard
            icon={<Calendar className="w-4 h-4" />}
            label="Total Sessions"
            value={totalSessions.toString()}
            testId="stat-total-sessions"
          />
          <StatCard
            icon={<TrendingUp className="w-4 h-4" />}
            label={`Full Runs (${routine.skillIds.length}/${routine.skillIds.length})`}
            value={totalSessions > 0 ? `${fullRunCount} (${Math.round((fullRunCount / totalSessions) * 100)}%)` : fullRunCount.toString()}
            testId="stat-full-runs"
          />
          <StatCard
            icon={<TrendingUp className="w-4 h-4" />}
            label="Attempts"
            value={partialCount.toString()}
            testId="stat-partial-attempts"
          />
          <StatCard
            icon={<Calendar className="w-4 h-4" />}
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

        {routinePoints.length > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                Points to Fix
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1.5" data-testid="list-routine-points">
                {routinePoints.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPointsOpen(true)}
                    data-testid={`button-routine-point-${p.id}`}
                    className="text-left text-sm py-2 px-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors break-words"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <CompletionChart title="Practice Frequency" data={weeklyData} />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Session History</CardTitle>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center" data-testid="text-no-history">
                No training sessions found for this routine yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-[50vh] overflow-y-auto" data-testid="list-session-history">
                {[...entries].reverse().map((entry) => {
                  const reps = entry.reps && entry.reps > 0 ? entry.reps : 1;
                  return (
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
                      {reps > 1 && (
                        <span className="text-xs font-mono text-muted-foreground" data-testid={`text-reps-${entry.noteId}`}>×{reps}</span>
                      )}
                      <Badge
                        variant={entry.attempt != null ? "secondary" : "outline"}
                        className="font-mono text-xs"
                        data-testid={`badge-attempt-${entry.noteId}`}
                      >
                        {entry.attempt != null
                          ? `attempt ${entry.skillCount}/${routine.skillIds.length}`
                          : entry.skillCount > routine.skillIds.length
                            ? `${entry.skillCount} skills`
                            : `${routine.skillIds.length}/${routine.skillIds.length} Full run`}
                      </Badge>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between items-center mt-6 text-sm text-muted-foreground">
          <button
            className="flex items-center gap-1 hover:text-foreground transition-colors disabled:opacity-30"
            disabled={!hasPrev}
            onClick={goPrev}
            data-testid="button-prev-routine-bottom"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="truncate max-w-[120px]">{prevRoutine?.name || ""}</span>
          </button>
          <button
            className="flex items-center gap-1 hover:text-foreground transition-colors disabled:opacity-30"
            disabled={!hasNext}
            onClick={goNext}
            data-testid="button-next-routine-bottom"
          >
            <span className="truncate max-w-[120px]">{nextRoutine?.name || ""}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <PointsToFix
          hideTrigger
          open={pointsOpen}
          onOpenChange={setPointsOpen}
          initialFilter={{ kind: "routine", id: routineId }}
        />
      </div>
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
