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
    case 'debutsHidden': return '/api/auth/debuts-hidden';
    case 'menuSettings': return '/api/auth/menu-settings';
    case 'tofSession': return '/api/tof-sessions';
    case 'executionSession': return '/api/execution-sessions';
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
  timeoutMs = 8000,
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
  timeoutMs = 8000,
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

/** Entity kinds that support offline UPDATE/DELETE of already-synced rows. */
export type ChangeKind = 'note' | 'score' | 'tofSession' | 'executionSession' | 'skill' | 'routine';

function listPathForChange(kind: ChangeKind): string {
  switch (kind) {
    case 'note': return '/api/notes';
    case 'score': return '/api/scores';
    case 'tofSession': return '/api/tof-sessions';
    case 'executionSession': return '/api/execution-sessions';
    case 'skill': return '/api/skills';
    case 'routine': return '/api/routines';
  }
}

function cacheKeyForChange(kind: ChangeKind): string {
  switch (kind) {
    case 'note': return 'notes';
    case 'score': return 'scores';
    case 'tofSession': return 'tofSessions';
    case 'executionSession': return 'executionSessions';
    case 'skill': return 'skills';
    case 'routine': return 'routines';
  }
}

/**
 * Apply an offline update/delete optimistically to the cached list
 * (IndexedDB, so it survives reloads while offline) and every mounted
 * react-query list query (plain arrays and the paged notes shape).
 */
export async function applyOptimisticListChange(
  kind: ChangeKind,
  id: number,
  method: 'PUT' | 'DELETE',
  body?: unknown,
): Promise<void> {
  const patch = (body && typeof body === 'object') ? (body as Record<string, unknown>) : {};
  const apply = (list: Array<Record<string, unknown>>) =>
    method === 'DELETE'
      ? list.filter((r) => r?.id !== id)
      : list.map((r) => (r?.id === id ? { ...r, ...patch } : r));
  try {
    const cached = await cacheGet<Array<Record<string, unknown>>>(cacheKeyForChange(kind));
    if (Array.isArray(cached)) await cacheSet(cacheKeyForChange(kind), apply(cached));
  } catch {
    // ignore — in-memory update below still lands
  }
  const listPath = listPathForChange(kind);
  queryClient.setQueriesData(
    { predicate: (q) => q.queryKey[0] === listPath },
    (old: unknown) => {
      if (Array.isArray(old)) return apply(old as Array<Record<string, unknown>>);
      if (old && typeof old === 'object' && Array.isArray((old as { items?: unknown }).items)) {
        const o = old as { items: Array<Record<string, unknown>>; total?: number };
        const items = apply(o.items);
        const total =
          method === 'DELETE' && typeof o.total === 'number'
            ? Math.max(0, o.total - 1)
            : o.total;
        return { ...o, items, total };
      }
      return old;
    },
  );
}

/** Body carries a routine "change from this day" marker (ordered mutation). */
function hasApplyFromDay(body: unknown): boolean {
  return (
    !!body &&
    typeof body === 'object' &&
    (body as Record<string, unknown>).applyFromDay != null
  );
}

/**
 * Queue an offline UPDATE or DELETE of an already-synced entity (positive id).
 * Collapses any prior queued change for the same entity — only the latest
 * state needs to reach the server (a DELETE supersedes earlier PUTs) —
 * EXCEPT around routine lineup edits marked `applyFromDay`. Those are ORDERED
 * mutations: the server snapshots whatever lineup is current when each one
 * lands, so a queued applyFromDay PUT must never be collapsed away by a later
 * edit (the boundary it creates would be lost), and an incoming applyFromDay
 * PUT must apply AFTER everything already queued (its snapshot depends on the
 * state those produce). Only plain-PUT-over-plain-PUT collapses; drain replays
 * the rest one by one in enqueue order.
 * Pending offline entries (negative tempIds) are handled elsewhere via
 * updateQueuedByTempId / deleteQueuedByTempId.
 */
export async function enqueueEntityChange(
  kind: ChangeKind,
  id: number,
  method: 'PUT' | 'DELETE',
  body?: unknown,
): Promise<OfflineQueuedResult> {
  const incomingOrdered = method === 'PUT' && hasApplyFromDay(body);
  const existing = await queueAll();
  for (const item of existing) {
    if (item.kind === kind && item.method !== 'POST' && item.tempId === id && item.id != null) {
      // A DELETE supersedes the entity's whole queued history.
      if (method !== 'DELETE' && (incomingOrdered || hasApplyFromDay(item.body))) continue;
      await queueDelete(item.id);
    }
  }
  await queueAdd({
    kind,
    url: `${listPathForChange(kind)}/${id}`,
    method,
    body: body ?? null,
    tempId: id,
    createdAt: Date.now(),
  });
  await applyOptimisticListChange(kind, id, method, body);
  notifyQueueChange();
  return { _queuedOffline: true, tempId: id };
}

