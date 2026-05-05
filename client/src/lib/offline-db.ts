const DB_NAME = 'tn-offline';
const DB_VERSION = 2;
const STORE_CACHE = 'cache';
const STORE_QUEUE = 'queue';
const STORE_FAILED = 'failed';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE);
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_FAILED)) {
        db.createObjectStore(STORE_FAILED, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // If a future tab/version asks us to upgrade, close so it isn't blocked.
      db.onversionchange = () => {
        try { db.close(); } catch { /* ignore */ }
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('IndexedDB open failed'));
    };
    req.onblocked = () => {
      // Another tab is holding an older version open. Reject quickly so callers
      // surface a clear error instead of hanging forever.
      dbPromise = null;
      reject(new Error('IndexedDB open blocked by another tab'));
    };
  });
  return dbPromise;
}

function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const req = fn(s);
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const v = await withStore<T | undefined>(STORE_CACHE, 'readonly', (s) => s.get(key));
    return (v ?? null) as T | null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  try {
    await withStore(STORE_CACHE, 'readwrite', (s) => s.put(value as any, key));
  } catch {
    // ignore
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try {
    await withStore(STORE_CACHE, 'readwrite', (s) => s.delete(key));
  } catch {
    // ignore
  }
}

export async function cacheClearAll(): Promise<void> {
  try {
    await withStore(STORE_CACHE, 'readwrite', (s) => s.clear());
    await withStore(STORE_QUEUE, 'readwrite', (s) => s.clear());
    await withStore(STORE_FAILED, 'readwrite', (s) => s.clear());
  } catch {
    // ignore
  }
}

export type QueueKind = 'note' | 'score' | 'skill' | 'routine' | 'focusMemo';

export interface QueuedItem {
  id?: number;
  kind: QueueKind;
  url: string;
  method: string;
  body: unknown;
  tempId: number;
  createdAt: number;
}

export async function queueAdd(item: Omit<QueuedItem, 'id'>): Promise<number> {
  return await withStore<number>(STORE_QUEUE, 'readwrite', (s) =>
    s.add(item) as IDBRequest<number>,
  );
}

export async function queueAll(): Promise<QueuedItem[]> {
  try {
    return await withStore<QueuedItem[]>(STORE_QUEUE, 'readonly', (s) =>
      s.getAll() as IDBRequest<QueuedItem[]>,
    );
  } catch {
    return [];
  }
}

export async function queueDelete(id: number): Promise<void> {
  try {
    await withStore(STORE_QUEUE, 'readwrite', (s) => s.delete(id));
  } catch {
    // ignore
  }
}

export async function queueCount(): Promise<number> {
  try {
    return await withStore<number>(STORE_QUEUE, 'readonly', (s) =>
      s.count() as IDBRequest<number>,
    );
  } catch {
    return 0;
  }
}

export interface FailedItem {
  id?: number;
  kind: QueueKind;
  url: string;
  method: string;
  body: unknown;
  tempId: number;
  createdAt: number;
  failedAt: number;
  status: number;
  errorMessage?: string;
}

/**
 * Atomically move a queued item to the failed store: both the failed
 * insert and the queue delete happen inside a single IndexedDB
 * transaction, so if either fails the original queued item stays put
 * instead of being silently lost.
 */
export async function queueMoveToFailed(
  queueId: number,
  failure: Omit<FailedItem, 'id'>,
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_QUEUE, STORE_FAILED], 'readwrite');
    let settled = false;
    tx.oncomplete = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    tx.onerror = () => {
      if (!settled) {
        settled = true;
        reject(tx.error ?? new Error('queueMoveToFailed transaction failed'));
      }
    };
    tx.onabort = () => {
      if (!settled) {
        settled = true;
        reject(tx.error ?? new Error('queueMoveToFailed transaction aborted'));
      }
    };
    try {
      const failedStore = tx.objectStore(STORE_FAILED);
      const addReq = failedStore.add(failure);
      addReq.onsuccess = () => {
        const queueStore = tx.objectStore(STORE_QUEUE);
        queueStore.delete(queueId);
      };
      addReq.onerror = () => {
        try { tx.abort(); } catch { /* ignore */ }
      };
    } catch (err) {
      try { tx.abort(); } catch { /* ignore */ }
      if (!settled) {
        settled = true;
        reject(err as Error);
      }
    }
  });
}

export async function failedAll(): Promise<FailedItem[]> {
  try {
    return await withStore<FailedItem[]>(STORE_FAILED, 'readonly', (s) =>
      s.getAll() as IDBRequest<FailedItem[]>,
    );
  } catch {
    return [];
  }
}

export async function failedDelete(id: number): Promise<void> {
  try {
    await withStore(STORE_FAILED, 'readwrite', (s) => s.delete(id));
  } catch {
    // ignore
  }
}

export async function failedClearAll(): Promise<void> {
  try {
    await withStore(STORE_FAILED, 'readwrite', (s) => s.clear());
  } catch {
    // ignore
  }
}

export async function failedCount(): Promise<number> {
  try {
    return await withStore<number>(STORE_FAILED, 'readonly', (s) =>
      s.count() as IDBRequest<number>,
    );
  } catch {
    return 0;
  }
}
