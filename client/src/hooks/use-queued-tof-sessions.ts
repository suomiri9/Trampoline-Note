import { useEffect, useState } from "react";
import { queueAll } from "@/lib/offline-db";
import { subscribeQueueChange } from "@/lib/offline-queue";
import type { TofSession, InsertTofSession } from "@shared/schema";

export interface PendingTofSession extends TofSession {
  _pending: true;
}

/**
 * Reconstruct queued ToF-session creates from IndexedDB so the ToF page
 * can render them with a "Pending sync" badge — same pattern as
 * useQueuedScores / useQueuedNotes.
 */
export function useQueuedTofSessions(): PendingTofSession[] {
  const [items, setItems] = useState<PendingTofSession[]>([]);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const all = await queueAll();
        if (!alive) return;
        const sessions: PendingTofSession[] = all
          .filter((q) => q.kind === "tofSession")
          .map((q) => {
            const body = (q.body ?? {}) as Partial<InsertTofSession>;
            return {
              id: q.tempId,
              userId: (body as { userId?: string | null }).userId ?? null,
              date: body.date ?? new Date().toISOString().split("T")[0],
              routineId: body.routineId ?? null,
              skillId: body.skillId ?? null,
              tofValues: body.tofValues ?? [],
              preJumpTof: body.preJumpTof ?? null,
              note: body.note ?? null,
              _pending: true,
            } as PendingTofSession;
          })
          .sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : 0));
        setItems(sessions);
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
