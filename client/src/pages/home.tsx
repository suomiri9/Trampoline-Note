import { useState } from "react";
import { Plus, BookOpen, Loader2, Activity, LayoutDashboard } from "lucide-react";
import { useNotes } from "@/hooks/use-notes";
import { NoteCard } from "@/components/note-card";
import { NoteDialog } from "@/components/note-dialog";
import { FocusMemo } from "@/components/focus-memo";
import { StreakCard } from "@/components/streak-card";
import { PageLayout } from "@/components/page-layout";
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
    <PageLayout>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-2xl shrink-0">
            <LayoutDashboard className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold">Training Log</h1>
            <p className="text-muted-foreground text-sm">Track your trampoline sessions, skills, and progress.</p>
          </div>
        </div>
        <Button
          onClick={handleCreateNew}
          className="rounded-2xl h-12 px-6 font-semibold bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-primary/20 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Start Training
        </Button>
      </div>

      <FocusMemo />

      {notes && <StreakCard notes={notes} />}

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
          <div className="py-24 px-6 flex flex-col items-center justify-center text-center rounded-[2rem] bg-card/50 shadow-md shadow-black/5">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      <NoteDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        noteToEdit={noteToEdit}
      />
    </PageLayout>
  );
}
