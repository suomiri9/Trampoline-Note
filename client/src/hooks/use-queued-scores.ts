import { useEffect, useState } from "react";
import { queueAll } from "@/lib/offline-db";
import { subscribeQueueChange } from "@/lib/offline-queue";
import type { Score, InsertScore } from "@shared/schema";

export interface PendingScore extends Score {
  _pending: true;
}

/**
 * Reconstruct queued score creates from IndexedDB so the score page can
 * render them with a "Pending sync" badge — same pattern as
 * useQueuedNotes for the training log.
 */
export function useQueuedScores(): PendingScore[] {
  const [items, setItems] = useState<PendingScore[]>([]);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const all = await queueAll();
        if (!alive) return;
        const scores: PendingScore[] = all
          .filter((q) => q.kind === "score")
          .map((q) => {
            const body = (q.body ?? {}) as Partial<InsertScore>;
            return {
              id: q.tempId,
              userId: (body as { userId?: string | null }).userId ?? null,
              date: body.date ?? new Date().toISOString().split("T")[0],
              type: body.type ?? "practice",
              category: body.category ?? "vol",
              competitionName: body.competitionName ?? null,
              rank: body.rank ?? null,
              routineId: body.routineId ?? null,
              routineIdVol: body.routineIdVol ?? null,
              attempt: body.attempt ?? null,
              attemptVol: body.attemptVol ?? null,
              execution: body.execution ?? 0,
              difficulty: body.difficulty ?? 0,
              horizontal: body.horizontal ?? 0,
              timeOfFlight: body.timeOfFlight ?? 0,
              total: body.total ?? 0,
              executionVol: body.executionVol ?? 0,
              difficultyVol: body.difficultyVol ?? 0,
              horizontalVol: body.horizontalVol ?? 0,
              timeOfFlightVol: body.timeOfFlightVol ?? 0,
              totalVol: body.totalVol ?? 0,
              _pending: true,
            } as PendingScore;
          })
          .sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : 0));
        setItems(scores);
      } catch {
        if (alive) setItems([]);
      }
    };
    void refresh();
    const unsub = subscribeQueueChange(() => {
      void refresh();
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  return items;
}
