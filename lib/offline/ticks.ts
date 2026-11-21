/** LST-3: ticks live in IndexedDB first, then sync to PUT /api/plans/:id/ticks when online. Client only. */
export interface LocalTick {
  id: string; // `${planId}|${key}`
  planId: string;
  key: string;
  ticked: boolean;
  at: string;
  synced: boolean;
}

const DB = 'ms_offline';
const STORE = 'ticks';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: 'id' });
      s.createIndex('planId', 'planId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r ? (r.result as T) : undefined);
    t.onerror = () => reject(t.error);
  });
}

export async function saveTick(planId: string, key: string, ticked: boolean, at = new Date().toISOString()): Promise<LocalTick> {
  const v: LocalTick = { id: `${planId}|${key}`, planId, key, ticked, at, synced: false };
  await tx('readwrite', (s) => s.put(v));
  return v;
}

export async function localTicks(planId: string): Promise<LocalTick[]> {
  return (await tx<LocalTick[]>('readonly', (s) => s.index('planId').getAll(planId))) ?? [];
}

export async function markSynced(ticks: LocalTick[]) {
  await tx('readwrite', (s) => {
    for (const t of ticks) s.put({ ...t, synced: true });
  });
}

/** Push unsynced ticks; returns true if everything is synced. */
export async function syncTicks(planId: string): Promise<boolean> {
  const pending = (await localTicks(planId)).filter((t) => !t.synced);
  if (!pending.length) return true;
  try {
    const res = await fetch(`/api/plans/${planId}/ticks`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: pending.map((t) => ({ key: t.key, ticked: t.ticked, at: t.at })) }),
    });
    if (!res.ok) return false;
    await markSynced(pending);
    return true;
  } catch {
    return false;
  }
}

/** Merge server and local ticks: the newer timestamp wins. */
export function mergeTicks(server: Record<string, { ticked: boolean; at: string }>, local: LocalTick[]): Record<string, boolean> {
  const out: Record<string, { ticked: boolean; at: string }> = { ...server };
  for (const l of local) {
    const s = out[l.key];
    if (!s || l.at >= s.at) out[l.key] = { ticked: l.ticked, at: l.at };
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.ticked]));
}
