import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useSkills } from "@/hooks/use-skills";
import { skillDisplayCode, skillDisplayName, detachedCode } from "@/lib/training-utils";
import { SkillCode } from "@/components/skill-code";
import { useAuth } from "@/hooks/use-auth";
import { PageLayout } from "@/components/page-layout";
import { PointsToFix, parsePoints } from "@/components/points-to-fix";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Hash, Star, TrendingUp, Loader2, ChevronLeft, ChevronRight, Wrench, Unlink } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import {
  CompletionChart,
  RepsChart,
  buildDailyCompletion,
  buildDailyReps,
  type CompletionEntry,
  type RepsEntry,
} from "@/lib/history-chart";

export default function SkillDetailPage() {
  const [, params] = useRoute("/skills/:id");
  const [, navigate] = useLocation();
  const skillId = Number(params?.id);

  const { data: allSkills, isLoading: skillsLoading, updateSkill, isUpdating } = useSkills();
  const { user } = useAuth();
  const skill = allSkills?.find(s => s.id === skillId);

  const isConnection = skill?.isDrill === 2 || skill?.isDrill === 3;
  const hasShapes = !!allSkills && skill?.parentSkillId == null && allSkills.some(s => s.parentSkillId === skillId && s.archived !== 1);

  const [pointsOpen, setPointsOpen] = useState(false);
  const skillPoints = useMemo(
    () => parsePoints(user?.focusMemo).filter(p => p.skillIds.includes(skillId)),
    [user?.focusMemo, skillId],
  );

  const currentType = skill?.isDrill ?? 0;
  const parentIds = useMemo(() => {
    const set = new Set<number>();
    (allSkills || []).forEach(s => { if (s.parentSkillId != null && s.archived !== 1) set.add(s.parentSkillId); });
    return set;
  }, [allSkills]);
  const orderedIds = allSkills
    ? allSkills.filter(s => s.isDrill === currentType && !parentIds.has(s.id) && (s.archived !== 1 || s.id === skillId)).map(s => s.id)
    : [];
  const currentIndex = orderedIds.indexOf(skillId);

  const goTo = useCallback((id: number) => navigate(`/skills/${id}`, { replace: true }), [navigate]);
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

  const { data: repsHistory, isLoading: repsLoading } = useQuery<RepsEntry[]>({
    queryKey: [`/api/skills/${skillId}/history`],
    enabled: !!skillId && skillId > 0 && !isConnection && !hasShapes,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const { data: connHistory, isLoading: connLoading } = useQuery<CompletionEntry[]>({
    queryKey: [`/api/connections/${skillId}/history`],
    enabled: !!skillId && skillId > 0 && isConnection,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const historyLoading = isConnection ? connLoading : repsLoading;

  useEffect(() => {
    if (hasShapes) navigate("/skills", { replace: true });
  }, [hasShapes, navigate]);

  if (skillsLoading || historyLoading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
        </div>
      </PageLayout>
    );
  }

  if (hasShapes) {
    return null;
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

  const typeLabel = skill.isDrill === 0 ? "Skill" : skill.isDrill === 1 ? "Drill" : skill.isDrill === 3 ? "Part" : "Connection";

  const isShape = skill.parentSkillId != null;
  const parentSkill = isShape ? allSkills?.find(s => s.id === skill.parentSkillId) : null;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < orderedIds.length - 1;
  const prevSkill = hasPrev ? allSkills?.find(s => s.id === orderedIds[currentIndex - 1]) : null;
  const nextSkill = hasNext ? allSkills?.find(s => s.id === orderedIds[currentIndex + 1]) : null;

  const header = (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 -ml-2 text-muted-foreground"
          onClick={() => navigate("/skills")}
          data-testid="button-back-to-skills"
        >
          <ArrowLeft className="w-4 h-4" /> Skills
        </Button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!hasPrev} onClick={goPrev} data-testid="button-prev-skill">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums min-w-[3ch] text-center">
            {currentIndex + 1}/{orderedIds.length}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!hasNext} onClick={goNext} data-testid="button-next-skill">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div>
        <div className="eyebrow mb-2">// {typeLabel}</div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-3xl sm:text-4xl font-display font-normal tracking-tight" data-testid="text-skill-name">{skillDisplayName(skill, allSkills)}</h1>
          <Badge variant="secondary" data-testid="badge-skill-type">{typeLabel}</Badge>
        </div>
        <p className="text-muted-foreground text-sm mt-2 font-mono">
          Code <span className="text-foreground/80" data-testid="text-skill-code">{skillDisplayCode(skill, allSkills)}</span>
          {"  ·  "}
          DD <span className="text-primary font-semibold" data-testid="text-skill-difficulty">{skill.difficulty.toFixed(1)}</span>
        </p>
        {isShape && (
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            {parentSkill && (
              <span className="text-xs text-muted-foreground font-mono" data-testid="text-parent-skill">
                Variant of <span className="text-foreground/80">{skillDisplayName(parentSkill, allSkills)}</span>
                {" "}
                <span className="text-foreground/60">{skillDisplayCode(parentSkill, allSkills)}</span>
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={isUpdating}
              onClick={() => updateSkill({ id: skillId, parentSkillId: null, shape: null, code: detachedCode(skill, allSkills) })}
              data-testid="button-detach-from-parent"
            >
              <Unlink className="w-3.5 h-3.5" /> Detach from parent
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  const bottomNav = (
    <div className="flex justify-between items-center mt-6 text-sm text-muted-foreground">
      <button
        className="flex items-center gap-1 hover:text-foreground transition-colors disabled:opacity-30"
        disabled={!hasPrev}
        onClick={goPrev}
        data-testid="button-prev-skill-bottom"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="truncate max-w-[120px]">{skillDisplayName(prevSkill, allSkills) || ""}</span>
      </button>
      <button
        className="flex items-center gap-1 hover:text-foreground transition-colors disabled:opacity-30"
        disabled={!hasNext}
        onClick={goNext}
        data-testid="button-next-skill-bottom"
      >
        <span className="truncate max-w-[120px]">{skillDisplayName(nextSkill, allSkills) || ""}</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );

  if (isConnection) {
    const entries = connHistory || [];
    const expected = skill.skillIds?.length ?? 0;
    const repsOf = (e: CompletionEntry) => (e.reps && e.reps > 0 ? e.reps : 1);
    const totalSessions = entries.reduce((s, e) => s + repsOf(e), 0);
    const fullRunCount = entries.filter(e => e.attempt == null).reduce((s, e) => s + repsOf(e), 0);
    const partialCount = entries.filter(e => e.attempt != null).reduce((s, e) => s + repsOf(e), 0);
    const firstPracticed = entries.length > 0 ? entries[0].date : null;
    const lastPracticed = entries.length > 0 ? entries[entries.length - 1].date : null;
    const chartData = buildDailyCompletion(entries);

    return (
      <PageLayout>
        <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {header}

          {expected > 0 && (
            <Card className="mb-6">
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-3">
                  {skill.skillIds!.map((id, idx) => {
                    const sub = allSkills?.find(s => s.id === id);
                    return (
                      <div key={idx} className="flex flex-col items-center gap-1">
                        <Badge variant="outline" className="px-2 py-1 font-mono" data-testid={`badge-conn-skill-${idx}`}>
                          <SkillCode skill={sub} allSkills={allSkills} fallback="???" />
                        </Badge>
                        <span className="text-[10px] text-muted-foreground font-semibold font-mono">
                          {sub?.difficulty.toFixed(1) || "0.0"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <StatCard icon={<Calendar className="w-4 h-4" />} label="Total Sessions" value={totalSessions.toString()} testId="stat-total-sessions" />
            <StatCard
              icon={<TrendingUp className="w-4 h-4" />}
              label={expected > 0 ? `Full Runs (${expected}/${expected})` : "Full Runs"}
              value={totalSessions > 0 ? `${fullRunCount} (${Math.round((fullRunCount / totalSessions) * 100)}%)` : fullRunCount.toString()}
              testId="stat-full-runs"
            />
            <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Attempts" value={partialCount.toString()} testId="stat-partial-attempts" />
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

          {skillPoints.length > 0 && (
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  Points to Fix
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1.5" data-testid="list-skill-points">
                  {skillPoints.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPointsOpen(true)}
                      data-testid={`button-skill-point-${p.id}`}
                      className={`text-left text-sm py-2 px-3 rounded-xl bg-white/[0.025] hover:bg-white/[0.04] transition-colors break-words ${p.resolved ? "line-through text-muted-foreground opacity-60" : ""}`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <CompletionChart title="Practice Frequency" data={chartData} />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Session History</CardTitle>
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center" data-testid="text-no-history">
                  No training sessions found for this connection yet.
                </p>
              ) : (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto" data-testid="list-session-history">
                  {[...entries].reverse().map((entry) => {
                    const reps = repsOf(entry);
                    return (
                      <div
                        key={`${entry.noteId}-${entry.date}`}
                        className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                        data-testid={`row-session-${entry.noteId}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium font-mono" data-testid={`text-date-${entry.noteId}`}>
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
                              ? `attempt ${entry.skillCount}/${expected}`
                              : expected > 0
                                ? `${expected}/${expected} Full run`
                                : `${entry.skillCount} skills`}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {bottomNav}

          <PointsToFix
            hideTrigger
            open={pointsOpen}
            onOpenChange={setPointsOpen}
            initialFilter={{ kind: "skill", id: skillId }}
          />
        </div>
      </PageLayout>
    );
  }

  const entries = repsHistory || [];
  const totalReps = entries.reduce((sum, e) => sum + (e.reps && e.reps > 0 ? e.reps : 1), 0);
  const totalSessions = entries.length;
  const firstPracticed = entries.length > 0 ? entries[0].date : null;
  const lastPracticed = entries.length > 0 ? entries[entries.length - 1].date : null;
  const chartData = buildDailyReps(entries);

  return (
    <PageLayout>
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {header}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard icon={<Hash className="w-4 h-4" />} label="Total Reps" value={totalReps.toString()} testId="stat-total-reps" />
          <StatCard icon={<Calendar className="w-4 h-4" />} label="Sessions" value={totalSessions.toString()} testId="stat-total-sessions" />
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

        {skillPoints.length > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                Points to Fix
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1.5" data-testid="list-skill-points">
                {skillPoints.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPointsOpen(true)}
                    data-testid={`button-skill-point-${p.id}`}
                    className={`text-left text-sm py-2 px-3 rounded-xl bg-white/[0.025] hover:bg-white/[0.04] transition-colors break-words ${p.resolved ? "line-through text-muted-foreground opacity-60" : ""}`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <RepsChart title="Reps per Day" data={chartData} />

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
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                    data-testid={`row-session-${entry.noteId}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium font-mono" data-testid={`text-date-${entry.noteId}`}>
                        {format(parseISO(entry.date), "MMM d, yyyy")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono text-xs" data-testid={`badge-reps-${entry.noteId}`}>
                        {entry.reps} rep{entry.reps !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {bottomNav}

        <PointsToFix
          hideTrigger
          open={pointsOpen}
          onOpenChange={setPointsOpen}
          initialFilter={{ kind: "skill", id: skillId }}
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
        <p className="text-lg font-bold truncate font-mono" data-testid={testId}>{value}</p>
      </CardContent>
    </Card>
  );
}
