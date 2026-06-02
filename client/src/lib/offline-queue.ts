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
  cacheGet,
  cacheSet,
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

function urlForKind(kind: QueueKind): string {
  switch (kind) {
    case 'note': return '/api/notes';
    case 'score': return '/api/scores';
    case 'skill': return '/api/skills';
    case 'routine': return '/api/routines';
    case 'focusMemo': return '/api/auth/focus-memo';
  }
}

function listPathForKind(kind: QueueKind): string | null {
  switch (kind) {
    case 'skill': return '/api/skills';
    case 'routine': return '/api/routines';
    default: return null;
  }
}

function cacheKeyForKind(kind: QueueKind): string | null {
  switch (kind) {
    case 'skill': return 'skills';
    case 'routine': return 'routines';
    default: return null;
  }
}

export async function enqueueCreate(
  kind: QueueKind,
  body: unknown,
): Promise<OfflineQueuedResult> {
  const tempId = -Math.floor(1 + Math.random() * 1e9);
  await queueAdd({
    kind,
    url: urlForKind(kind),
    method: 'POST',
    body,
    tempId,
    createdAt: Date.now(),
  });
  notifyQueueChange();
  return { _queuedOffline: true, tempId };
}

/**
 * Insert an optimistic record with a negative tempId into both the
 * IndexedDB cache (so it survives reloads while offline) and the
 * in-memory react-query cache (so the UI updates instantly).
 */
async function injectOptimisticRecord(
  kind: QueueKind,
  record: Record<string, unknown> & { id: number },
): Promise<void> {
  const cacheKey = cacheKeyForKind(kind);
  const listPath = listPathForKind(kind);
  if (cacheKey) {
    try {
      const existing = (await cacheGet<Record<string, unknown>[]>(cacheKey)) ?? [];
      await cacheSet(cacheKey, [...existing, record]);
    } catch {
      // ignore — UI will still get the in-memory update below
    }
  }
  if (listPath) {
    const current = queryClient.getQueryData<Record<string, unknown>[]>([listPath]) ?? [];
    queryClient.setQueryData([listPath], [...current, record]);
  }
}

/**
 * Remove an optimistic temp record from caches once we know the queued
 * create won't be retried (e.g. it was rejected by the server).
 */
async function removeOptimisticRecord(kind: QueueKind, tempId: number): Promise<void> {
  const cacheKey = cacheKeyForKind(kind);
  const listPath = listPathForKind(kind);
  if (cacheKey) {
    try {
      const existing = (await cacheGet<Array<{ id?: number }>>(cacheKey)) ?? [];
      await cacheSet(cacheKey, existing.filter((r) => r.id !== tempId));
    } catch {
      // ignore
    }
  }
  if (listPath) {
    const current = queryClient.getQueryData<Array<{ id?: number }>>([listPath]);
    if (current) {
      queryClient.setQueryData([listPath], current.filter((r) => r.id !== tempId));
    }
  }
}

/**
 * Like tryNetworkOrEnqueue, but also seeds an optimistic record (with the
 * generated tempId) into the offline cache and react-query cache when the
 * write has to be queued. Returns the optimistic record so callers can
 * continue working with it (e.g. immediately referencing the new skill in
 * a note). Used by skills and routines, which are referenced by id from
 * other entities.
 */
