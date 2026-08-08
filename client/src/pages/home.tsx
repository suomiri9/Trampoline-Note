import { useState, useMemo } from "react";
import { Plus, BookOpen, Loader2, ChevronDown, Wrench } from "lucide-react";
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
  const { data, isLoading, isError, error, isFetching } = useNotesPage(limit);
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

  // Stats strip — derived from available data
  const thisWeek = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    return visibleNotes.filter(n => new Date(n.date) >= cutoff).length;
  }, [visibleNotes]);

  const STATS = [
    { label: "Sessions", value: total > 0 ? String(total) : "—" },
    { label: "This week", value: String(thisWeek) },
  ];

  return (
    <PageLayout>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="relative -mx-4 sm:-mx-6 px-4 sm:px-6 pt-safe-top pb-6 overflow-hidden">
        {/* Blue glow */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-72"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% -10%, hsl(var(--primary)/0.22) 0%, transparent 70%)",
          }}
        />

        {/* Eyebrow pill */}
        <div className="relative flex justify-center mb-5 pt-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border/40 bg-background/60 text-[10px] font-mono text-muted-foreground tracking-widest uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            Training Log
          </span>
        </div>

        {/* Headline */}
        <h1
          className="relative text-center font-black tracking-tight leading-[1.05] text-[36px] sm:text-[52px] mb-3"
          style={{
            background: "linear-gradient(160deg, hsl(var(--foreground)) 30%, hsl(var(--foreground)/0.5) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Track every{" "}
          <span
            style={{
              background: "linear-gradient(135deg, hsl(var(--primary)) 0%, #818cf8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            jump.
          </span>
        </h1>

        <p className="relative text-center text-xs sm:text-sm text-muted-foreground mb-6 max-w-[260px] mx-auto leading-relaxed">
          Every session, skill, and difficulty point — in one place.
        </p>

        {/* Actions */}
        <div className="relative flex items-center justify-center gap-2 mb-6">
          <PointsToFix />
          <Button
            onClick={handleCreateNew}
            className="flex items-center gap-1.5 px-4 h-9 sm:h-10 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{
              background: "linear-gradient(135deg, hsl(var(--primary)) 0%, #818cf8 100%)",
              boxShadow: "0 0 24px hsl(var(--primary)/0.35)",
            }}
          >
            <Plus className="w-4 h-4" />
            Start Training
          </Button>
        </div>

        {/* Stats strip */}
        {total > 0 && (
          <div
            className="relative grid mx-auto max-w-xs rounded-2xl overflow-hidden divide-x divide-border/30"
            style={{
              gridTemplateColumns: `repeat(${STATS.length}, 1fr)`,
              background: "hsl(var(--card)/0.6)",
              border: "1px solid hsl(var(--border)/0.4)",
              backdropFilter: "blur(12px)",
            }}
          >
            {STATS.map(s => (
              <div key={s.label} className="flex flex-col items-center py-3 gap-0.5">
                <span
                  className="text-xl font-bold tabular-nums leading-none"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--primary)), #818cf8)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {s.value}
                </span>
                <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <main>
        {offlineView && visibleNotes.length === 0 && !isLoading ? (
          <div className="space-y-4">
            {queuedNotes.length > 0 && (
              <div data-testid="list-pending-notes" className="flex flex-col">
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
          <div className="py-24 px-6 flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 mb-5 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <BookOpen className="w-7 h-7 text-primary" />
            </div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-2">No entries yet</p>
            <h3 className="text-2xl font-black tracking-tight mb-2">Start your log.</h3>
            <p className="text-sm text-muted-foreground max-w-xs mb-8 leading-relaxed">
              Record skills, reflections, and DD — and watch your progress build.
            </p>
            <Button
              onClick={handleCreateNew}
              className="flex items-center gap-1.5 px-5 h-10 rounded-xl text-sm font-semibold text-white"
              style={{ background: "linear-gradient(135deg, hsl(var(--primary)) 0%, #818cf8 100%)" }}
            >
              <Plus className="w-4 h-4" />
              Start Training
            </Button>
          </div>
        ) : (
          <>
            {/* Section label */}
            <div className="flex items-center justify-between mb-1 sticky top-0 z-10 bg-background/90 backdrop-blur-sm py-2 -mx-1 px-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/40">
                Recent Sessions
              </span>
              <span className="text-[10px] font-mono text-muted-foreground/30" data-testid="text-notes-count">
                {visibleNotes.length} of {total}
              </span>
            </div>

            {queuedNotes.length > 0 && (
              <div data-testid="list-pending-notes" className="flex flex-col mb-2">
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

            <div className="flex flex-col">
              {visibleNotes.map((note, index) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  index={index}
                  onEdit={handleEdit}
                />
              ))}
            </div>

            {hasMore && (
              <div className="mt-4 flex flex-col items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setLimit((l) => l + PAGE_SIZE)}
                  disabled={isFetching}
                  className="w-full rounded-xl h-10 text-[11px] font-mono text-muted-foreground/40 border border-border/20 hover:border-border/40 hover:text-muted-foreground/60 gap-2"
                  data-testid="btn-load-more-notes"
                >
                  {isFetching ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  Load {PAGE_SIZE} more
                </Button>
              </div>
            )}
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
