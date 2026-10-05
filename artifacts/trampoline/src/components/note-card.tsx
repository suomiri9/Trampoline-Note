import { format } from "date-fns";
import { MoreVertical, Pencil, Trash2, HeartPulse, ChevronDown, Share as ShareIcon } from "lucide-react";
import { PendingSyncBadge } from "@/components/pending-sync-badge";
import { type Note } from "@shared/schema";
import { parseNoteSkills, calculateTotalDD, computeTurns } from "@/lib/training-utils";
import { lineupOnDate } from "@shared/routine-versions";
import { useTrackTurns } from "@/hooks/use-track-turns";
import { SkillCode } from "@/components/skill-code";
import { StarRating } from "./star-rating";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useDeleteNote } from "@/hooks/use-notes";
import { deleteQueuedByTempId } from "@/lib/offline-queue";
import { useSkills } from "@/hooks/use-skills";
import { useRoutines } from "@/hooks/use-routines";
import { useTimeFormat, formatTime } from "@/hooks/use-time-format";
import { useWhoopDaily, recoveryColorClass } from "@/hooks/use-whoop-daily";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useState } from "react";
import { isNativeApp, shareText } from "@/lib/native-app";

interface NoteCardProps {
  note: Note;
  onEdit: (note: Note) => void;
  index: number;
  isPending?: boolean;
  /** Start expanded (home decides which single card across all lists opens). */
  defaultOpen?: boolean;
}