/**
 * Run a network update/delete with an abort-controlled timeout; if offline
 * mode is on and the network fails or is too slow, queue the change instead.
 * Mirrors tryNetworkOrEnqueue for creates.
 */
export async function tryNetworkOrEnqueueChange<T>(
  kind: ChangeKind,
  id: number,
  method: 'PUT' | 'DELETE',
  body: unknown,
  doFetch: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 8000,
): Promise<T | OfflineQueuedResult> {
  const offline = getOfflineModeEnabled();
  const onLine = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (offline && !onLine) {
    return enqueueEntityChange(kind, id, method, body);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    try { ctrl.abort(); } catch { /* ignore */ }
  }, timeoutMs);
  try {
    return await doFetch(ctrl.signal);
  } catch (err) {
    if (offline && isNetworkOrAbortError(err)) {
      return enqueueEntityChange(kind, id, method, body);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Queue a skills-reorder PATCH while collapsing any prior queued reorder
 * (last order wins). Also patches sortOrder in the IndexedDB skills mirror
 * so the new order survives reloads while offline.
 */
export async function enqueueSkillsReorder(orderedIds: number[]): Promise<OfflineQueuedResult> {
  const existing = await queueAll();
  for (const item of existing) {
    if (item.kind === 'skill' && item.url === '/api/skills/reorder' && item.id != null) {
      await queueDelete(item.id);
    }
  }
  await queueAdd({
    kind: 'skill',
    url: '/api/skills/reorder',
    method: 'PATCH',
    body: { orderedIds },
    tempId: 0,
    createdAt: Date.now(),
  });
  try {
    const cached = await cacheGet<Array<Record<string, unknown> & { id?: number }>>('skills');
    if (Array.isArray(cached)) {
      await cacheSet(
        'skills',
        cached.map((s) => {
          const idx = typeof s.id === 'number' ? orderedIds.indexOf(s.id) : -1;
          return idx !== -1 ? { ...s, sortOrder: idx } : s;
        }),
      );
    }
  } catch {
    // ignore — in-memory optimistic update is handled by the caller
  }
  notifyQueueChange();
  return { _queuedOffline: true, tempId: 0 };
}

/** Reorder skills over the network, or queue the reorder when offline. */
export async function tryNetworkOrEnqueueReorder(
  orderedIds: number[],
  doFetch: (signal: AbortSignal) => Promise<void>,
  timeoutMs = 8000,
): Promise<void | OfflineQueuedResult> {
  const offline = getOfflineModeEnabled();
  const onLine = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (offline && !onLine) {
    return enqueueSkillsReorder(orderedIds);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    try { ctrl.abort(); } catch { /* ignore */ }
  }, timeoutMs);
  try {
    return await doFetch(ctrl.signal);
  } catch (err) {
    if (offline && isNetworkOrAbortError(err)) {
      return enqueueSkillsReorder(orderedIds);
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

export function remapBody(kind: QueueKind, body: any, idMap: Map<number, number>): any {
  if (idMap.size === 0 || !body || typeof body !== 'object') return body;
  if (kind === 'note') {
    return { ...body, skills: remapNoteSkillsString(body.skills, idMap) };
  }
  if (kind === 'routine' || kind === 'skill') {
    let next = body;
    if (Array.isArray(body.skillIds)) {
      next = { ...next, skillIds: body.skillIds.map((id: number) => idMap.get(id) ?? id) };
    }
    // A shape created offline references its (possibly also-offline) base via
    // parentSkillId — remap it to the real id once the base has synced.
    if (kind === 'skill' && typeof body.parentSkillId === 'number' && idMap.has(body.parentSkillId)) {
      next = { ...next, parentSkillId: idMap.get(body.parentSkillId) };
    }
    // A routine part created offline references its (possibly also-offline)
    // source routine via sourceRoutineId — remap it once the routine has synced.
    if (kind === 'skill' && typeof body.sourceRoutineId === 'number' && idMap.has(body.sourceRoutineId)) {
      next = { ...next, sourceRoutineId: idMap.get(body.sourceRoutineId) };
    }
    // A queued reorder may reference skills created offline — remap them and
    // drop any that never synced (negative ids would be rejected).
    if (Array.isArray(body.orderedIds)) {
      next = {
        ...next,
        orderedIds: body.orderedIds
          .map((id: number) => idMap.get(id) ?? id)
          .filter((id: number) => id > 0),
      };
    }
    return next;
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
  if (kind === 'tofSession' || kind === 'executionSession') {
    let next = body;
    if (typeof body.routineId === 'number' && idMap.has(body.routineId)) {
      next = { ...next, routineId: idMap.get(body.routineId) };
    }
    if (typeof body.skillId === 'number' && idMap.has(body.skillId)) {
      next = { ...next, skillId: idMap.get(body.skillId) };
    }
    // Ad-hoc "connect skills" target: remap each id (skills created offline
    // get their real ids on sync).
    if (Array.isArray(body.skillIds)) {
      next = { ...next, skillIds: body.skillIds.map((id: number) => idMap.get(id) ?? id) };
    }
    return next;
  }
  if (kind === 'focusMemo') {
    const remapMemoString = (s: unknown): unknown => {
      if (typeof s !== 'string') return s;
      try {
        const arr = JSON.parse(s);
        if (!Array.isArray(arr)) return s;
        const remapped = arr.map((p: any) => ({
          ...p,
          ...(Array.isArray(p?.skillIds)
            ? { skillIds: p.skillIds.map((id: number) => idMap.get(id) ?? id) }
            : {}),
          ...(Array.isArray(p?.routineIds)
            ? { routineIds: p.routineIds.map((id: number) => idMap.get(id) ?? id) }
            : {}),
        }));
        return JSON.stringify(remapped);
      } catch {
        return s;
      }
    };
    if (typeof body.focusMemo !== 'string') return body;
    const remappedMemo = remapMemoString(body.focusMemo);
    // Remap the merge base the same way so base/mine diffs stay meaningful
    // after temp skill/routine ids are replaced with real ones.
    const remappedBase =
      typeof body.baseFocusMemo === 'string'
        ? remapMemoString(body.baseFocusMemo)
        : undefined;
    if (remappedMemo === body.focusMemo && remappedBase === body.baseFocusMemo) {
      return body;
    }
    const next: any = { ...body, focusMemo: remappedMemo };
    if (remappedBase !== undefined) next.baseFocusMemo = remappedBase;
    return next;
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
  baseFocusMemo?: string,
): Promise<any> {
  const existing = await queueAll();
  let priorPending: string[] = [];
  // When collapsing prior queued focus-memo items, keep the EARLIEST base:
  // later local edits were built on local (unsynced) state, so the true
  // "last state read from the server" is the base of the first queued item.
  let effectiveBase = baseFocusMemo;
  for (const item of existing) {
    if (item.kind === 'focusMemo') {
      const body = item.body as {
        pendingPointIds?: unknown;
        baseFocusMemo?: unknown;
      } | null;
      if (body && Array.isArray(body.pendingPointIds)) {
        for (const id of body.pendingPointIds) {
          if (typeof id === 'string') priorPending.push(id);
        }
      }
      if (body && typeof body.baseFocusMemo === 'string') {
        effectiveBase = body.baseFocusMemo;
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
    body: {
      focusMemo,
      pendingPointIds: merged,
      ...(effectiveBase !== undefined ? { baseFocusMemo: effectiveBase } : {}),
    },
    tempId: 0,
    createdAt: Date.now(),
  });
  const optimistic = await applyOptimisticFocusMemo(focusMemo);
  notifyQueueChange();
  return optimistic;
}

/**
 * Queue a Debuts hidden-map PATCH while collapsing any prior queued
 * debuts-hidden update — the payload is the whole map (last write wins),
 * so only the most recent state needs to reach the server. Also mirrors
 * the new value into the cached user (IndexedDB + react-query) so the
 * choice survives a reload while offline.
 */
export async function enqueueDebutsHiddenUpdate(debutsHidden: string): Promise<void> {
  const existing = await queueAll();
  for (const item of existing) {
    if (item.kind === 'debutsHidden' && item.id != null) {
      await queueDelete(item.id);
    }
  }
  await queueAdd({
    kind: 'debutsHidden',
    url: urlForKind('debutsHidden'),
    method: 'PATCH',
    body: { debutsHidden },
    tempId: 0,
    createdAt: Date.now(),
  });
  try {
    const cached = await cacheGet<any>('user');
    if (cached) await cacheSet('user', { ...cached, debutsHidden });
  } catch {
    // ignore
  }
  const current = queryClient.getQueryData<any>(['/api/auth/user']);
  if (current) {
    queryClient.setQueryData(['/api/auth/user'], { ...current, debutsHidden });
  }
  notifyQueueChange();
}

/**
 * Queue a menu-settings PATCH while collapsing (merging) any prior queued
 * menu-settings update. Mirrors the change into the cached user optimistically.
 */
export async function enqueueMenuSettingsUpdate(
  body: { menuGuide?: string; menuRowConnections?: boolean },
): Promise<any> {
  const existing = await queueAll();
  let merged: Record<string, unknown> = {};
  for (const item of existing) {
    if (item.kind === 'menuSettings') {
      if (item.body && typeof item.body === 'object') {
        merged = { ...merged, ...(item.body as Record<string, unknown>) };
      }
      if (item.id != null) await queueDelete(item.id);
    }
  }
  merged = { ...merged, ...body };
  await queueAdd({
    kind: 'menuSettings',
    url: urlForKind('menuSettings'),
    method: 'PATCH',
    body: merged,
    tempId: 0,
    createdAt: Date.now(),
  });
  let optimistic: any = null;
  try {
    const cached = await cacheGet<any>('user');
    if (cached) {
      optimistic = { ...cached, ...merged };
      await cacheSet('user', optimistic);
    }
  } catch {
    // ignore
  }
  const current = queryClient.getQueryData<any>(['/api/auth/user']);
  if (current) {
    optimistic = { ...current, ...merged };
    queryClient.setQueryData(['/api/auth/user'], optimistic);
  }
  notifyQueueChange();
  return optimistic ?? merged;
}

/** PATCH menu settings over the network, or queue the update when offline. */
export async function tryNetworkOrEnqueueMenuSettings<T extends object>(
  body: { menuGuide?: string; menuRowConnections?: boolean },
  doFetch: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 8000,
): Promise<T | (T & { _queuedOffline: true })> {
  const offline = getOfflineModeEnabled();
  const onLine = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const enqueue = async (): Promise<T & { _queuedOffline: true }> => {
    const u = await enqueueMenuSettingsUpdate(body);
    return { ...(u as object), _queuedOffline: true } as T & { _queuedOffline: true };
  };
  if (offline && !onLine) return enqueue();
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    try { ctrl.abort(); } catch { /* ignore */ }
  }, timeoutMs);
  try {
    return await doFetch(ctrl.signal);
  } catch (err) {
    if (offline && isNetworkOrAbortError(err)) return enqueue();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Try to PATCH the focus memo over the network; if offline, queue the
 * update and return the optimistic user. Mirrors the offline-create
 * helpers used for skills/routines.
 */
export async function tryNetworkOrEnqueueFocusMemo<T extends object>(
  focusMemo: string,
  doFetch: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 8000,
  pendingPointIds: string[] = [],
  baseFocusMemo?: string,
): Promise<T | (T & { _queuedOffline: true })> {
  const offline = getOfflineModeEnabled();
  const onLine = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const enqueue = async (): Promise<T & { _queuedOffline: true }> => {
    const u = await enqueueFocusMemoUpdate(focusMemo, pendingPointIds, baseFocusMemo);
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
        const isDelete = item.method === 'DELETE';
        const res = await fetch(item.url, {
          method: item.method,
          headers: isDelete ? undefined : { 'Content-Type': 'application/json' },
          body: isDelete ? undefined : JSON.stringify(remappedBody),
          credentials: 'include',
        });
        // A queued DELETE hitting 404 means the entity is already gone
        // (deleted on another device) — that's the desired end state.
        if (isDelete && res.status === 404) {
          if (item.id != null) await queueDelete(item.id);
          synced += 1;
          continue;
        }
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
        if (item.kind === 'focusMemo' || item.kind === 'debutsHidden' || item.kind === 'menuSettings') {
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
            k === '/api/tof-sessions' ||
            k === '/api/execution-sessions' ||
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
  // Callers often pass a PARTIAL patch (valid for a PUT), but the queued
  // item is usually the original POST create, which must keep its full
  // shape to be accepted by the server on drain. Merge the patch into the
  // existing body instead of replacing it wholesale.
  const nextBody =
    target.body && typeof target.body === 'object' && !Array.isArray(target.body) &&
    body && typeof body === 'object' && !Array.isArray(body)
      ? { ...(target.body as Record<string, unknown>), ...(body as Record<string, unknown>) }
      : body;
  await queueAdd({
    kind: target.kind,
    url: target.url,
    method: target.method,
    body: nextBody,
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
