// Persistence: the whole data snapshot is written as ONE record, so stock and
// sales can never be saved out of step with each other.
//
// IndexedDB is used when available (room for years of sales); LocalStorage is
// the fallback (about 5 MB). Small per-device preferences (the POS draft, last
// cashier station) always live in LocalStorage.

const DB_NAME = 'herbal-pos';
const STORE = 'kv';
const DATA_KEY = 'data-v1';
const LS_DATA_KEY = 'herbal-pos:data-v1';

let backend = null; // 'indexeddb' | 'localstorage' | 'memory'
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) throw new Error('IndexedDB unavailable');
      const req = indexedDB.open(DB_NAME, 1);
      const timer = setTimeout(() => reject(new Error('IndexedDB timed out')), 4000);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => {
        clearTimeout(timer);
        resolve(req.result);
      };
      req.onerror = () => {
        clearTimeout(timer);
        reject(req.error || new Error('IndexedDB error'));
      };
      req.onblocked = () => {
        clearTimeout(timer);
        reject(new Error('IndexedDB blocked'));
      };
    } catch (e) {
      reject(e);
    }
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function idb(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      }),
  );
}

function lsWorks() {
  try {
    const k = '__pos_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function lsReadData() {
  try {
    const raw = localStorage.getItem(LS_DATA_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Loads the saved snapshot (or null for a first run) and picks the backend. */
export async function loadData() {
  try {
    const v = await idb('readonly', (st) => st.get(DATA_KEY));
    backend = 'indexeddb';
    if (v) return v;
    return lsReadData(); // one-time migration from an older LocalStorage copy
  } catch {
    // fall through
  }
  if (lsWorks()) {
    backend = 'localstorage';
    return lsReadData();
  }
  backend = 'memory';
  return null;
}

/** Writes the snapshot. Resolves true when it is safely stored. */
export async function saveData(data) {
  if (backend === 'indexeddb') {
    try {
      await idb('readwrite', (st) => st.put(data, DATA_KEY));
      return true;
    } catch {
      backend = lsWorks() ? 'localstorage' : 'memory';
    }
  }
  if (backend === 'localstorage') {
    try {
      localStorage.setItem(LS_DATA_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export const getBackend = () => backend;

export const BACKEND_LABEL = {
  indexeddb: 'This browser (IndexedDB)',
  localstorage: 'This browser (LocalStorage)',
  memory: 'Not saved — browser storage is blocked',
};

export async function storageInfo() {
  const info = { backend, usage: null, quota: null, persisted: null };
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      info.usage = e.usage ?? null;
      info.quota = e.quota ?? null;
    }
    if (navigator.storage?.persisted) info.persisted = await navigator.storage.persisted();
  } catch {
    // estimates are optional
  }
  return info;
}

export async function requestPersistence() {
  try {
    return navigator.storage?.persist ? await navigator.storage.persist() : false;
  } catch {
    return false;
  }
}

// ---- Small per-device values ------------------------------------------------
export function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota or privacy mode: drafts are a convenience, never critical
  }
}

export const DRAFT_KEY = 'herbal-pos:draft-v1';
export const PREFS_KEY = 'herbal-pos:prefs-v1';
