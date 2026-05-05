import { useEffect, useState } from "react";
import { queueAll } from "@/lib/offline-db";
import { subscribeQueueChange } from "@/lib/offline-queue";

/**
 * Returns true while there's a pending focus-memo PATCH in the offline
 * queue. Used by the Points to Fix dialog to show a "Pending sync" badge
 * so the user knows their latest edits haven't reached the server yet.
 */
export function useHasQueuedFocusMemo(): boolean {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const all = await queueAll();
        if (!alive) return;
        setPending(all.some((q) => q.kind === "focusMemo"));
      } catch {
        if (alive) setPending(false);
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

  return pending;
}
