import { format } from "date-fns";
import { Calendar, MoreVertical, Pencil, Trash2, Activity } from "lucide-react";
import { type Note } from "@shared/schema";
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
import { useSkills } from "@/hooks/use-skills";
import { useRoutines } from "@/hooks/use-routines";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

interface NoteCardProps {
  note: Note;
  onEdit: (note: Note) => void;
  index: number;
}

export function NoteCard({ note, onEdit, index }: NoteCardProps) {
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const deleteNote = useDeleteNote();
  const { data: allItems } = useSkills();
  const { data: routines } = useRoutines();
  const { toast } = useToast();

  const handleDelete = () => {
    deleteNote.mutate(note.id, {
      onSuccess: () => {
        toast({ title: "Session deleted", description: "Your training note has been removed." });
      }
    });
  };

  const skillsData: { id: number; reps?: number }[] = (() => {
    try {
      const parsed = note.skills ? JSON.parse(note.skills) : [];
      if (Array.isArray(parsed)) return parsed;
      // Migration for old comma-separated string
      return note.skills ? note.skills.split(',').map(s => ({ id: parseInt(s) })) : [];
    } catch (e) {
      return note.skills ? note.skills.split(',').map(s => ({ id: parseInt(s) })) : [];
    }
  })();
  
  const totalDifficulty = (() => {
    let total = 0;
    let currentGroupDD = 0;
    let currentGroupReps = 1;

    skillsData.forEach((item: any) => {
      if (item.id === -1) {
        total += currentGroupDD * currentGroupReps;
        currentGroupDD = 0;
        currentGroupReps = 1;
      } else if (item.id === -2) {
        const routine = routines?.find(r => r.id === (item as any).routineId);
        if (routine) {
          const count = (item as any).attempt ?? routine.skillIds.length;
          total += routine.skillIds.slice(0, count).reduce((acc, sId) => {
            const skill = allItems?.find(s => s.id === sId);
            return acc + (skill?.difficulty || 0);
          }, 0);
        }
      } else {
        const skill = allItems?.find(s => s.id === item.id);
        currentGroupDD += (skill?.difficulty || 0);
        currentGroupReps = item.reps || 1;
      }
    });
    total += currentGroupDD * currentGroupReps;
    return total;
  })();

  const staggerClass = `stagger-${Math.min(index + 1, 5)}`;

  return (
    <>
      <div className={`group relative bg-card p-6 rounded-2xl border border-border/50 hover:border-border hover:shadow-lg transition-all animate-fade-in-up opacity-0 ${staggerClass}`}>
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800/30 shrink-0">
              <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </div>
            <span className="whitespace-nowrap text-sm font-medium text-slate-600 dark:text-slate-400">{format(new Date(note.date), "MMMM d, yyyy")}</span>
          </div>
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
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-2 text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/20 border border-slate-200 dark:border-slate-700/30 px-2.5 py-1 rounded-lg w-fit">
            <Activity className="w-3 h-3 shrink-0" />
            <span className="whitespace-nowrap">{note.startTime || "??:??"} - {note.endTime || "??:??"}</span>
          </div>
          {note.sleepScore != null ? (
            <div className="flex items-center gap-1 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/40 px-2.5 py-1 rounded-lg w-fit">
              <span className="text-[10px] font-bold text-yellow-600 uppercase tracking-wider">Sleep</span>
              <span className="text-xs font-mono font-bold text-yellow-700 dark:text-yellow-400">{note.sleepScore}/100</span>
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

                    // Handle Routine marker
                    if (group.length === 1 && (group[0] as any).id === -2) {
                      const item = group[0] as any;
                      const routine = routines?.find(r => r.id === item.routineId);
                      const baseSkillIds: number[] = routine?.skillIds ?? [];
                      const displaySkillIds: number[] = item.customSkillIds ?? (item.attempt != null ? baseSkillIds.slice(0, item.attempt) : baseSkillIds);
                      const routineDD = displaySkillIds.reduce((acc, sId) => {
                        const skill = allItems?.find(s => s.id === sId);
                        return acc + (skill?.difficulty || 0);
                      }, 0);
                      const isCustom = displaySkillIds.length !== baseSkillIds.length || (item.customSkillIds && JSON.stringify(item.customSkillIds) !== JSON.stringify(baseSkillIds));

                      return (
                        <div key={`routine-${groupIdx}`} className="flex items-center justify-between py-2 px-3 rounded-xl border border-primary/20 bg-primary/5 shadow-sm">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="px-2 py-0.5 h-5 font-mono text-[9px] bg-primary text-primary-foreground border-none">ROUTINE</Badge>
                            <span className="text-sm font-bold text-primary">{item.routineName || "Routine"}</span>
                            {isCustom && (
                              <span className="text-[11px] font-mono text-muted-foreground">{displaySkillIds.length} skills</span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono font-bold text-primary">{routineDD.toFixed(1)}</span>
                        </div>
                      );
                    }

                    const isSingle = group.length === 1;
                    const reps = group[0]?.reps || 1;

                    const lineDD = group.reduce((acc, skillItem) => {
                      const skill = allItems?.find(s => s.id === skillItem.id);
                      return acc + (skill?.difficulty || 0);
                    }, 0);

                    return (
                      <div key={`group-${groupIdx}`} className={cn(
                        "flex flex-wrap items-center gap-2 py-1.5 px-3 rounded-xl border shadow-sm",
                        isSingle
                          ? "bg-secondary/5 border-border/30"
                          : "bg-yellow-50/60 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800/30"
                      )}>
                        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                          {group.map((skillItem, skillIdx) => {
                            const skill = allItems?.find(s => s.id === skillItem.id);
                            if (!skill) return null;
                            return (
                              <div key={skillIdx} className="flex items-center gap-1.5">
                                <Badge variant="outline" className={cn(
                                  "px-2 py-0.5 h-5 font-mono text-[10px] bg-background shadow-sm",
                                  skill.isDrill === 1
                                    ? "border-red-300 text-red-500 dark:border-red-700 dark:text-red-400"
                                    : (!isSingle || skill.isDrill === 2)
                                    ? "border-yellow-300 text-yellow-600 dark:border-yellow-700 dark:text-yellow-400"
                                    : "border-border/60 text-muted-foreground"
                                )}>
                                  {skill.code}
                                </Badge>
                                {skillIdx < group.length - 1 && (
                                  <span className="text-yellow-400/70 font-bold text-xs">+</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-mono font-bold">
                          <span className="text-muted-foreground">{lineDD.toFixed(1)}</span>
                          <span className={isSingle ? "text-muted-foreground/40" : "text-yellow-400/70"}>×</span>
                          <span className={isSingle ? "text-foreground" : "text-yellow-600 dark:text-yellow-400"}>{reps}</span>
                          <span className={isSingle ? "text-muted-foreground/40" : "text-yellow-400/70"}>=</span>
                          <span className={isSingle ? "text-foreground" : "text-yellow-600 dark:text-yellow-400"}>{(lineDD * reps).toFixed(1)}</span>
                        </div>
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

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader><AlertDialogTitle>Delete Training Session?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="rounded-xl bg-destructive text-destructive-foreground">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