export async function tryNetworkOrEnqueueWithOptimistic<T extends Record<string, unknown>>(
  kind: 'skill' | 'routine',
  body: unknown,
  buildOptimistic: (tempId: number) => T & { id: number },
  doFetch: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 12000,
): Promise<T & { _queuedOffline?: true }> {
  const offline = getOfflineModeEnabled();
  const onLine = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const enqueue = async (): Promise<T & { _queuedOffline: true }> => {
    const tempId = -Math.floor(1 + Math.random() * 1e9);
    await queueAdd({
      kind,
      url: urlForKind(kind),
      method: 'POST',
      body,
      tempId,
      createdAt: Date.now(),
    });
    const optimistic = buildOptimistic(tempId);
    await injectOptimisticRecord(kind, optimistic);
    notifyQueueChange();
    return { ...optimistic, _queuedOffline: true } as T & { _queuedOffline: true };
  };

  if (offline && !onLine) {
    return enqueue();
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    try { ctrl.abort(); } catch { /* ignore */ }
  }, timeoutMs);
  try {
    return await doFetch(ctrl.signal);
  } catch (err) {
    if (offline && isNetworkOrAbortError(err)) {
      return enqueue();
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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

/**
 * Rewrite skill-reference items inside a note's `skills` JSON string using
 * a tempId → realId mapping. Handles plain skills, routine refs (id=-2),
 * connection refs (id=-3) including their `customSkillIds` arrays, and
 * leaves separators (id=-1) untouched.
 */
function remapSkillItem(item: any, idMap: Map<number, number>): any {
  if (!item || typeof item !== 'object') return item;
  if (item.id === -1) return item;
  if (item.id === -2) {
    const next = { ...item };
    if (typeof next.routineId === 'number' && idMap.has(next.routineId)) {
      next.routineId = idMap.get(next.routineId);
    }
    if (Array.isArray(next.customSkillIds)) {
      next.customSkillIds = next.customSkillIds.map((id: number) => idMap.get(id) ?? id);
    }
    return next;
  }
  if (item.id === -3) {
    const next = { ...item };
    if (typeof next.fcId === 'number' && idMap.has(next.fcId)) {
      next.fcId = idMap.get(next.fcId);
    }
    if (Array.isArray(next.customSkillIds)) {
      next.customSkillIds = next.customSkillIds.map((id: number) => idMap.get(id) ?? id);
    }
    return next;
  }
  if (typeof item.id === 'number' && idMap.has(item.id)) {
    return { ...item, id: idMap.get(item.id) };
  }
  return item;
}

function remapNoteSkillsString(s: unknown, idMap: Map<number, number>): unknown {
  if (typeof s !== 'string' || !s) return s;
  try {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return s;
    return JSON.stringify(arr.map((it) => remapSkillItem(it, idMap)));
  } catch {
    return s;
  }
}

function remapBody(kind: QueueKind, body: any, idMap: Map<number, number>): any {
  if (idMap.size === 0 || !body || typeof body !== 'object') return body;
  if (kind === 'note') {
    return { ...body, skills: remapNoteSkillsString(body.skills, idMap) };
  }
  if (kind === 'routine' || kind === 'skill') {
    if (Array.isArray(body.skillIds)) {
      return { ...body, skillIds: body.skillIds.map((id: number) => idMap.get(id) ?? id) };
    }
    return body;
  }
  if (kind === 'score') {
    const next = { ...body };
    if (typeof next.routineId === 'number' && idMap.has(next.routineId)) {
      next.routineId = idMap.get(next.routineId);
    }
    if (typeof next.routineIdVol === 'number' && idMap.has(next.routineIdVol)) {
      next.routineIdVol = idMap.get(next.routineIdVol);
    }
    return next;
  }
  if (kind === 'focusMemo') {
    if (typeof body.focusMemo !== 'string') return body;
    try {
      const arr = JSON.parse(body.focusMemo);
      if (!Array.isArray(arr)) return body;
      const remapped = arr.map((p: any) => ({
        ...p,
        ...(Array.isArray(p?.skillIds)
          ? { skillIds: p.skillIds.map((id: number) => idMap.get(id) ?? id) }
          : {}),
        ...(Array.isArray(p?.routineIds)
          ? { routineIds: p.routineIds.map((id: number) => idMap.get(id) ?? id) }
          : {}),
      }));
      return { ...body, focusMemo: JSON.stringify(remapped) };
    } catch {
      return body;
    }
  }
  return body;
}

/**
 * Apply a focus-memo change optimistically to the cached user (both
 * IndexedDB and react-query caches) so the UI reflects it immediately
 * and the change survives a reload while the device is offline.
 */
async function applyOptimisticFocusMemo(focusMemo: string): Promise<any> {
  let updated: any = null;
  try {
    const cached = await cacheGet<any>('user');
    if (cached) {
      updated = { ...cached, focusMemo };
      await cacheSet('user', updated);
    }
  } catch {
    // ignore
  }
  const current = queryClient.getQueryData<any>(['/api/auth/user']);
  if (current) {
    updated = { ...current, focusMemo };
    queryClient.setQueryData(['/api/auth/user'], updated);
  }
  return updated;
}

/**
 * Queue a focus-memo PATCH while collapsing any prior queued focus-memo
 * update — only the most recent state needs to reach the server.
 *
 * `pendingPointIds` is a sidecar list of point ids that have been added
 * or edited offline since the last successful sync. We accumulate it
 * across successive offline edits (filtered to ids still present in the
 * new focus memo) so the UI can mark exactly those rows as pending.
 * The server's zod schema ignores unknown fields, so it's safe to ship.
 */
export async function enqueueFocusMemoUpdate(
  focusMemo: string,
  pendingPointIds: string[] = [],
): Promise<any> {
  const existing = await queueAll();
  let priorPending: string[] = [];
  for (const item of existing) {
    if (item.kind === 'focusMemo') {
      const body = item.body as { pendingPointIds?: unknown } | null;
      if (body && Array.isArray(body.pendingPointIds)) {
        for (const id of body.pendingPointIds) {
          if (typeof id === 'string') priorPending.push(id);
        }
      }
      if (item.id != null) await queueDelete(item.id);
    }
  }
  // Keep only ids that still exist in the new focus memo, then union
  // with the ids touched by this mutation so a single badge appears
  // per row regardless of how many offline edits stacked up.
  const liveIds = new Set<string>();
  try {
    const arr = JSON.parse(focusMemo);
    if (Array.isArray(arr)) {
      for (const p of arr) {
        if (p && typeof p.id === 'string') liveIds.add(p.id);
      }
    }
  } catch {
    // ignore — legacy plain-text focus memo has no ids to track
  }
  const merged = Array.from(
    new Set([...priorPending, ...pendingPointIds].filter((id) => liveIds.has(id))),
  );
  await queueAdd({
    kind: 'focusMemo',
    url: urlForKind('focusMemo'),
    method: 'PATCH',
    body: { focusMemo, pendingPointIds: merged },
    tempId: 0,
    createdAt: Date.now(),
  });
  const optimistic = await applyOptimisticFocusMemo(focusMemo);
  notifyQueueChange();
  return optimistic;
}

/**
 * Try to PATCH the focus memo over the network; if offline, queue the
 * update and return the optimistic user. Mirrors the offline-create
 * helpers used for skills/routines.
 */
export async function tryNetworkOrEnqueueFocusMemo<T extends object>(
  focusMemo: string,
  doFetch: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 12000,
  pendingPointIds: string[] = [],
): Promise<T | (T & { _queuedOffline: true })> {
  const offline = getOfflineModeEnabled();
  const onLine = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const enqueue = async (): Promise<T & { _queuedOffline: true }> => {
    const u = await enqueueFocusMemoUpdate(focusMemo, pendingPointIds);
    return { ...(u as object), _queuedOffline: true } as T & { _queuedOffline: true };
  };

  if (offline && !onLine) {
    return enqueue();
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    try { ctrl.abort(); } catch { /* ignore */ }
  }, timeoutMs);
  try {
    return await doFetch(ctrl.signal);
  } catch (err) {
    if (offline && isNetworkOrAbortError(err)) {
      return enqueue();
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function drainQueue(): Promise<DrainResult> {
  if (draining) return { synced: 0, failed: 0, rejected: 0 };
  draining = true;
  let synced = 0;
  let failed = 0;
  let rejected = 0;
  // Maps tempId of an offline-created skill/routine to the real id the
  // server assigned once it synced. Subsequent items in this drain that
  // referenced the temp id (notes, routines, connections, scores) get
  // their bodies rewritten so the server sees real ids.
  const idMap = new Map<number, number>();
  try {
    const items: QueuedItem[] = await queueAll();
    items.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    for (const item of items) {
      const remappedBody = remapBody(item.kind, item.body, idMap);
      try {
        const res = await fetch(item.url, {
          method: item.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(remappedBody),
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
                body: remappedBody,
                tempId: item.tempId,
                createdAt: item.createdAt,
                failedAt: Date.now(),
                status: res.status,
                errorMessage,
              });
              rejected += 1;
              // The temp record is now orphaned — drop it from caches so
              // it stops appearing in pickers/lists. (The user can still
              // see the rejection in the failed-items panel.)
              if (item.kind === 'skill' || item.kind === 'routine') {
                await removeOptimisticRecord(item.kind, item.tempId);
              }
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
        // For skills/routines, capture the server-assigned id so later
        // queued items in this drain can be remapped from the tempId.
        if (item.kind === 'skill' || item.kind === 'routine') {
          try {
            const data = await res.clone().json();
            if (data && typeof data.id === 'number') {
              idMap.set(item.tempId, data.id);
            }
          } catch {
            // ignore — best effort
          }
        }
        // For focus-memo, refresh the cached user so the server's
        // canonical state (including any timestamps it sets) lands in
        // both caches and replaces any optimistic local copy.
        if (item.kind === 'focusMemo') {
          try {
            const data = await res.clone().json();
            if (data) {
              await cacheSet('user', data);
              queryClient.setQueryData(['/api/auth/user'], data);
            }
          } catch {
            // ignore — best effort
          }
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
            k === '/api/skills' ||
            k === '/api/routines' ||
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

/**
 * Update the body payload of a queued (not-yet-synced) item by its tempId.
 * Used when the user edits a pending offline entry before it has reached the
 * server: the queued create is rewritten with the new body so that when the
 * queue drains, the server receives the latest version. Returns true on
 * success.
 */
export async function updateQueuedByTempId(
  tempId: number,
  body: unknown,
): Promise<boolean> {
  const items = await queueAll();
  const target = items.find((i) => i.tempId === tempId);
  if (!target || target.id == null) return false;
  await queueAdd({
    kind: target.kind,
    url: target.url,
    method: target.method,
    body,
    tempId: target.tempId,
    createdAt: target.createdAt,
  });
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
