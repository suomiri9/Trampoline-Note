import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useSkills } from "@/hooks/use-skills";
import { useRoutines } from "@/hooks/use-routines";
import { useAuth } from "@/hooks/use-auth";
import { calcDDFromSkillIds } from "@/lib/training-utils";
import { SkillCode } from "@/components/skill-code";
import { PageLayout } from "@/components/page-layout";
import { PointsToFix, parsePoints } from "@/components/points-to-fix";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Calendar, Star, TrendingUp, Loader2, Layers, ChevronLeft, ChevronRight, Wrench, History, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { DialogHero } from "@/components/dialog-hero";
import { pageAccentStyle } from "@/lib/page-accent";
import { BackLink } from "@/components/back-link";
import { format, parseISO } from "date-fns";
import { useRef, useCallback, useMemo, useState } from "react";
import { CompletionChart, buildDailyCompletion } from "@/lib/history-chart";
import { sortedVersions, versionBoundaries, currentLineupSince, normalizeVersions } from "@shared/routine-versions";

interface RoutineHistoryEntry {
  noteId: number;
  date: string;
  rating: number | null;
  attempt: number | null;
  skillCount: number;
  reps?: number;
  // Lineup version in effect on the entry's date (0..n-1 past, n current);
  // absent on responses cached before versioning existed.
  version?: number;
  // Length of that lineup — what full-vs-attempt was judged against.
  expected?: number;
}

