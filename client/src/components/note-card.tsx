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
  
  const totalDifficulty = skillsData.reduce((sum, item) => {
    if (item.id === -1) return sum;
    const skill = allItems?.find(s => s.id === item.id);
    return sum + ((skill?.difficulty || 0) * (item.reps || 1));
  }, 0);

  const staggerClass = `stagger-${Math.min(index + 1, 5)}`;

  return (
    <>
      <div className={`group relative bg-card p-6 rounded-2xl border border-border/50 hover:border-border hover:shadow-lg transition-all animate-fade-in-up opacity-0 ${staggerClass}`}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-secondary-foreground"><Calendar className="w-4 h-4" /></div>
            <span>{format(new Date(note.date), "MMMM d, yyyy")}{note.time && ` at ${note.time}`}</span>
          </div>
          <div className="flex items-center gap-3">
            {note.rating ? <StarRating value={note.rating} onChange={() => {}} readonly /> : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 rounded-xl">
                <DropdownMenuItem onClick={() => onEdit(note)} className="cursor-pointer gap-2"><Pencil className="h-4 w-4" /> Edit Session</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowDeleteAlert(true)} className="cursor-pointer gap-2 text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" /> Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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

                    const isSingle = group.length === 1;
                    const reps = group[0].reps || 1;

                    return (
                      <div key={`group-${groupIdx}`} className={cn(
                        "flex flex-wrap items-center gap-2 py-1.5 px-3 rounded-xl border border-border/30 shadow-sm",
                        isSingle ? "bg-secondary/5" : "bg-primary/5 border-primary/20"
                      )}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {group.map((skillItem, skillIdx) => {
                            const skill = allItems?.find(s => s.id === skillItem.id);
                            if (!skill) return null;
                            return (
                              <div key={skillIdx} className="flex items-center gap-2">
                                <Badge variant="outline" className={cn(
                                  "px-2 py-0.5 h-5 font-mono text-[10px] bg-background shadow-sm",
                                  isSingle ? "border-border/60 text-muted-foreground" : "border-primary/30 text-primary"
                                )}>
                                  {skill.code}
                                </Badge>
                                {skillIdx < group.length - 1 && (
                                  <span className="text-primary/30 font-bold text-xs">+</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {reps > 1 && (
                          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-bold bg-primary/10 text-primary border-none">
                            x{reps}
                          </Badge>
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

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader><AlertDialogTitle>Delete Training Session?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="rounded-xl bg-destructive text-destructive-foreground">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
