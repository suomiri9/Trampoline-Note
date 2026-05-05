import { useEffect, useState } from "react";
import { queueAll } from "@/lib/offline-db";
import { subscribeQueueChange } from "@/lib/offline-queue";
import type { Note, InsertNote } from "@shared/schema";

export interface PendingNote extends Note {
  _pending: true;
}

export function useQueuedNotes(): PendingNote[] {
  const [items, setItems] = useState<PendingNote[]>([]);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const all = await queueAll();
        if (!alive) return;
        const notes: PendingNote[] = all
          .filter((q) => q.kind === "note")
          .map((q) => {
            const body = (q.body ?? {}) as Partial<InsertNote>;
            return {
              id: q.tempId,
              userId: body.userId ?? null,
              date: body.date ?? new Date().toISOString().split("T")[0],
              startTime: body.startTime ?? null,
              endTime: body.endTime ?? null,
              content: body.content ?? "",
              skills: body.skills ?? null,
              rating: body.rating ?? null,
              sleepScore: body.sleepScore ?? null,
              _pending: true,
            } as PendingNote;
          })
          // Newest first so the entry the user just created appears at the top.
          .sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : 0));
        setItems(notes);
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