export default function RoutineDetailPage() {
  const [, params] = useRoute("/routines/:id");
  const [, navigate] = useLocation();
  const routineId = Number(params?.id);

  const { data: allSkills, isLoading: skillsLoading } = useSkills();
  const skills = allSkills?.filter(s => s.isDrill === 0);
  const { data: routines, isLoading: routinesLoading, updateRoutine, isUpdating } = useRoutines();
  const { user } = useAuth();
  const routine = routines?.find(r => r.id === routineId);

  const [pointsOpen, setPointsOpen] = useState(false);
  // Past-version management: correct a change day, or delete a version (its
  // date range merges into the neighbor). Indexes refer to sortedVersions.
  const [editVersionIdx, setEditVersionIdx] = useState<number | null>(null);
  const [editVersionDay, setEditVersionDay] = useState("");
  const [deleteVersionIdx, setDeleteVersionIdx] = useState<number | null>(null);
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
      <PageLayout accent="routines">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--page-accent)/0.5)]" />
        </div>
      </PageLayout>
    );
  }

  if (!routine) {
    return (
      <PageLayout accent="routines">
        <div className="text-center py-16">
          <p className="text-muted-foreground">Routine not found.</p>
          <BackLink to="/routines" label="Routines" className="mt-4" />
        </div>
      </PageLayout>
    );
  }

  const entries = history || [];
  const repsOf = (e: RoutineHistoryEntry) => (e.reps && e.reps > 0 ? e.reps : 1);
  const totalSessions = entries.reduce((s, e) => s + repsOf(e), 0);
  const firstPracticed = entries.length > 0 ? entries[0].date : null;
  const lastPracticed = entries.length > 0 ? entries[entries.length - 1].date : null;
  const totalDD = calcDDFromSkillIds(routine.skillIds, allSkills || []);

  // Per-version stats: full-run percentages are split at each lineup-change
  // day, so an old lineup's runs never count against the current one.
  const pastVersions = sortedVersions(routine.versions);
  const hasVersions = pastVersions.length > 0;

  // Persist an edited past-version list through the same offline-queue-friendly
  // update path as lineup edits. The lineup itself is untouched, so the server
  // applies the explicit `versions` list (normalized to keep the invariant).
  const saveVersions = async (next: { skillIds: number[]; effectiveUntil: string }[]) => {
    await updateRoutine({ id: routineId, versions: normalizeVersions(next) });
  };

  const confirmEditVersionDay = async () => {
    if (editVersionIdx == null || !editVersionDay) return;
    const next = pastVersions.map((v, i) => ({
      skillIds: v.skillIds,
      effectiveUntil: i === editVersionIdx ? editVersionDay : v.effectiveUntil,
    }));
    setEditVersionIdx(null);
    await saveVersions(next);
  };

  const confirmDeleteVersion = async () => {
    if (deleteVersionIdx == null) return;
    const next = pastVersions
      .filter((_, i) => i !== deleteVersionIdx)
      .map((v) => ({ skillIds: v.skillIds, effectiveUntil: v.effectiveUntil }));
    setDeleteVersionIdx(null);
    await saveVersions(next);
  };
  const currentIdx = pastVersions.length;
  const currentSince = currentLineupSince(routine.versions);
  const perVersion = Array.from({ length: currentIdx + 1 }, () => ({ sessions: 0, full: 0, partial: 0 }));
  for (const e of entries) {
    const v = Math.min(e.version ?? currentIdx, currentIdx);
    const reps = repsOf(e);
    perVersion[v].sessions += reps;
    if (e.attempt == null) perVersion[v].full += reps;
    else perVersion[v].partial += reps;
  }
  // With no versions this equals the overall stats (all entries are "current").
  const cur = perVersion[currentIdx];
  const fullRunCount = cur.full;
  const partialCount = cur.partial;
  const currentSessions = cur.sessions;
  const sinceLabel = currentSince ? format(parseISO(currentSince), "MMM d") : null;

  const weeklyData = buildDailyCompletion(entries);
  // Mark each lineup-change day in the chart (snap to the first practiced day
  // on/after the boundary, since empty days aren't plotted).
  const changeMarkers = versionBoundaries(routine.versions)
    .map((b) => weeklyData.find((d) => d.date >= b)?.label)
    .filter((l): l is string => !!l)
    .filter((l, i, arr) => arr.indexOf(l) === i);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < orderedIds.length - 1;
  const prevRoutine = hasPrev ? routines?.find(r => r.id === orderedIds[currentIndex - 1]) : null;
  const nextRoutine = hasNext ? routines?.find(r => r.id === orderedIds[currentIndex + 1]) : null;

  return (
    <PageLayout accent="routines">
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="relative -mx-4 sm:-mx-6 -mt-6 md:-mt-8 px-4 sm:px-6 mb-6">
          {/* Purple identity glow backdrop */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-96"
            style={{
              background:
                "radial-gradient(ellipse at 20% 0%, hsl(var(--page-accent)/0.24) 0%, hsl(var(--page-accent)/0.05) 60%, transparent 82%)",
              WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
              maskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
            }}
          />
          <div className="relative pt-6 md:pt-8">
            <div className="flex items-center justify-between mb-4">
              <BackLink to="/routines" label="Routines" testId="button-back-to-routines" />
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  disabled={!hasPrev}
                  onClick={goPrev}
                  data-testid="button-prev-routine"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums min-w-[3.5ch] text-center">
                  {currentIndex + 1}/{orderedIds.length}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  disabled={!hasNext}
                  onClick={goNext}
                  data-testid="button-next-routine"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[hsl(var(--page-accent)/0.25)] bg-[hsl(var(--page-accent)/0.08)] text-[9px] font-mono text-[hsl(var(--page-accent)/0.9)] tracking-[0.18em] uppercase">
                  <Layers className="w-3 h-3" />
                  Routine
                </span>
              </div>
              <h1
                className="font-black leading-[0.94] tracking-[-0.045em] mb-4"
                style={{ fontSize: "clamp(30px,8vw,44px)" }}
                data-testid="text-routine-name"
              >
                <span className="text-gradient-page">{routine.name}</span>
              </h1>
              <div className="inline-flex items-baseline gap-2 px-4 py-2.5 rounded-2xl border border-[hsl(var(--page-accent)/0.15)] bg-[hsl(var(--page-accent)/0.05)]">
                <span
                  className="text-3xl font-bold tabular-nums leading-none text-gradient-page"
                  data-testid="text-routine-dd"
                >
                  {totalDD.toFixed(1)}
                </span>
                <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/60">Total DD</span>
              </div>
            </div>
          </div>
        </div>

        {/* The lineup — the signature moment: a numbered sequence with a purple
            spine threading skills 01→10 in strict order. */}
        <div className="mb-6 rounded-2xl border border-[hsl(var(--page-accent)/0.14)] bg-white/[0.02] p-4 sm:p-5 overflow-hidden relative">
          <div
            className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 opacity-60"
            style={{ background: "radial-gradient(circle, hsl(var(--page-accent)/0.12) 0%, transparent 70%)" }}
            aria-hidden="true"
          />
          <div className="relative flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.18em] text-[hsl(var(--page-accent)/0.85)]" data-testid={hasVersions && currentSince ? "text-current-lineup-since" : undefined}>
              <Layers className="w-3.5 h-3.5" />
              {hasVersions && currentSince
                ? `Current lineup · since ${format(parseISO(currentSince), "MMM d, yyyy")}`
                : "Current lineup"}
            </div>
            <span className="font-mono text-[9px] tabular-nums text-muted-foreground/50">
              {routine.skillIds.length.toString().padStart(2, "0")} skills
            </span>
          </div>
          <div className="relative">
            {/* Vertical spine connecting the sequence */}
            <span
              className="absolute left-[15px] top-1 bottom-1 w-px"
              style={{ background: "linear-gradient(180deg, hsl(var(--page-accent)/0.5), hsl(var(--page-accent-2)/0.15))" }}
              aria-hidden="true"
            />
            <div className="relative flex flex-col gap-1.5">
              {routine.skillIds.map((id, idx) => {
                const skill = skills?.find(s => s.id === id);
                return (
                  <div key={idx} className="flex items-center gap-3">
                    {/* Ordinal node on the spine */}
                    <span
                      className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--page-accent)/0.3)] bg-background font-mono text-[10px] font-bold tabular-nums text-[hsl(var(--page-accent))]"
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div className="flex flex-1 items-center justify-between gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-1.5 min-w-0">
                      <Badge variant="outline" className="px-2 py-0.5 font-mono border-white/[0.1] bg-white/[0.03] shrink-0" data-testid={`badge-routine-skill-${idx}`}>
                        <SkillCode skill={skill} allSkills={allSkills} fallback="???" />
                      </Badge>
                      <span className="text-[11px] text-muted-foreground/60 font-semibold font-mono tabular-nums shrink-0">
                        {skill?.difficulty.toFixed(1) || "0.0"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {hasVersions && (
          <div className="mb-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/50 mb-3">
              <History className="w-3.5 h-3.5 text-[hsl(var(--page-accent))]" />
              Previous Routines
            </div>
            <div className="space-y-3">
              {pastVersions.map((v, i) => {
                const stats = perVersion[i];
                const from = i === 0 ? null : pastVersions[i - 1].effectiveUntil;
                const rangeLabel = from
                  ? `${format(parseISO(from), "MMM d, yyyy")} – ${format(parseISO(v.effectiveUntil), "MMM d, yyyy")}`
                  : `until ${format(parseISO(v.effectiveUntil), "MMM d, yyyy")}`;
                const pct = stats.sessions > 0 ? Math.round((stats.full / stats.sessions) * 100) : 0;
                return (
                  <div key={`${v.effectiveUntil}-${i}`} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3" data-testid={`row-version-${i}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2 text-xs font-mono">
                      <span className="text-muted-foreground">{rangeLabel}</span>
                      <span className="flex items-center gap-1">
                        <span data-testid={`text-version-stats-${i}`}>
                          <span className="text-[hsl(var(--page-accent))] font-semibold">{stats.full}</span>
                          {stats.sessions > 0 ? ` full (${pct}%)` : " full"} · {stats.partial} attempts · {stats.sessions} sessions
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 -mr-1 text-muted-foreground/50 hover:text-foreground"
                              data-testid={`button-version-actions-${i}`}
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44 rounded-xl">
                            <DropdownMenuItem
                              className="cursor-pointer gap-2 text-xs"
                              onClick={() => { setEditVersionDay(v.effectiveUntil); setEditVersionIdx(i); }}
                              data-testid={`button-version-edit-day-${i}`}
                            >
                              <Pencil className="h-3.5 w-3.5" /> Change day
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
                              onClick={() => setDeleteVersionIdx(i)}
                              data-testid={`button-version-delete-${i}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete version
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {v.skillIds.map((sid, idx) => {
                        const skill = skills?.find(s => s.id === sid);
                        return (
                          <Badge key={idx} variant="outline" className="px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            <SkillCode skill={skill} allSkills={allSkills} fallback="???" />
                          </Badge>
                        );
                      })}
                      <span className="text-[10px] font-mono text-muted-foreground self-center ml-1">
                        DD {calcDDFromSkillIds(v.skillIds, allSkills || []).toFixed(1)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/55 shrink-0">Training Record</span>
          <span
            className="h-px flex-1"
            style={{ background: "linear-gradient(90deg, hsl(var(--page-accent)/0.3), transparent)" }}
            aria-hidden="true"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <StatCard
            icon={<Calendar className="w-4 h-4" />}
            label="Total Sessions"
            value={totalSessions.toString()}
            testId="stat-total-sessions"
          />
          <StatCard
            icon={<TrendingUp className="w-4 h-4" />}
            label={`Full Runs (${routine.skillIds.length}/${routine.skillIds.length})${sinceLabel ? ` · since ${sinceLabel}` : ""}`}
            value={currentSessions > 0 ? `${fullRunCount} (${Math.round((fullRunCount / currentSessions) * 100)}%)` : fullRunCount.toString()}
            testId="stat-full-runs"
          />
          <StatCard
            icon={<TrendingUp className="w-4 h-4" />}
            label={`Attempts${sinceLabel ? ` · since ${sinceLabel}` : ""}`}
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
          <div className="mb-6 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/50 mb-3">
              <Wrench className="w-3.5 h-3.5 text-[hsl(var(--gold))]" />
              Points to Fix
            </div>
            <div className="flex flex-col gap-1.5" data-testid="list-routine-points">
              {routinePoints.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPointsOpen(true)}
                  data-testid={`button-routine-point-${p.id}`}
                  className={`text-left text-sm py-2 px-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors break-words ${p.resolved ? "line-through text-muted-foreground opacity-60" : ""}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <CompletionChart title="Practice Frequency" data={weeklyData} markers={changeMarkers} />

        <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/60 mb-3">Session History</div>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center" data-testid="text-no-history">
                No training sessions found for this routine yet.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-white/[0.05] max-h-[50vh] overflow-y-auto" data-testid="list-session-history">
                {[...entries].reverse().map((entry) => {
                  const reps = entry.reps && entry.reps > 0 ? entry.reps : 1;
                  // Judge each entry against the lineup in effect on its date.
                  const expectedLen = entry.expected ?? routine.skillIds.length;
                  const isOldLineup = hasVersions && (entry.version ?? currentIdx) < currentIdx;
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
                      {isOldLineup && (
                        <span className="text-[9px] font-mono uppercase tracking-wider text-[hsl(var(--page-accent))]" data-testid={`tag-old-lineup-${entry.noteId}`}>
                          old lineup
                        </span>
                      )}
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
                          ? `attempt ${entry.skillCount}/${expectedLen}`
                          : entry.skillCount > expectedLen
                            ? `${entry.skillCount} skills`
                            : `${expectedLen}/${expectedLen} Full run`}
                      </Badge>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
        </div>

        <div className="flex justify-between items-center gap-2 mt-8">
          <button
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/[0.07] bg-white/[0.025] text-[11px] font-medium text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors disabled:opacity-25 disabled:pointer-events-none"
            disabled={!hasPrev}
            onClick={goPrev}
            data-testid="button-prev-routine-bottom"
          >
            <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate max-w-[120px]">{prevRoutine?.name || ""}</span>
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/[0.07] bg-white/[0.025] text-[11px] font-medium text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors disabled:opacity-25 disabled:pointer-events-none"
            disabled={!hasNext}
            onClick={goNext}
            data-testid="button-next-routine-bottom"
          >
            <span className="truncate max-w-[120px]">{nextRoutine?.name || ""}</span>
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>

        <Dialog open={editVersionIdx != null} onOpenChange={(o) => { if (!o) setEditVersionIdx(null); }}>
          <DialogContent className="sm:max-w-sm" style={pageAccentStyle("routines")}>
            <DialogHero
              icon={History}
              eyebrow="Lineup history"
              title="Move the change day"
              description={<>This lineup applied to sessions <span className="font-medium text-foreground">before</span> the chosen day. Moving the day re-classifies history and stats around the new boundary.</>}
            />
            <Input
              type="date"
              value={editVersionDay}
              onChange={(e) => setEditVersionDay(e.target.value)}
              className="h-10"
              data-testid="input-version-day"
            />
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1 h-11"
                onClick={confirmEditVersionDay}
                disabled={isUpdating || !editVersionDay}
                data-testid="button-confirm-version-day"
              >
                {isUpdating ? "Saving..." : "Save Day"}
              </Button>
              <Button variant="outline" className="h-11" onClick={() => setEditVersionIdx(null)}>
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={deleteVersionIdx != null}
          onOpenChange={(o) => { if (!o) setDeleteVersionIdx(null); }}
          title="Delete this past lineup?"
          description="Its date range merges into the neighboring lineup (or the current one), and history and stats re-classify against that lineup. This cannot be undone."
          confirmLabel="Delete version"
          onConfirm={confirmDeleteVersion}
        />

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
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground/60 mb-1.5">
        <span className="[&_svg]:w-3.5 [&_svg]:h-3.5 text-[hsl(var(--page-accent)/0.7)]">{icon}</span>
        <span className="text-[8px] font-mono uppercase tracking-[0.15em]">{label}</span>
      </div>
      <p
        className="text-lg font-bold truncate tabular-nums leading-none text-gradient-page"
        data-testid={testId}
      >
        {value}
      </p>
    </div>
  );
}
