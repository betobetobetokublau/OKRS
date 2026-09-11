/**
 * Minimal IndexedDB wrapper for the offline outbox. No deps on purpose: the
 * whole thing is ~80 lines and we only need a single object store.
 *
 * DB `kublau-offline`, store `outbox` (keyPath `id`, index `createdAt`).
 * Every function no-ops (resolving to empty values) when `indexedDB` is not
 * available — SSR, vitest node env, or very locked-down browsers — so callers
 * never have to guard for the environment themselves.
 */
import type { OutboxEntry } from './outbox';

const DB_NAME = 'kublau-offline';
const DB_VERSION = 1;
const STORE = 'outbox';
const INDEX_CREATED_AT = 'createdAt';

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex(INDEX_CREATED_AT, 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // If another tab upgrades the schema, drop our handle so the next call
      // re-opens instead of failing with a stale connection.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('indexedDB.open failed'));
    };
    req.onblocked = () => {
      dbPromise = null;
      reject(new Error('indexedDB.open blocked'));
    };
  });
  return dbPromise;
}

/** Wrap a single IDBRequest in a promise. */
function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(STORE, mode);
  const result = await requestToPromise(fn(tx.objectStore(STORE)));
  // Wait for the transaction to actually commit — `onsuccess` on the request
  // fires before durability is guaranteed.
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
  return result;
}

/** Add (or overwrite, keyed by `id`) an entry. `put` makes re-queues idempotent. */
export async function enqueue(entry: OutboxEntry): Promise<void> {
  if (!hasIndexedDb()) return;
  await withStore('readwrite', (s) => s.put(entry));
}

/** All entries ordered by `createdAt` ascending (oldest first). */
export async function list(): Promise<OutboxEntry[]> {
  if (!hasIndexedDb()) return [];
  const rows = await withStore('readonly', (s) =>
    s.index(INDEX_CREATED_AT).getAll() as IDBRequest<OutboxEntry[]>
  );
  return rows;
}

export async function remove(id: string): Promise<void> {
  if (!hasIndexedDb()) return;
  await withStore('readwrite', (s) => s.delete(id));
}

export async function count(): Promise<number> {
  if (!hasIndexedDb()) return 0;
  return withStore('readonly', (s) => s.count());
}

export async function clear(): Promise<void> {
  if (!hasIndexedDb()) return;
  await withStore('readwrite', (s) => s.clear());
}
