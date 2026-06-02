import { useState } from "react";
import { Plus, BookOpen, Loader2, Activity, LayoutDashboard, ChevronDown } from "lucide-react";
import { useNotesPage } from "@/hooks/use-notes";
import { useQueuedNotes } from "@/hooks/use-queued-notes";
import { NoteCard } from "@/components/note-card";
import { NoteDialog } from "@/components/note-dialog";
import { PointsToFix } from "@/components/points-to-fix";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { OfflinePlaceholder } from "@/components/offline-placeholder";
import { useOfflineMode } from "@/hooks/use-offline-mode";
import { useOnline } from "@/hooks/use-online";
import { type Note } from "@shared/schema";

const PAGE_SIZE = 30;

export default function Home() {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [offlineModeEnabled] = useOfflineMode();
  const isOnline = useOnline();
  const offlineView = offlineModeEnabled && !isOnline;
  const { data, isLoading, isError, error, isFetching } = useNotesPage(limit, {
    enabled: !offlineView,
  });
  const queuedNotes = useQueuedNotes();
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

  const visibleNotes = data?.items ?? [];
  const hasMore = data?.hasMore ?? false;
  const total = data?.total ?? visibleNotes.length;

  return (
    <PageLayout>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-2xl shrink-0 icon-3d">
            <LayoutDashboard className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold">Training Log</h1>
            <p className="text-muted-foreground text-sm">Track your trampoline sessions, skills, and progress.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PointsToFix />
          <Button
            onClick={handleCreateNew}
            className="rounded-2xl h-12 px-6 font-semibold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all btn-3d flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Start Training
          </Button>
        </div>
      </div>

      <main>
        {offlineView ? (
          <div className="space-y-4">
            {queuedNotes.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="list-pending-notes">
                {queuedNotes.map((note, index) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    index={index}
                    onEdit={handleEdit}
                    isPending
                  />
                ))}
              </div>
            )}
            <OfflinePlaceholder
              testId="card-offline-notes"
              hint={
                queuedNotes.length > 0
                  ? "Past sessions aren't available offline. The entries above will sync when you reconnect."
                  : "Your training log isn't available offline. New entries you add will sync when you reconnect."
              }
            />
          </div>
        ) : isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary/40" />
            <p className="font-medium">Loading your logs...</p>
          </div>
        ) : isError ? (
          <div className="p-6 bg-destructive/5 border border-destructive/20 rounded-2xl text-destructive">
            <h3 className="font-semibold mb-1">Failed to load notes</h3>
            <p className="text-sm opacity-90">{(error as Error).message}</p>
          </div>
        ) : visibleNotes.length === 0 ? (
          <div className="py-24 px-6 flex flex-col items-center justify-center text-center rounded-[2rem] card-3d">
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
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleNotes.map((note, index) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  index={index}
                  onEdit={handleEdit}
                />
              ))}
            </div>
            <div className="mt-6 flex flex-col items-center gap-2">
              {hasMore && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLimit((l) => l + PAGE_SIZE)}
                  disabled={isFetching}
                  className="rounded-xl h-11 px-6 font-medium gap-2"
                  data-testid="btn-load-more-notes"
                >
                  {isFetching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                  Load {PAGE_SIZE} more
                </Button>
              )}
              <span className="text-xs text-muted-foreground" data-testid="text-notes-count">
                Showing {visibleNotes.length} of {total}
              </span>
            </div>
          </>
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
