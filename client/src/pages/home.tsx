import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Plus, Wrench, BookOpen, Loader2, ChevronDown } from "lucide-react";
import { useNotes, useNotesPage } from "@/hooks/use-notes";
import { useQueuedNotes } from "@/hooks/use-queued-notes";
import { useSkills } from "@/hooks/use-skills";
import { useRoutines } from "@/hooks/use-routines";
import { parseNoteSkills, calculateTotalDD } from "@/lib/training-utils";
import { NoteCard } from "@/components/note-card";
import { NoteDialog } from "@/components/note-dialog";
import { PointsToFix } from "@/components/points-to-fix";
import { PageLayout } from "@/components/page-layout";
import { PageHeader, primaryActionClass, headerActionClass } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { OfflinePlaceholder } from "@/components/offline-placeholder";
import { useOfflineMode } from "@/hooks/use-offline-mode";
import { useOnline } from "@/hooks/use-online";
import { type Note } from "@shared/schema";
import { cn } from "@/lib/utils";

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

  // Stat strip inputs: prefer the full history (shared with the Stats page's
  // cache) so Streak/Best DD aren't capped at the visible page; fall back to
  // the loaded page so the strip fills on first paint.
  const { data: allNotes } = useNotes();
  const { data: allItems } = useSkills();
  const { data: routines } = useRoutines();
  const statNotes = allNotes ?? visibleNotes;

  // All date math below is local-calendar only (never UTC/toISOString):
  // note.date is a YYYY-MM-DD string and the athlete may be far ahead of UTC.
  const thisWeek = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 6); // rolling 7 days incl. today
    const cutoffStr = format(cutoff, "yyyy-MM-dd");
    return statNotes.filter(n => String(n.date).slice(0, 10) >= cutoffStr).length;
  }, [statNotes]);

  const streak = useMemo(() => {
    const uniqueDates = Array.from(new Set(statNotes.map(n => String(n.date).slice(0, 10)))).sort().reverse();
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
  }, [statNotes]);

  // Best single-session DD, computed from the logged skills/routines exactly
  // like the Stats page (notes don't store a difficulty column — the old read
  // of n.difficulty always came up empty).
  const bestDD = useMemo(() => {
    return statNotes.reduce(
      (m, n) => Math.max(m, calculateTotalDD(parseNoteSkills(n.skills), allItems, routines, n.date)),
      0,
    );
  }, [statNotes, allItems, routines]);

  const STATS = [
    { label: "Sessions", value: total > 0 ? String(total) : "—" },
    { label: "Streak", value: streak > 0 ? `${streak}d` : "—" },
    { label: "Best DD", value: bestDD > 0 ? bestDD.toFixed(1) : "—" },
    { label: "This week", value: String(thisWeek) },
  ];

  return (
    <PageLayout>
      {/* Page-accent glow behind the header, same as every other page */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-72 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, hsl(var(--page-accent)/0.14) 0%, hsl(var(--page-accent)/0.03) 55%, transparent 78%)",
        }}
        aria-hidden="true"
      />
      {/* ── Header — same sticky collapsing header as every other page ── */}
      <PageHeader
        centered
        kicker="Training Log"
        title="Track every jump."
        accent="jump."
        subtitle="Every session, skill, and difficulty point — in one place."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => setIsPointsOpen(true)}
              className={cn(headerActionClass, "shrink-0")}
              aria-label="Points to Fix"
              data-testid="btn-points-to-fix"
            >
              <Wrench className="w-4 h-4" />
              <span className="group-data-[collapsed=true]/pageheader:hidden">Points to Fix</span>
            </Button>
            <Button
              className={cn(primaryActionClass, "shrink-0")}
              onClick={handleCreateNew}
              aria-label="New session"
              data-testid="btn-new-note"
            >
              <Plus className="w-5 h-5" />
              <span className="group-data-[collapsed=true]/pageheader:hidden">Start Training</span>
            </Button>
          </>
        }
      />
      <PointsToFix hideTrigger open={isPointsOpen} onOpenChange={setIsPointsOpen} />

      {/* Stats strip — bordered panel, shown once there are sessions */}
      {total > 0 && (
        <div className="mb-2">
          <div className="flex divide-x divide-white/[0.06] rounded-2xl overflow-hidden border border-white/[0.07] bg-white/[0.025]">
            {STATS.map((s) => (
              <div key={s.label} className="flex-1 flex flex-col items-center py-3 gap-1">
                <span
                  className="text-[18px] font-bold tabular-nums leading-none"
                  style={{
                    background: "linear-gradient(135deg,#60a5fa,#a78bfa)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {s.value}
                </span>
                <span className="text-[8px] font-mono uppercase tracking-[0.15em] text-muted-foreground/60">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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
            <div className="flex items-center justify-between sticky z-20 full-bleed-bar py-2 bg-background/90 backdrop-blur-md border-b border-white/[0.08]" style={{ top: "var(--page-header-h, 96px)" }}>
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/55">
                Recent sessions
              </span>
              <span className="font-mono text-[9px] text-muted-foreground/60" data-testid="text-notes-count">
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
                className="mt-4 w-full rounded-xl border border-border/10 h-11 text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/55 hover:border-primary/30 hover:text-primary/60 gap-2"
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
