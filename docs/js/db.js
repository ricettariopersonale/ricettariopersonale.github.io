// Archivio locale (IndexedDB): le ricette restano sul telefono e funzionano offline.
const DB_NAME = 'ricettario';
let dbp;

function open() {
  dbp ||= new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('recipes', { keyPath: 'id' });
      db.createObjectStore('kv');
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => res(out instanceof IDBRequest ? out.result : undefined);
    t.onerror = () => rej(t.error);
  });
}

export const db = {
  all: () => tx('recipes', 'readonly', (s) => s.getAll()),
  get: (id) => tx('recipes', 'readonly', (s) => s.get(id)),
  put: (r) => tx('recipes', 'readwrite', (s) => s.put(r)),
  del: (id) => tx('recipes', 'readwrite', (s) => s.delete(id)),
  getKV: (k) => tx('kv', 'readonly', (s) => s.get(k)),
  setKV: (k, v) => tx('kv', 'readwrite', (s) => s.put(v, k)),
};
