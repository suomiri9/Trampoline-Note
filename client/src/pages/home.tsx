import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Plus, Wrench, BookOpen, Loader2, ChevronDown } from "lucide-react";
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
  const [isPointsOpen, setIsPointsOpen] = useState(false);

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

  // All date math below is local-calendar only (never UTC/toISOString):
  // note.date is a YYYY-MM-DD string and the athlete may be far ahead of UTC.
  const thisWeek = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 6); // rolling 7 days incl. today
    const cutoffStr = format(cutoff, "yyyy-MM-dd");
    return visibleNotes.filter(n => String(n.date).slice(0, 10) >= cutoffStr).length;
  }, [visibleNotes]);

  const streak = useMemo(() => {
    const uniqueDates = Array.from(new Set(visibleNotes.map(n => String(n.date).slice(0, 10)))).sort().reverse();
    if (!uniqueDates.length) return 0;
    const fmt = (d: Date) => format(d, "yyyy-MM-dd");
    const cursor = new Date();
    if (uniqueDates[0] !== fmt(cursor)) {
      cursor.setDate(cursor.getDate() - 1); // a streak may still be alive from yesterday
      if (uniqueDates[0] !== fmt(cursor)) return 0;
    }
    let count = 0;
    for (const d of uniqueDates) {
      if (d !== fmt(cursor)) break;
      count++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }, [visibleNotes]);

  // Best session DD from loaded notes (difficulty = stored set-group DD, difficultyVol = vol-group DD)
  const bestDD = useMemo(() => {
    if (!visibleNotes.length) return 0;
    return Math.max(...visibleNotes.map(n => (n.difficulty ?? 0) + (n.difficultyVol ?? 0)));
  }, [visibleNotes]);

  const STATS = [
    { label: "Sessions", value: total > 0 ? String(total) : "—" },
    { label: "Streak", value: streak > 0 ? `${streak}d` : "—" },
    { label: "Best DD", value: bestDD > 0 ? bestDD.toFixed(1) : "—" },
    { label: "This week", value: String(thisWeek) },
  ];

  return (
    <PageLayout>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="relative -mx-4 sm:-mx-6 px-6 pt-safe-top pb-0 overflow-hidden">
        {/* Blue glow backdrop */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-80"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, hsl(var(--primary)/0.18) 0%, hsl(var(--primary)/0.04) 55%, transparent 78%)",
          }}
        />

        {/* Eyebrow pill */}
        <div className="relative pt-7 pb-6 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/25 bg-card/60 text-[9px] font-mono text-muted-foreground/60 tracking-[0.18em] uppercase mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Training Log
          </div>

          {/* Headline */}
          <h1 className="font-black leading-[0.94] tracking-[-0.05em] mb-3" style={{ fontSize: "clamp(38px,10vw,48px)" }}>
            <span className="text-foreground">Track every</span>
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--chart-4)) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              jump.
            </span>
          </h1>

          <p className="text-[11px] text-muted-foreground/50 leading-relaxed mb-6 max-w-[200px]">
            Every session, skill, and difficulty point — in one place.
          </p>

          {/* Action row */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPointsOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border/30 bg-card/40 text-[11px] font-medium text-muted-foreground hover:bg-card/70 active:scale-[0.98] transition-all"
            >
              <Wrench className="w-3.5 h-3.5" />
              Points to Fix
            </button>
            <PointsToFix hideTrigger open={isPointsOpen} onOpenChange={setIsPointsOpen} />
            <Button
              onClick={handleCreateNew}
              className="bg-gradient-cta flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-semibold text-primary-foreground active:scale-[0.98] transition-transform h-auto"
              style={{ boxShadow: "0 0 22px hsl(var(--primary)/0.28)" }}
              aria-label="New session"
              data-testid="btn-new-note"
            >
              <Plus className="w-4 h-4" />
              Start Training
            </Button>
          </div>
        </div>

        {/* Stats strip — bordered panel, shown once there are sessions */}
        {total > 0 && (
          <div className="relative -mx-6 px-4 pb-4">
            <div className="flex divide-x divide-border/20 rounded-2xl overflow-hidden border border-border/20 bg-card/40">
              {STATS.map((s) => (
                <div key={s.label} className="flex-1 flex flex-col items-center py-3 gap-1">
                  <span
                    className="text-[18px] font-bold tabular-nums leading-none"
                    style={{
                      background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--chart-4)))",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    {s.value}
                  </span>
                  <span className="text-[8px] font-mono uppercase tracking-[0.15em] text-muted-foreground/40">
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
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
                  <NoteCard key={note.id} note={note} index={index} onEdit={handleEdit} isPending defaultOpen={index === 0} />
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
              className="bg-gradient-cta flex items-center gap-1.5 px-5 h-10 rounded-xl text-sm font-semibold text-primary-foreground"
            >
              <Plus className="w-4 h-4" />
              Start Training
            </Button>
          </div>
        ) : (
          <>
            {/* Sticky section header */}
            <div className="flex items-center justify-between sticky top-0 z-10 bg-background/90 backdrop-blur-md py-4 -mx-4 sm:-mx-6 px-4 sm:px-6">
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/30">
                Recent sessions
              </span>
              <span className="font-mono text-[9px] text-muted-foreground/20" data-testid="text-notes-count">
                {visibleNotes.length} of {total}
              </span>
            </div>

            {queuedNotes.length > 0 && (
              <div data-testid="list-pending-notes" className="flex flex-col">
                {queuedNotes.map((note, index) => (
                  <NoteCard key={note.id} note={note} index={index} onEdit={handleEdit} isPending defaultOpen={index === 0} />
                ))}
              </div>
            )}

            <div className="flex flex-col">
              {visibleNotes.map((note, index) => (
                <NoteCard key={note.id} note={note} index={index} onEdit={handleEdit} defaultOpen={index === 0 && queuedNotes.length === 0} />
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
