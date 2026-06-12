import { useState } from "react";
import { Plus, BookOpen, Loader2, ChevronDown } from "lucide-react";
import { useNotesPage } from "@/hooks/use-notes";
import { useQueuedNotes } from "@/hooks/use-queued-notes";
import { NoteCard } from "@/components/note-card";
import { NoteDialog } from "@/components/note-dialog";
import { PointsToFix } from "@/components/points-to-fix";
import { PageLayout } from "@/components/page-layout";
import { PageHeader, primaryActionClass } from "@/components/page-header";
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
      <PageHeader
        eyebrow="Training Log"
        title="Training Log"
        accent="Log"
        subtitle="Track your trampoline sessions, skills, and progress."
        actions={
          <>
            <PointsToFix />
            <Button onClick={handleCreateNew} className={primaryActionClass}>
              <Plus className="w-5 h-5" />
              Start Training
            </Button>
          </>
        }
      />

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
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary/60" />
            <p className="font-mono text-xs uppercase tracking-widest">Loading your logs...</p>
          </div>
        ) : isError ? (
          <div className="p-6 bg-destructive/10 border border-destructive/30 rounded-2xl text-destructive">
            <h3 className="font-semibold mb-1">Failed to load notes</h3>
            <p className="text-sm opacity-90">{(error as Error).message}</p>
          </div>
        ) : visibleNotes.length === 0 ? (
          <div className="py-24 px-6 flex flex-col items-center justify-center text-center rounded-2xl card-3d">
            <div className="w-16 h-16 mb-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-primary" />
            </div>
            <div className="eyebrow mb-3">// No Entries</div>
            <h3 className="text-3xl font-display font-normal mb-2">No sessions logged yet</h3>
            <p className="text-muted-foreground max-w-md mb-8">
              Start building your training history. Record your skills, write down reflections, and rate your performance.
            </p>
            <Button onClick={handleCreateNew} className={primaryActionClass}>
              <Plus className="w-5 h-5" />
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
