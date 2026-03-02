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
import { useToast } from "@/hooks/use-toast";
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

interface NoteCardProps {
  note: Note;
  onEdit: (note: Note) => void;
  index: number;
}

export function NoteCard({ note, onEdit, index }: NoteCardProps) {
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const deleteNote = useDeleteNote();
  const { toast } = useToast();

  const handleDelete = () => {
    deleteNote.mutate(note.id, {
      onSuccess: () => {
        toast({
          title: "Session deleted",
          description: "Your training note has been removed.",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
    });
  };

  // Convert generic skills string into array for badges, or empty if none
  const skillsArray = note.skills 
    ? note.skills.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  // Determine animation delay class based on index (cap at 5 for simplicity)
  const staggerClass = `stagger-${Math.min(index + 1, 5)}`;

  return (
    <>
      <div className={`
        group relative bg-card p-6 rounded-2xl 
        border border-border/50
        hover:border-border hover:shadow-lg hover:shadow-black/[0.03]
        transition-all duration-300 ease-out
        animate-fade-in-up opacity-0
        ${staggerClass}
      `}>
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-secondary-foreground">
              <Calendar className="w-4 h-4" />
            </div>
            <span>
              {/* Parse date carefully handling string formats */}
              {format(new Date(note.date), "MMMM d, yyyy")}
              {note.time && ` at ${note.time}`}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            {note.rating ? <StarRating value={note.rating} onChange={() => {}} readonly /> : null}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 rounded-xl">
                <DropdownMenuItem onClick={() => onEdit(note)} className="cursor-pointer gap-2">
                  <Pencil className="h-4 w-4" /> Edit Session
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => setShowDeleteAlert(true)}
                  className="cursor-pointer gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap">
            {note.content}
          </p>

          {/* Skills */}
          {skillsArray.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {skillsArray.map((skill, i) => (
                <span 
                  key={i} 
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground"
                >
                  <Activity className="w-3 h-3 opacity-50" />
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Training Session?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your training note from this date.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
