import { useEffect, useState } from "react";
import { queueAll } from "@/lib/offline-db";
import { subscribeQueueChange } from "@/lib/offline-queue";
import type { ExecutionSession, InsertExecutionSession } from "@shared/schema";

export interface PendingExecutionSession extends ExecutionSession {
  _pending: true;
}

/**
 * Reconstruct queued execution-session creates from IndexedDB so the
 * Execution page can render them with a "Pending sync" badge — same pattern
 * as useQueuedTofSessions / useQueuedScores.
 */
export function useQueuedExecutionSessions(): PendingExecutionSession[] {
  const [items, setItems] = useState<PendingExecutionSession[]>([]);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const all = await queueAll();
        if (!alive) return;
        const sessions: PendingExecutionSession[] = all
          .filter((q) => q.kind === "executionSession" && q.method === "POST")
          .map((q) => {
            const body = (q.body ?? {}) as Partial<InsertExecutionSession>;
            return {
              id: q.tempId,
              userId: (body as { userId?: string | null }).userId ?? null,
              date: body.date ?? new Date().toISOString().split("T")[0],
              routineId: body.routineId ?? null,
              skillId: body.skillId ?? null,
              skillIds: body.skillIds ?? null,
              category: body.category ?? "vol",
              deductions: body.deductions ?? [],
              landingDeduction: body.landingDeduction ?? null,
              note: body.note ?? null,
              context: body.context ?? "practice",
              compName: body.compName ?? null,
              _pending: true,
            } as PendingExecutionSession;
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
