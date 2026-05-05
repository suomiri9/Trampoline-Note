import { useEffect, useState } from 'react';
import {
  queueAdd,
  queueAll,
  queueDelete,
  queueCount,
  cacheClearAll,
  type QueueKind,
  type QueuedItem,
} from './offline-db';
import { queryClient } from './queryClient';

const queueChangeListeners = new Set<() => void>();

function notifyQueueChange() {
  queueChangeListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore
    }
  });
}

export function subscribeQueueChange(cb: () => void): () => void {
  queueChangeListeners.add(cb);
  return () => {
    queueChangeListeners.delete(cb);
  };
}

export interface OfflineQueuedResult {
  _queuedOffline: true;
  tempId: number;
}

export function isQueuedOfflineResult(
  v: unknown,
): v is OfflineQueuedResult {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { _queuedOffline?: unknown })._queuedOffline === true
  );
}

export async function enqueueCreate(
  kind: QueueKind,
  body: unknown,
): Promise<OfflineQueuedResult> {
  const tempId = -Math.floor(1 + Math.random() * 1e9);
  const url = kind === 'note' ? '/api/notes' : '/api/scores';
  await queueAdd({
    kind,
    url,
    method: 'POST',
    body,
    tempId,
    createdAt: Date.now(),
  });
  notifyQueueChange();
  return { _queuedOffline: true, tempId };
}

export async function getQueueCount(): Promise<number> {
  return queueCount();
}

let draining = false;

export async function drainQueue(): Promise<{ synced: number; failed: number }> {
  if (draining) return { synced: 0, failed: 0 };
  draining = true;
  let synced = 0;
  let failed = 0;
  try {
    const items: QueuedItem[] = await queueAll();
    items.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    for (const item of items) {
      try {
        const res = await fetch(item.url, {
          method: item.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.body),
          credentials: 'include',
        });
        if (!res.ok) {
          failed += 1;
          // Stop on auth errors so we don't churn the queue.
          if (res.status === 401 || res.status === 403) break;
          // For 4xx other than auth, drop the item — server rejected it.
          if (res.status >= 400 && res.status < 500 && item.id != null) {
            await queueDelete(item.id);
          }
          continue;
        }
        if (item.id != null) await queueDelete(item.id);
        synced += 1;
      } catch {
        failed += 1;
        // Network error — stop and try later.
        break;
      }
    }
  } finally {
    draining = false;
  }
  if (synced > 0) {
    queryClient.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey[0];
        return (
          typeof k === 'string' &&
          (k === '/api/notes' ||
            k === '/api/scores' ||
            k.startsWith('/api/skills/') ||
            k.startsWith('/api/routines/'))
        );
      },
    });
  }
  notifyQueueChange();
  return { synced, failed };
}

export async function clearOfflineDataAndQueue(): Promise<void> {
  await cacheClearAll();
  notifyQueueChange();
}

export function useQueueCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      getQueueCount().then((c) => {
        if (alive) setCount(c);
      });
    };
    refresh();
    const unsub = subscribeQueueChange(refresh);
    return () => {
      alive = false;
      unsub();
    };
  }, []);
  return count;
}
