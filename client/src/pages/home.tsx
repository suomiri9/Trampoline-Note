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

  const thisWeek = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    return visibleNotes.filter(n => new Date(n.date) >= cutoff).length;
  }, [visibleNotes]);

  const streak = useMemo(() => {
    const uniqueDates = Array.from(new Set(visibleNotes.map(n => String(n.date).slice(0, 10)))).sort().reverse();
    if (!uniqueDates.length) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const startStr = uniqueDates[0] === todayStr ? todayStr
      : uniqueDates[0] === yesterdayStr ? yesterdayStr
      : null;
    if (!startStr) return 0;
    const start = new Date(startStr);
    let count = 0;
    for (let i = 0; i < uniqueDates.length; i++) {
      const expected = new Date(start);
      expected.setDate(expected.getDate() - i);
      if (uniqueDates[i] === expected.toISOString().slice(0, 10)) count++;
      else break;
    }
    return count;
  }, [visibleNotes]);

  const STATS = [
    { label: "Sessions", value: total > 0 ? String(total) : "—" },
    { label: "Streak", value: streak > 0 ? `${streak}d` : "—" },
    { label: "This week", value: String(thisWeek) },
  ];

  return (
    <PageLayout>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="relative -mx-4 sm:-mx-6 px-6 pt-safe-top pb-0 overflow-hidden">
        {/* Blue glow */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-72"
          style={{
            background: "radial-gradient(ellipse 80% 60% at 50% -10%, hsl(var(--primary)/0.22) 0%, transparent 70%)",
          }}
        />

        {/* Top bar: breadcrumb label */}
        <div className="relative flex items-center justify-between pt-5 mb-10">
          <span className="font-mono text-[10px] font-semibold tracking-[0.22em] text-muted-foreground/75 uppercase">
            Training / Log
          </span>
        </div>

        {/* Headline row: left-aligned headline + Plus button */}
        <div className="relative flex items-end justify-between gap-4 mb-6">
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-primary/70">
              Performance ledger
            </p>
            <h1 className="font-black text-[38px] sm:text-[46px] leading-[0.92] tracking-[-0.05em]">
              Train<br />
              <span
                style={{
                  background: "linear-gradient(135deg, hsl(var(--primary)) 0%, #818cf8 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                with intent.
              </span>
            </h1>
          </div>

          <Button
            onClick={handleCreateNew}
            className="mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white transition-transform hover:scale-105"
            style={{
              background: "linear-gradient(135deg, hsl(var(--primary)) 0%, #818cf8 100%)",
              boxShadow: "0 0 24px hsl(var(--primary)/0.35)",
            }}
            aria-label="New session"
            data-testid="btn-new-note"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>

        {/* Stats strip */}
        {total > 0 && (
          <div className="relative -mx-6 grid border-y border-border/20 py-4 px-6"
            style={{ gridTemplateColumns: `repeat(${STATS.length}, 1fr)` }}>
            {STATS.map((s, i) => (
              <div key={s.label} className={`space-y-1 ${i > 0 ? "border-l border-border/20 pl-3" : ""}`}>
                <div
                  className="text-[20px] font-medium tracking-[-0.05em] leading-none tabular-nums"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--primary)), #818cf8)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {s.value}
                </div>
                <div className="font-mono text-[8px] uppercase tracking-[0.13em] text-muted-foreground/40">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Session list ─────────────────────────────────────────── */}
      <main>
        {offlineView && visibleNotes.length === 0 && !isLoading ? (
          <div className="space-y-4 pt-4">
            {queuedNotes.length > 0 && (
              <div data-testid="list-pending-notes" className="flex flex-col">
                {queuedNotes.map((note, index) => (
                  <NoteCard key={note.id} note={note} index={index} onEdit={handleEdit} isPending />
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
            {/* Sticky section header */}
            <div className="flex items-center justify-between sticky top-0 z-10 bg-background/90 backdrop-blur-md py-4 -mx-4 sm:-mx-6 px-4 sm:px-6">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/35">
                Recent sessions
              </span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10px] text-muted-foreground/25" data-testid="text-notes-count">
                  {visibleNotes.length} of {total}
                </span>
                <PointsToFix />
              </div>
            </div>

            {queuedNotes.length > 0 && (
              <div data-testid="list-pending-notes" className="flex flex-col">
                {queuedNotes.map((note, index) => (
                  <NoteCard key={note.id} note={note} index={index} onEdit={handleEdit} isPending />
                ))}
              </div>
            )}

            <div className="flex flex-col">
              {visibleNotes.map((note, index) => (
                <NoteCard key={note.id} note={note} index={index} onEdit={handleEdit} />
              ))}
            </div>

            {hasMore && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLimit(l => l + PAGE_SIZE)}
                disabled={isFetching}
                className="mt-4 w-full rounded-xl border border-border/10 h-11 text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/35 hover:border-primary/30 hover:text-primary/60 gap-2"
                data-testid="btn-load-more-notes"
              >
                {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Load {PAGE_SIZE} more
              </Button>
            )}
          </>
        )}
      </main>

      <NoteDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} noteToEdit={noteToEdit} />
    </PageLayout>
  );
}
