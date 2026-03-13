import { useState } from "react";
import { Plus, BookOpen, Loader2, Activity, LayoutDashboard } from "lucide-react";
import { useNotes } from "@/hooks/use-notes";
import { NoteCard } from "@/components/note-card";
import { NoteDialog } from "@/components/note-dialog";
import { Button } from "@/components/ui/button";
import { type Note } from "@shared/schema";

export default function Home() {
  const { data: notes, isLoading, isError, error } = useNotes();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [noteToEdit, setNoteToEdit] = useState<Note | null>(null);

  const handleCreateNew = () => {
    setNoteToEdit(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (note: Note) => {
    setNoteToEdit(note);
    setIsDialogOpen(true);
  };

  // Sort notes newest first
  const sortedNotes = notes 
    ? [...notes].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : [];

  return (
    <div className="min-h-[100svh] bg-[#fafafa] dark:bg-background selection:bg-primary/20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-2xl shrink-0">
              <LayoutDashboard className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="space-y-1">
              <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground tracking-tight">
                Training Log
              </h1>
              <p className="text-lg text-muted-foreground">
                Track your trampoline sessions, skills, and progress.
              </p>
            </div>
          </div>
          
          <div className="flex gap-4">
            <Button 
              onClick={handleCreateNew}
              className="rounded-2xl h-12 px-6 font-semibold bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-primary/20 self-start md:self-auto flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Start Training
            </Button>
          </div>
        </div>

        {/* Content Section */}
        <main>
          {isLoading ? (
            <div className="py-24 flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary/40" />
              <p className="font-medium">Loading your logs...</p>
            </div>
          ) : isError ? (
            <div className="p-6 bg-destructive/5 border border-destructive/20 rounded-2xl text-destructive">
              <h3 className="font-semibold mb-1">Failed to load notes</h3>
              <p className="text-sm opacity-90">{(error as Error).message}</p>
            </div>
          ) : sortedNotes.length === 0 ? (
            <div className="py-24 px-6 flex flex-col items-center justify-center text-center border-2 border-dashed border-border/60 rounded-[2rem] bg-card/50">
              <div className="w-16 h-16 mb-6 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                <BookOpen className="w-8 h-8 text-blue-500" />
              </div>
              <h3 className="text-2xl font-display font-semibold mb-2">No sessions logged yet</h3>
              <p className="text-muted-foreground max-w-md mb-8">
                Start building your training history. Record your skills, write down reflections, and rate your performance.
              </p>
              <Button 
                onClick={handleCreateNew}
                variant="outline"
                className="rounded-xl border-border hover:bg-secondary transition-colors h-11 px-6 font-medium"
              >
                Start Training
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {sortedNotes.map((note, index) => (
                <NoteCard 
                  key={note.id} 
                  note={note} 
                  index={index}
                  onEdit={handleEdit} 
                />
              ))}
            </div>
          )}
        </main>

      </div>

      <NoteDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen} 
        noteToEdit={noteToEdit} 
      />
    </div>
  );
}