export function NoteCard({ note, onEdit, index, isPending = false, defaultOpen = false }: NoteCardProps) {
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const deleteNote = useDeleteNote();
  const { data: allItems } = useSkills();
  const { data: routines } = useRoutines();
  const [timeFormat] = useTimeFormat();
  const { toast } = useToast();
  const { data: whoopDaily } = useWhoopDaily();
  const whoopDay = whoopDaily?.connected
    ? whoopDaily.days[String(note.date).slice(0, 10)]
    : undefined;

  const handleDelete = async () => {
    if (isPending) {
      const removed = await deleteQueuedByTempId(note.id);
      if (removed) {
        toast({ title: "Pending session discarded." });
      } else {
        toast({ title: "Couldn't find that pending session.", variant: "destructive" });
      }
      return;
    }
    deleteNote.mutate(note.id, {
      onSuccess: (result) => {
        const queued = !!(result && typeof result === "object" && "_queuedOffline" in result);
        toast(queued
          ? { title: "Deleted offline. Will sync when reconnected." }
          : { title: "Session deleted", description: "Your training note has been removed." });
      },
    });
  };

  const skillsData = parseNoteSkills(note.skills);
  const noteDay = String(note.date).slice(0, 10);
  const totalDifficulty = calculateTotalDD(skillsData, allItems, routines, noteDay);
  const [trackTurns] = useTrackTurns();
  const handleShare = () => {
    const lines = [
      `Trampoline session · ${format(new Date(note.date), "EEE, d MMM yyyy")}`,
      totalDifficulty > 0 ? `Total DD ${totalDifficulty.toFixed(1)}` : null,
      note.rating ? `Rating ${"★".repeat(note.rating)}` : null,
      note.content || null,
    ].filter(Boolean);
    void shareText("Training session", lines.join("\n"));
  };
  const turnInfo = computeTurns(skillsData);
  const [expandedMath, setExpandedMath] = useState<Set<number>>(new Set());
  const toggleMath = (idx: number) => {
    setExpandedMath(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const staggerClass = `stagger-${Math.min(index + 1, 5)}`;

  return (
    <>
      <article
        className={`border-b border-border/[0.05] animate-fade-in-up opacity-0 ${staggerClass} select-none`}
        data-testid={`card-note-${note.id}`}
      >
        {/* Main row */}
        <div
          className={cn(
            "flex items-center gap-3 py-3 px-2 -mx-2 rounded-xl cursor-pointer transition-colors",
            open ? "bg-foreground/[0.035]" : "hover:bg-foreground/[0.02]"
          )}
          onClick={() => setOpen(v => !v)}
          role="button"
          aria-expanded={open}
        >
          {/* Accent bar */}
          <div
            className={cn(
              "w-[3px] h-10 rounded-full shrink-0 transition-colors",
              open ? "bg-primary" : "bg-foreground/10"
            )}
          />

          {/* Meta + label */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="font-mono text-[10px] text-muted-foreground/60 tracking-wide whitespace-nowrap">
                {format(new Date(note.date), "EEE, d MMM")}
              </span>
              <span className="text-muted-foreground/60 text-[9px]">·</span>
              <span className="font-mono text-[10px] text-muted-foreground/50 whitespace-nowrap">
                {formatTime(note.startTime, timeFormat)} – {formatTime(note.endTime, timeFormat)}
              </span>
              {note.rating ? <StarRating value={note.rating} onChange={() => {}} readonly size="sm" /> : null}
              {whoopDay && (whoopDay.recovery != null || whoopDay.strain != null) && (
                <span
                  className="flex items-center gap-1 whitespace-nowrap"
                  title="WHOOP recovery / day strain"
                  data-testid={`whoop-day-${note.id}`}
                >
                  <HeartPulse className="w-3 h-3 shrink-0" />
                  {whoopDay.recovery != null && (
                    <span className={cn("font-mono text-[10px] font-bold", recoveryColorClass(whoopDay.recovery))}>
                      {Math.round(whoopDay.recovery)}%
                    </span>
                  )}
                  {whoopDay.strain != null && (
                    <span className="font-mono text-[10px] text-muted-foreground/55">{whoopDay.strain.toFixed(1)} str</span>
                  )}
                </span>
              )}
              {isPending && <PendingSyncBadge testId={`badge-pending-sync-${note.id}`} />}
            </div>
            <h3 className="text-[13px] font-semibold text-foreground/85 leading-snug truncate pr-2">
              {note.content || "Training session"}
            </h3>
          </div>

          {/* Stats right + chevron + menu */}
          <div className="flex items-center gap-3 shrink-0">
            {trackTurns && turnInfo.totalTurns > 0 && (
              <div className="text-right" data-testid={`text-turns-${note.id}`}>
                <div className="text-[15px] font-semibold tabular-nums leading-none text-foreground/55">
                  {turnInfo.totalTurns}
                </div>
                <div className="text-[7px] font-mono uppercase tracking-[0.15em] text-muted-foreground/50 mt-0.5">
                  turns
                </div>
              </div>
            )}
            {skillsData.length > 0 && (
              <div className="text-right min-w-[42px]">
                <div className="text-[19px] font-bold tabular-nums leading-none text-primary">
                  {totalDifficulty.toFixed(1)}
                </div>
                <div className="text-[7px] font-mono uppercase tracking-[0.15em] text-primary/40 mt-0.5">
                  dd
                </div>
              </div>
            )}
              {/* chevron + ⋮ menu — inside the stats-right flex */}
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200",
                  open && "rotate-180 text-muted-foreground/60"
                )}
              />
              <div onClick={e => e.stopPropagation()}>
                {isPending ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground/60 hover:text-muted-foreground/50"
                        data-testid={`btn-pending-actions-${note.id}`}
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40 rounded-xl">
                      <DropdownMenuItem
                        onClick={() => onEdit(note)}
                        className="cursor-pointer gap-2"
                        data-testid={`btn-pending-edit-${note.id}`}
                      >
                        <Pencil className="h-4 w-4" /> Edit Session
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setShowDeleteAlert(true)}
                        className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                        data-testid={`btn-pending-delete-${note.id}`}
                      >
                        <Trash2 className="h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground/60 hover:text-muted-foreground/50"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40 rounded-xl">
                      <DropdownMenuItem onClick={() => onEdit(note)} className="cursor-pointer gap-2">
                        <Pencil className="h-4 w-4" /> Edit Session
                      </DropdownMenuItem>
                      {isNativeApp && (
                        <DropdownMenuItem onClick={handleShare} className="cursor-pointer gap-2" data-testid={`btn-share-${note.id}`}>
                          <ShareIcon className="h-4 w-4" /> Share
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setShowDeleteAlert(true)}
                        className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>{/* end stats-right */}
          </div>{/* end main row */}

        {/* Expanded skills section */}
        {open && skillsData.length > 0 && (
          <div className="ml-10 mt-3 border-l border-border/10 pl-3">
            <div className="flex flex-col divide-y divide-white/[0.05]">
              {(() => {
                const groups: ({ id: number; reps?: number } | { id: number; reps?: number }[])[] = [];
                let currentGroup: { id: number; reps?: number }[] = [];

                skillsData.forEach(item => {
                  if (item.id === -1) {
                    if (currentGroup.length > 0) { groups.push(currentGroup); currentGroup = []; }
                    groups.push({ id: -1 });
                  } else {
                    currentGroup.push(item);
                  }
                });
                if (currentGroup.length > 0) groups.push(currentGroup);

                let rowCounter = -1;
                return groups.map((group, groupIdx) => {
                  if (!Array.isArray(group)) return null;
                  rowCounter++;
                  const rowIdx = rowCounter;
                  const rowTurn = turnInfo.rowTurns[rowIdx];
                  const isFirstOfTurn = rowIdx === 0 || turnInfo.rowTurns[rowIdx - 1] !== rowTurn;

                  const wrapRow = (el: React.ReactNode) => trackTurns ? (
                    <div key={`turnrow-${groupIdx}`} className="flex items-stretch gap-1.5">
                      <div className="w-5 shrink-0 flex items-center justify-center">
                        {isFirstOfTurn ? (
                          <span className="text-[11px] font-mono font-bold text-muted-foreground/70" data-testid={`text-note-turn-${note.id}-${rowIdx}`}>{rowTurn}</span>
                        ) : (
                          <span className="w-px self-stretch bg-border/50 mx-auto" aria-hidden="true" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">{el}</div>
                    </div>
                  ) : el;

                  // ── Routine row ──────────────────────────────────────────
                  if (group.length === 1 && (group[0] as any).id === -2) {
                    const item = group[0] as any;
                    const routine = routines?.find(r => r.id === item.routineId);
                    const baseSkillIds: number[] = routine
                      ? lineupOnDate(routine.skillIds, routine.versions, noteDay)
                      : [];
                    const displaySkillIds: number[] = item.customSkillIds ?? (item.attempt != null ? baseSkillIds.slice(0, item.attempt) : baseSkillIds);
                    const routineDD = displaySkillIds.reduce((acc: number, sId: number) => {
                      const skill = allItems?.find(s => s.id === sId);
                      return acc + (skill?.difficulty || 0);
                    }, 0);
                    const reps = item.reps || 1;

                    return wrapRow(
                      <div key={`routine-${groupIdx}`} className="flex flex-col py-1.5 gap-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="shrink-0 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 font-mono text-[9px] tracking-tight text-primary">
                              ROUTINE
                            </span>
                            <span className="truncate text-[12px] font-medium text-primary/80">
                              {routine?.name || item.routineName || "Routine"}
                            </span>
                            {displaySkillIds.length > baseSkillIds.length && (
                              <span className="font-mono text-[10px] text-muted-foreground/50">{displaySkillIds.length} skills</span>
                            )}
                            {displaySkillIds.length < baseSkillIds.length && (
                              <span className="font-mono text-[10px] text-muted-foreground/50">attempt {displaySkillIds.length}/{baseSkillIds.length}</span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="shrink-0 flex items-center gap-1 font-mono text-[10px] font-bold"
                            onClick={(e) => { e.stopPropagation(); if (reps > 1) toggleMath(groupIdx); }}
                            data-testid={`math-toggle-${note.id}-${groupIdx}`}
                          >
                            {reps > 1 && expandedMath.has(groupIdx) ? (
                              <><span className="text-muted-foreground/50">{routineDD.toFixed(1)}</span><span className="text-primary/40">×</span><span className="text-primary">{reps}</span><span className="text-primary/40">=</span><span className="text-primary">{(routineDD * reps).toFixed(1)}</span></>
                            ) : reps > 1 ? (
                              <><span className="text-muted-foreground/60">{(routineDD * reps).toFixed(1)}</span><span className="text-muted-foreground/55">×{reps}</span></>
                            ) : (
                              <span className="text-muted-foreground/50">{routineDD.toFixed(1)}</span>
                            )}
                          </button>
                        </div>
                        {item.note && (
                          <span className="text-[11px] text-muted-foreground/50 italic pl-1">{item.note}</span>
                        )}
                      </div>
                    );
                  }

                  // ── FC / CONN / PART row ─────────────────────────────────
                  if (group.length === 1 && (group[0] as any).id === -3) {
                    const item = group[0] as any;
                    const fc = allItems?.find(s => s.id === item.fcId);
                    const isPart = fc?.isDrill === 3;
                    const baseSkillIds: number[] = fc?.skillIds ?? [];
                    const displaySkillIds: number[] = item.customSkillIds ?? baseSkillIds;
                    const fcDD = displaySkillIds.reduce((acc: number, sId: number) => {
                      const skill = allItems?.find(s => s.id === sId);
                      return acc + (skill?.difficulty || 0);
                    }, 0);
                    const reps = item.reps || 1;

                    return wrapRow(
                      <div key={`fc-${groupIdx}`} className="flex flex-col py-1.5 gap-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {isPart ? (
                              <span className="shrink-0 rounded-full border border-border/30 bg-foreground/[0.05] px-2 py-0.5 font-mono text-[9px] tracking-tight text-muted-foreground">
                                PART
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-full border border-rose-400/25 bg-rose-400/10 px-2 py-0.5 font-mono text-[9px] tracking-tight text-rose-400 dark:text-rose-300">
                                CONN
                              </span>
                            )}
                            <span className={cn("truncate text-[12px] font-medium", isPart ? "text-muted-foreground/70" : "text-rose-500 dark:text-rose-400")}>
                              {fc?.name || item.fcName || "Connection"}
                            </span>
                            {displaySkillIds.length < baseSkillIds.length && (
                              <span className="font-mono text-[10px] text-muted-foreground/50">attempt {displaySkillIds.length}/{baseSkillIds.length}</span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="shrink-0 flex items-center gap-1 font-mono text-[10px] font-bold"
                            onClick={(e) => { e.stopPropagation(); if (reps > 1) toggleMath(groupIdx); }}
                            data-testid={`math-toggle-${note.id}-${groupIdx}`}
                          >
                            {reps > 1 && expandedMath.has(groupIdx) ? (
                              <><span className="text-muted-foreground/50">{fcDD.toFixed(1)}</span><span className="text-rose-400/70">×</span><span className={isPart ? "text-muted-foreground" : "text-rose-400"}>{reps}</span><span className="text-rose-400/70">=</span><span className={isPart ? "text-muted-foreground" : "text-rose-400"}>{(fcDD * reps).toFixed(1)}</span></>
                            ) : reps > 1 ? (
                              <><span className={isPart ? "text-muted-foreground/60" : "text-rose-400/80"}>{(fcDD * reps).toFixed(1)}</span><span className="text-muted-foreground/55">×{reps}</span></>
                            ) : (
                              <span className="text-muted-foreground/50">{fcDD.toFixed(1)}</span>
                            )}
                          </button>
                        </div>
                        {item.note && (
                          <span className="text-[11px] text-muted-foreground/50 italic pl-1">{item.note}</span>
                        )}
                      </div>
                    );
                  }

                  // ── Skill group row ──────────────────────────────────────
                  const isSingle = group.length === 1;
                  const reps = group[0]?.reps || 1;

                  const lineDD = group.reduce((acc, gItem: any) => {
                    if (gItem.id === -2) {
                      const r = routines?.find(rt => rt.id === gItem.routineId);
                      const sIds = gItem.customSkillIds ?? (r ? lineupOnDate(r.skillIds, r.versions, noteDay) : []);
                      const count = gItem.attempt ?? sIds.length;
                      return acc + sIds.slice(0, count).reduce((a: number, sId: number) => {
                        const sk = allItems?.find(s => s.id === sId);
                        return a + (sk?.difficulty || 0);
                      }, 0);
                    }
                    if (gItem.id === -3) {
                      const fc = allItems?.find(s => s.id === gItem.fcId);
                      const sIds = gItem.customSkillIds ?? fc?.skillIds ?? [];
                      return acc + sIds.reduce((a: number, sId: number) => {
                        const sk = allItems?.find(s => s.id === sId);
                        return a + (sk?.difficulty || 0);
                      }, 0);
                    }
                    const skill = allItems?.find(s => s.id === gItem.id);
                    return acc + (skill?.difficulty || 0);
                  }, 0);

                  return wrapRow(
                    <div key={`group-${groupIdx}`} className="flex flex-col py-1.5 gap-1">
                      <div className={cn("flex flex-wrap items-center gap-2", !isSingle && "pl-0")}>
                        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                        {group.map((gItem: any, skillIdx) => {
                          const sep = skillIdx < group.length - 1
                            ? <span key={`sep-${skillIdx}`} className="text-muted-foreground/60 text-xs font-bold">+</span>
                            : null;

                          if (gItem.id === -2) {
                            const r = routines?.find(rt => rt.id === gItem.routineId);
                            return (
                              <div key={skillIdx} className="flex items-center gap-1.5">
                                <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 font-mono text-[9px] tracking-tight text-primary shrink-0">ROUTINE</span>
                                <span className="text-[11px] font-medium text-primary/80 truncate max-w-[120px]">{r?.name || gItem.routineName}</span>
                                {sep}
                              </div>
                            );
                          }
                          if (gItem.id === -3) {
                            const fc = allItems?.find(s => s.id === gItem.fcId);
                            const isPart = fc?.isDrill === 3;
                            return (
                              <div key={skillIdx} className="flex items-center gap-1.5">
                                {isPart ? (
                                  <span className="rounded-full border border-border/30 bg-foreground/[0.05] px-2 py-0.5 font-mono text-[9px] tracking-tight text-muted-foreground shrink-0">PART</span>
                                ) : (
                                  <span className="rounded-full border border-rose-400/25 bg-rose-400/10 px-2 py-0.5 font-mono text-[9px] tracking-tight text-rose-400 dark:text-rose-300 shrink-0">CONN</span>
                                )}
                                <span className={cn("text-[11px] font-medium truncate max-w-[120px]", isPart ? "text-muted-foreground/70" : "text-rose-500 dark:text-rose-400")}>{fc?.name || gItem.fcName}</span>
                                {sep}
                              </div>
                            );
                          }

                          const skill = allItems?.find(s => s.id === gItem.id);
                          if (!skill) return null;

                          if (skill.isDrill === 3) {
                            return (
                              <div key={skillIdx} className="flex items-center gap-1.5">
                                <span className="rounded-full border border-border/30 bg-foreground/[0.05] px-2 py-0.5 font-mono text-[9px] tracking-tight text-muted-foreground shrink-0">PART</span>
                                <span className="text-[11px] font-medium text-muted-foreground/70 truncate max-w-[140px]">{skill.name}</span>
                                {sep}
                              </div>
                            );
                          }

                          const chipTone = skill.isDrill === 1
                            ? "border-amber-400/40 bg-amber-400/10 text-amber-600 dark:text-amber-400"
                            : !isSingle
                              ? "border-rose-400/25 bg-rose-400/10 text-rose-500 dark:text-rose-400"
                              : skill.isDrill === 2
                                ? "border-red-300/40 bg-red-400/10 text-red-500 dark:text-red-400"
                                : "border-border/20 bg-foreground/[0.04] text-muted-foreground/70";

                          return (
                            <div key={skillIdx} className="flex items-center gap-1.5">
                              <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-tight", chipTone)}>
                                <SkillCode skill={skill} allSkills={allItems} />
                              </span>
                              {sep}
                            </div>
                          );
                        })}
                      </div>

                      {/* DD / math toggle */}
                      <button
                        type="button"
                        className="shrink-0 flex items-center gap-1 font-mono text-[10px] font-bold"
                        onClick={(e) => { e.stopPropagation(); toggleMath(groupIdx); }}
                        data-testid={`math-toggle-${note.id}-${groupIdx}`}
                      >
                        {expandedMath.has(groupIdx) ? (
                          <>
                            <span className="text-muted-foreground/50">{lineDD.toFixed(1)}</span>
                            <span className={isSingle ? "text-muted-foreground/55" : "text-rose-400/70"}>×</span>
                            <span className="text-foreground/70">{reps}</span>
                            <span className={isSingle ? "text-muted-foreground/55" : "text-rose-400/70"}>=</span>
                            <span className={isSingle ? "text-foreground/70" : "text-rose-500 dark:text-rose-400"}>{(lineDD * reps).toFixed(1)}</span>
                          </>
                        ) : (
                          <>
                            <span className={isSingle ? "text-muted-foreground/60" : "text-rose-500 dark:text-rose-400"}>{(lineDD * reps).toFixed(1)}</span>
                            {reps > 1 && <span className={isSingle ? "text-muted-foreground/55" : "text-rose-400/60"}>×{reps}</span>}
                          </>
                        )}
                      </button>

                      </div>{/* end inner flex row */}
                      {(group[0] as any)?.note && (
                        <span className="text-[11px] text-muted-foreground/50 italic pl-1">{(group[0] as any).note}</span>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}
      </article>

      <ConfirmDialog
        open={showDeleteAlert}
        onOpenChange={setShowDeleteAlert}
        title={isPending ? "Discard pending session?" : "Delete Training Session?"}
        description={
          isPending
            ? "It hasn't been uploaded yet, so it will be removed and won't sync."
            : "This action cannot be undone."
        }
        onConfirm={handleDelete}
        confirmLabel={isPending ? "Discard" : "Delete"}
      />
    </>
  );
}
