import { useEffect, useState } from "react";
import { queueAll } from "@/lib/offline-db";
import { subscribeQueueChange } from "@/lib/offline-queue";

const EMPTY = new Set<string>();

/**
 * Returns the set of point ids that are part of an unsynced focus-memo
 * update. Each queued focus-memo item carries a `pendingPointIds`
 * sidecar listing the ids touched offline; we union them so every row
 * the user added or edited gets a "Pending sync" badge.
 */
export function useQueuedFocusMemoPointIds(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(EMPTY);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const all = await queueAll();
        if (!alive) return;
        const next = new Set<string>();
        for (const item of all) {
          if (item.kind !== "focusMemo") continue;
          const body = item.body as { pendingPointIds?: unknown } | null;
          if (!body || !Array.isArray(body.pendingPointIds)) continue;
          for (const id of body.pendingPointIds) {
            if (typeof id === "string") next.add(id);
          }
        }
        setIds((prev) => {
          if (prev.size === next.size) {
            let same = true;
            for (const id of next) {
              if (!prev.has(id)) {
                same = false;
                break;
              }
            }
            if (same) return prev;
          }
          return next.size === 0 ? EMPTY : next;
        });
      } catch {
        if (alive) setIds(EMPTY);
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

  return ids;
}
