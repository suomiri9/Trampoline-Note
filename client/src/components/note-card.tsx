import { format } from "date-fns";
import { Calendar, MoreVertical, Pencil, Trash2, Clock } from "lucide-react";
import { PendingSyncBadge } from "@/components/pending-sync-badge";
import { type Note } from "@shared/schema";
import { parseNoteSkills, calculateTotalDD } from "@/lib/training-utils";
import { StarRating } from "./star-rating";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useDeleteNote } from "@/hooks/use-notes";
import { deleteQueuedByTempId } from "@/lib/offline-queue";
import { useSkills } from "@/hooks/use-skills";
import { useRoutines } from "@/hooks/use-routines";
import { useTimeFormat, formatTime } from "@/hooks/use-time-format";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

interface NoteCardProps {
  note: Note;
  onEdit: (note: Note) => void;
  index: number;
  isPending?: boolean;
}

export function NoteCard({ note, onEdit, index, isPending = false }: NoteCardProps) {
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const deleteNote = useDeleteNote();
  const { data: allItems } = useSkills();
  const { data: routines } = useRoutines();
  const [timeFormat] = useTimeFormat();
  const { toast } = useToast();

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
      onSuccess: () => {
        toast({ title: "Session deleted", description: "Your training note has been removed." });
      }
    });
  };

  const skillsData = parseNoteSkills(note.skills);
  const totalDifficulty = calculateTotalDD(skillsData, allItems, routines);

  const staggerClass = `stagger-${Math.min(index + 1, 5)}`;

  return (
    <>
      <div className={`group relative card-3d card-3d-hover p-4 sm:p-5 rounded-2xl transition-all animate-fade-in-up opacity-0 ${staggerClass}`}>
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800/30 shrink-0">
              <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </div>
            <span className="whitespace-nowrap text-sm font-medium text-slate-600 dark:text-slate-400">{format(new Date(note.date), "EEE, d MMMM yyyy")}</span>
          </div>
          {isPending ? (
            <div className="flex items-center gap-1">
              <PendingSyncBadge testId={`badge-pending-sync-${note.id}`} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground shrink-0"
                    data-testid={`btn-pending-actions-${note.id}`}
                  >
                    <MoreVertical className="h-4 w-4" />
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
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 rounded-xl">
                <DropdownMenuItem onClick={() => onEdit(note)} className="cursor-pointer gap-2">
                  <Pencil className="h-4 w-4" /> Edit Session
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowDeleteAlert(true)} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
                  <Trash2 className="h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-2 text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/20 px-2.5 py-1 rounded-lg w-fit">
            <Clock className="w-3 h-3 shrink-0" />
            <span className="whitespace-nowrap">{formatTime(note.startTime, timeFormat)} - {formatTime(note.endTime, timeFormat)}</span>
          </div>
          {note.sleepScore != null ? (
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/20 px-2.5 py-1 rounded-lg w-fit">
              <span className="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">Sleep score: {note.sleepScore}</span>
            </div>
          ) : null}
          {note.rating ? (
            <div className="shrink-0 scale-90 sm:scale-100 origin-right">
              <StarRating value={note.rating} onChange={() => {}} readonly />
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap">{note.content}</p>
          
          {skillsData.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-border/40">
              <div className="flex flex-col gap-1.5">
                {(() => {
                  const groups: ({ id: number; reps?: number } | { id: number; reps?: number }[])[] = [];
                  let currentGroup: { id: number; reps?: number }[] = [];

                  skillsData.forEach(item => {
                    if (item.id === -1) {
                      if (currentGroup.length > 0) {
                        groups.push(currentGroup);
                        currentGroup = [];
                      }
                      groups.push({ id: -1 });
                    } else {
                      currentGroup.push(item);
                    }
                  });
                  if (currentGroup.length > 0) groups.push(currentGroup);

                  return groups.map((group, groupIdx) => {
                    if (!Array.isArray(group)) return null;

                    if (group.length === 1 && (group[0] as any).id === -2) {
                      const item = group[0] as any;
                      const routine = routines?.find(r => r.id === item.routineId);
                      const baseSkillIds: number[] = routine?.skillIds ?? [];
                      const displaySkillIds: number[] = item.customSkillIds ?? (item.attempt != null ? baseSkillIds.slice(0, item.attempt) : baseSkillIds);
                      const routineDD = displaySkillIds.reduce((acc: number, sId: number) => {
                        const skill = allItems?.find(s => s.id === sId);
                        return acc + (skill?.difficulty || 0);
                      }, 0);
                      const reps = item.reps || 1;

                      return (
                        <div key={`routine-${groupIdx}`} className="rounded-xl bg-primary/5">
                          <div className="flex items-center justify-between py-2 px-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="px-2 py-0.5 h-5 font-mono text-[9px] bg-primary text-primary-foreground border-none">ROUTINE</Badge>
                              <span className="text-sm font-bold text-primary">{routine?.name || item.routineName || "Routine"}</span>
                              {displaySkillIds.length > baseSkillIds.length && (
                                <span className="text-[11px] font-mono text-muted-foreground">{displaySkillIds.length} skills</span>
                              )}
                              {displaySkillIds.length < baseSkillIds.length && (
                                <span className="text-[11px] font-mono text-muted-foreground">attempt {displaySkillIds.length}/{baseSkillIds.length}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] font-mono font-bold">
                              <span className="text-muted-foreground">{routineDD.toFixed(1)}</span>
                              {reps > 1 && (<><span className="text-primary/40">×</span><span className="text-primary">{reps}</span><span className="text-primary/40">=</span><span className="text-primary">{(routineDD * reps).toFixed(1)}</span></>)}
                            </div>
                          </div>
                          {item.note && <div className="px-3 pb-2"><span className="text-[11px] text-muted-foreground italic">{item.note}</span></div>}
                        </div>
                      );
                    }

                    if (group.length === 1 && (group[0] as any).id === -3) {
                      const item = group[0] as any;
                      const fc = allItems?.find(s => s.id === item.fcId);
                      const baseSkillIds: number[] = fc?.skillIds ?? [];
                      const displaySkillIds: number[] = item.customSkillIds ?? baseSkillIds;
                      const fcDD = displaySkillIds.reduce((acc: number, sId: number) => {
                        const skill = allItems?.find(s => s.id === sId);
                        return acc + (skill?.difficulty || 0);
                      }, 0);
                      const reps = item.reps || 1;

                      return (
                        <div key={`fc-${groupIdx}`} className={cn("rounded-xl", fc?.isDrill === 3 ? "bg-gray-100/60 dark:bg-gray-900/10" : "bg-red-50/60 dark:bg-red-900/10")}>
                          <div className="flex items-center justify-between py-2 px-3">
                            <div className="flex items-center gap-2">
                              {fc?.isDrill === 3 ? (
                                <Badge variant="outline" className="px-2 py-0.5 h-5 font-mono text-[9px] bg-gray-500 text-white border-none">PART</Badge>
                              ) : (
                                <Badge variant="outline" className="px-2 py-0.5 h-5 font-mono text-[9px] bg-red-500 text-white border-none">CONN</Badge>
                              )}
                              <span className={cn("text-sm font-bold", fc?.isDrill === 3 ? "text-gray-700 dark:text-gray-300" : "text-red-600 dark:text-red-400")}>{fc?.name || item.fcName || "Connection"}</span>
                              {displaySkillIds.length < baseSkillIds.length && (
                                <span className="text-[11px] font-mono text-muted-foreground">attempt {displaySkillIds.length}/{baseSkillIds.length}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] font-mono font-bold">
                              <span className="text-muted-foreground">{fcDD.toFixed(1)}</span>
                              {reps > 1 && (<><span className="text-red-400/70">×</span><span className="text-red-600 dark:text-red-400">{reps}</span><span className="text-red-400/70">=</span><span className="text-red-600 dark:text-red-400">{(fcDD * reps).toFixed(1)}</span></>)}
                            </div>
                          </div>
                          {item.note && <div className="px-3 pb-2"><span className="text-[11px] text-muted-foreground italic">{item.note}</span></div>}
                        </div>
                      );
                    }

                    const isSingle = group.length === 1;
                    const reps = group[0]?.reps || 1;

                    const lineDD = group.reduce((acc, gItem: any) => {
                      if (gItem.id === -2) {
                        const r = routines?.find(rt => rt.id === gItem.routineId);
                        const sIds = gItem.customSkillIds ?? r?.skillIds ?? [];
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

                    return (
                      <div key={`group-${groupIdx}`} className={cn(
                        "flex flex-wrap items-center gap-2 py-1.5 px-3 rounded-xl",
                        isSingle
                          ? "bg-secondary/30"
                          : "bg-red-50/60 dark:bg-red-900/10"
                      )}>
                        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                          {group.map((gItem: any, skillIdx) => {
                            const sep = skillIdx < group.length - 1 ? (
                              <span className="text-red-400/70 font-bold text-xs">+</span>
                            ) : null;
                            if (gItem.id === -2) {
                              const r = routines?.find(rt => rt.id === gItem.routineId);
                              return (
                                <div key={skillIdx} className="flex items-center gap-1.5">
                                  <Badge variant="outline" className="px-2 py-0.5 h-5 font-mono text-[9px] bg-primary text-primary-foreground border-none shrink-0">ROUTINE</Badge>
                                  <span className="text-[11px] font-bold text-primary truncate max-w-[120px]">{r?.name || gItem.routineName}</span>
                                  {sep}
                                </div>
                              );
                            }
                            if (gItem.id === -3) {
                              const fc = allItems?.find(s => s.id === gItem.fcId);
                              const isPart = fc?.isDrill === 3;
                              return (
                                <div key={skillIdx} className="flex items-center gap-1.5">
                                  <Badge variant="outline" className={cn("px-2 py-0.5 h-5 font-mono text-[9px] text-white border-none shrink-0", isPart ? "bg-gray-500" : "bg-red-500")}>{isPart ? "PART" : "CONN"}</Badge>
                                  <span className={cn("text-[11px] font-bold truncate max-w-[120px]", isPart ? "text-gray-700 dark:text-gray-300" : "text-red-600 dark:text-red-400")}>{fc?.name || gItem.fcName}</span>
                                  {sep}
                                </div>
                              );
                            }
                            const skill = allItems?.find(s => s.id === gItem.id);
                            if (!skill) return null;
                            if (skill.isDrill === 3) {
                              return (
                                <div key={skillIdx} className="flex items-center gap-1.5">
                                  <Badge variant="outline" className="px-2 py-0.5 h-5 font-mono text-[9px] bg-gray-500 text-white border-none shrink-0">PART</Badge>
                                  <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300 truncate max-w-[140px]">{skill.name}</span>
                                  {sep}
                                </div>
                              );
                            }
                            return (
                              <div key={skillIdx} className="flex items-center gap-1.5">
                                <Badge variant="outline" className={cn(
                                  "px-2 py-0.5 h-5 font-mono text-[10px] bg-background shadow-sm",
                                  skill.isDrill === 1
                                    ? "border-yellow-300 text-yellow-600 dark:border-yellow-700 dark:text-yellow-400"
                                    : (!isSingle || skill.isDrill === 2)
                                    ? "border-red-300 text-red-500 dark:border-red-700 dark:text-red-400"
                                    : "border-border/60 text-muted-foreground"
                                )}>
                                  {skill.code}
                                </Badge>
                                {sep}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-mono font-bold">
                          <span className="text-muted-foreground">{lineDD.toFixed(1)}</span>
                          <span className={isSingle ? "text-muted-foreground/40" : "text-red-400/70"}>×</span>
                          <span className={isSingle ? "text-foreground" : "text-red-600 dark:text-red-400"}>{reps}</span>
                          <span className={isSingle ? "text-muted-foreground/40" : "text-red-400/70"}>=</span>
                          <span className={isSingle ? "text-foreground" : "text-red-600 dark:text-red-400"}>{(lineDD * reps).toFixed(1)}</span>
                        </div>
                        {group[0]?.note && (
                          <div className="w-full mt-1">
                            <span className="text-[11px] text-muted-foreground italic">{group[0].note}</span>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
              <div className="flex justify-between items-center pt-1 mt-1 border-t border-dashed border-border/20">
                <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest">Total DD</span>
                <span className="text-[11px] font-mono font-bold text-primary">{totalDifficulty.toFixed(1)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

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
