import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useSkills } from "@/hooks/use-skills";
import { skillDisplayCode, skillDisplayName, detachedCode } from "@/lib/training-utils";
import { SkillCode } from "@/components/skill-code";
import { useAuth } from "@/hooks/use-auth";
import { PageLayout } from "@/components/page-layout";
import { PointsToFix, parsePoints } from "@/components/points-to-fix";
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
    <div className="relative -mx-4 sm:-mx-6 px-4 sm:px-6 mb-6 overflow-hidden">
      {/* Blue glow backdrop */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64"
        style={{
          background:
            "radial-gradient(ellipse at 20% 0%, hsl(var(--primary)/0.16) 0%, hsl(var(--primary)/0.03) 55%, transparent 78%)",
        }}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 -ml-2 text-muted-foreground/70 hover:text-foreground text-[11px] font-mono uppercase tracking-[0.14em]"
            onClick={() => navigate("/skills")}
            data-testid="button-back-to-skills"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Skills
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" disabled={!hasPrev} onClick={goPrev} data-testid="button-prev-skill">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums min-w-[3.5ch] text-center">
              {currentIndex + 1}/{orderedIds.length}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" disabled={!hasNext} onClick={goNext} data-testid="button-next-skill">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-[9px] font-mono text-muted-foreground/60 tracking-[0.18em] uppercase" data-testid="badge-skill-type">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              {typeLabel}
            </span>
          </div>
          <h1
            className="font-black leading-[0.94] tracking-[-0.045em] mb-4"
            style={{ fontSize: "clamp(30px,8vw,44px)" }}
            data-testid="text-skill-name"
          >
            <span className="text-gradient-primary">{skillDisplayName(skill, allSkills)}</span>
          </h1>
          <div className="flex items-stretch divide-x divide-white/[0.06] rounded-2xl overflow-hidden border border-white/[0.07] bg-white/[0.025]">
            <div className="flex-1 flex flex-col items-center py-3 gap-1">
              <span className="text-[16px] font-bold font-mono tabular-nums leading-none text-foreground/90" data-testid="text-skill-code">
                {skillDisplayCode(skill, allSkills)}
              </span>
              <span className="text-[8px] font-mono uppercase tracking-[0.15em] text-muted-foreground/40">Code</span>
            </div>
            <div className="flex-1 flex flex-col items-center py-3 gap-1">
              <span
                className="text-[18px] font-bold tabular-nums leading-none"
                style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                data-testid="text-skill-difficulty"
              >
                {skill.difficulty.toFixed(1)}
              </span>
              <span className="text-[8px] font-mono uppercase tracking-[0.15em] text-muted-foreground/40">DD</span>
            </div>
          </div>
          {isShape && (
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              {parentSkill && (
                <span className="text-[11px] text-muted-foreground/70 font-mono" data-testid="text-parent-skill">
                  Variant of <span className="text-foreground/80">{skillDisplayName(parentSkill, allSkills)}</span>
                  {" "}
                  <span className="text-foreground/60">{skillDisplayCode(parentSkill, allSkills)}</span>
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-[11px] rounded-xl border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.06]"
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
    </div>
  );

  const bottomNav = (
    <div className="flex justify-between items-center gap-2 mt-8">
      <button
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/[0.07] bg-white/[0.025] text-[11px] font-medium text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-all disabled:opacity-25 disabled:pointer-events-none"
        disabled={!hasPrev}
        onClick={goPrev}
        data-testid="button-prev-skill-bottom"
      >
        <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate max-w-[120px]">{skillDisplayName(prevSkill, allSkills) || ""}</span>
      </button>
      <button
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/[0.07] bg-white/[0.025] text-[11px] font-medium text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-all disabled:opacity-25 disabled:pointer-events-none"
        disabled={!hasNext}
        onClick={goNext}
        data-testid="button-next-skill-bottom"
      >
        <span className="truncate max-w-[120px]">{skillDisplayName(nextSkill, allSkills) || ""}</span>
        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
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
            <div className="mb-6 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/40 mb-3">Sequence</div>
              <div className="flex flex-wrap gap-3">
                {skill.skillIds!.map((id, idx) => {
                  const sub = allSkills?.find(s => s.id === id);
                  return (
                    <div key={idx} className="flex flex-col items-center gap-1">
                      <Badge variant="outline" className="px-2 py-1 font-mono border-white/[0.1] bg-white/[0.03]" data-testid={`badge-conn-skill-${idx}`}>
                        <SkillCode skill={sub} allSkills={allSkills} fallback="???" />
                      </Badge>
                      <span className="text-[10px] text-muted-foreground/60 font-semibold font-mono tabular-nums">
                        {sub?.difficulty.toFixed(1) || "0.0"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
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
            <div className="mb-6 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/50 mb-3">
                <Wrench className="w-3.5 h-3.5 text-[hsl(var(--gold))]" />
                Points to Fix
              </div>
              <div className="flex flex-col gap-1.5" data-testid="list-skill-points">
                {skillPoints.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPointsOpen(true)}
                    data-testid={`button-skill-point-${p.id}`}
                    className={`text-left text-sm py-2 px-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors break-words ${p.resolved ? "line-through text-muted-foreground opacity-60" : ""}`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <CompletionChart title="Practice Frequency" data={chartData} />

          <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/40 mb-3">Session History</div>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center" data-testid="text-no-history">
                No training sessions found for this connection yet.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-white/[0.05] max-h-[50vh] overflow-y-auto" data-testid="list-session-history">
                {[...entries].reverse().map((entry) => {
                  const reps = repsOf(entry);
                  return (
                    <div
                      key={`${entry.noteId}-${entry.date}`}
                      className="flex items-center justify-between py-2.5 transition-colors"
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
                            className="font-mono text-xs border-white/[0.1]"
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
          </div>

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
          <div className="mb-6 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/50 mb-3">
              <Wrench className="w-3.5 h-3.5 text-[hsl(var(--gold))]" />
              Points to Fix
            </div>
            <div className="flex flex-col gap-1.5" data-testid="list-skill-points">
              {skillPoints.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPointsOpen(true)}
                  data-testid={`button-skill-point-${p.id}`}
                  className={`text-left text-sm py-2 px-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors break-words ${p.resolved ? "line-through text-muted-foreground opacity-60" : ""}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <RepsChart title="Reps per Day" data={chartData} />

        <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/40 mb-3">Session History</div>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center" data-testid="text-no-history">
              No training sessions found for this skill yet.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-white/[0.05] max-h-[50vh] overflow-y-auto" data-testid="list-session-history">
              {[...entries].reverse().map((entry) => (
                <div
                  key={`${entry.noteId}-${entry.date}`}
                  className="flex items-center justify-between py-2.5 transition-colors"
                  data-testid={`row-session-${entry.noteId}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium font-mono" data-testid={`text-date-${entry.noteId}`}>
                      {format(parseISO(entry.date), "MMM d, yyyy")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono text-xs border-white/[0.1] bg-white/[0.03]" data-testid={`badge-reps-${entry.noteId}`}>
                      {entry.reps} rep{entry.reps !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground/40 mb-1.5">
        <span className="[&_svg]:w-3.5 [&_svg]:h-3.5">{icon}</span>
        <span className="text-[8px] font-mono uppercase tracking-[0.15em]">{label}</span>
      </div>
      <p
        className="text-lg font-bold truncate tabular-nums leading-none"
        style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
        data-testid={testId}
      >
        {value}
      </p>
    </div>
  );
}
