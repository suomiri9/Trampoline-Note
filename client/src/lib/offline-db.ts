const DB_NAME = 'tn-offline';
const DB_VERSION = 1;
const STORE_CACHE = 'cache';
const STORE_QUEUE = 'queue';

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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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
  } catch {
    // ignore
  }
}

export type QueueKind = 'note' | 'score';

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
