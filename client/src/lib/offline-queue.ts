import { useEffect, useState } from 'react';
import {
  queueAdd,
  queueAll,
  queueDelete,
  queueCount,
  queueMoveToFailed,
  failedAll,
  failedDelete,
  failedClearAll,
  failedCount,
  cacheClearAll,
  type QueueKind,
  type QueuedItem,
  type FailedItem,
} from './offline-db';
import { queryClient } from './queryClient';
import { getOfflineModeEnabled } from './offline-mode';

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

function isNetworkOrAbortError(err: unknown): boolean {
  if (!err) return false;
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof TypeError) return true; // fetch network errors are TypeError
  const name = (err as { name?: string } | null | undefined)?.name;
  return name === 'AbortError' || name === 'TypeError' || name === 'NetworkError';
}

/**
 * Run a network create with an abort-controlled timeout. If offline mode is on
 * AND either the browser knows it's offline OR the network attempt fails/times
 * out, fall back to enqueueing the create so the mutation always settles
 * quickly instead of hanging forever (e.g. when navigator.onLine lies on iOS
 * PWAs or behind captive portals).
 */
export async function tryNetworkOrEnqueue<T>(
  kind: QueueKind,
  body: unknown,
  doFetch: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 12000,
): Promise<T | OfflineQueuedResult> {
  const offline = getOfflineModeEnabled();
  const onLine = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (offline && !onLine) {
    return enqueueCreate(kind, body);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    try { ctrl.abort(); } catch { /* ignore */ }
  }, timeoutMs);
  try {
    return await doFetch(ctrl.signal);
  } catch (err) {
    if (offline && isNetworkOrAbortError(err)) {
      return enqueueCreate(kind, body);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function getQueueCount(): Promise<number> {
  return queueCount();
}

export async function getFailedCount(): Promise<number> {
  return failedCount();
}

export async function getFailedItems(): Promise<FailedItem[]> {
  const items = await failedAll();
  return items.sort((a, b) => (b.failedAt ?? 0) - (a.failedAt ?? 0));
}

export async function discardFailedItem(id: number): Promise<void> {
  await failedDelete(id);
  notifyQueueChange();
}

export async function discardAllFailedItems(): Promise<void> {
  await failedClearAll();
  notifyQueueChange();
}

export type { FailedItem } from './offline-db';

let draining = false;

export interface DrainResult {
  synced: number;
  failed: number;
  rejected: number;
}

export async function drainQueue(): Promise<DrainResult> {
  if (draining) return { synced: 0, failed: 0, rejected: 0 };
  draining = true;
  let synced = 0;
  let failed = 0;
  let rejected = 0;
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
          // Stop on auth errors so we don't churn the queue and keep
          // items intact for a future drain after the user re-auths.
          if (res.status === 401 || res.status === 403) break;
          // For 4xx other than auth, the server rejected the payload —
          // move it to the failed list so the user can inspect/discard
          // it instead of silently losing the data.
          if (res.status >= 400 && res.status < 500 && item.id != null) {
            let errorMessage: string | undefined;
            try {
              const data = await res.clone().json();
              if (data && typeof data.message === 'string') {
                errorMessage = data.message;
              }
            } catch {
              try {
                const text = await res.text();
                if (text) errorMessage = text.slice(0, 500);
              } catch {
                // ignore
              }
            }
            try {
              // Atomic: failed-insert + queue-delete in one IndexedDB
              // transaction. If persisting to the failed store fails
              // for any reason (quota, transaction error, etc.), the
              // queued item stays in place so we don't silently drop
              // the user's entry.
              await queueMoveToFailed(item.id, {
                kind: item.kind,
                url: item.url,
                method: item.method,
                body: item.body,
                tempId: item.tempId,
                createdAt: item.createdAt,
                failedAt: Date.now(),
                status: res.status,
                errorMessage,
              });
              rejected += 1;
            } catch (err) {
              // Couldn't persist to the failed store — leave the item
              // in the queue so the next drain (or a manual retry) can
              // try again. Surface this as a transient failure.
              // eslint-disable-next-line no-console
              console.warn(
                '[offline-queue] failed to move rejected item to failed store; will retry next drain',
                err,
              );
            }
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
  return { synced, failed, rejected };
}

export async function clearOfflineDataAndQueue(): Promise<void> {
  await cacheClearAll();
  notifyQueueChange();
}

/**
 * Remove a not-yet-synced item from the queue by its tempId. Used when the
 * user discards a pending offline entry from the UI before it has reached
 * the server. Returns true if an item was removed.
 */
export async function deleteQueuedByTempId(tempId: number): Promise<boolean> {
  const items = await queueAll();
  const target = items.find((i) => i.tempId === tempId);
  if (!target || target.id == null) return false;
  await queueDelete(target.id);
  notifyQueueChange();
  return true;
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

export function useFailedCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      getFailedCount().then((c) => {
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
