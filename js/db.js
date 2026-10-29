// Base de datos local (IndexedDB). Todo se guarda solo en este dispositivo.

const DB_NAME = 'mi-mejor-version';
const DB_VERSION = 1;
export const STORES = ['goals', 'tasks', 'blocks', 'habits', 'chat', 'expenses', 'fixedExpenses', 'savingsGoals', 'contributions', 'kv'];

let dbPromise;
function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then(r => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const req2p = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const db = {
  all: store => tx(store, 'readonly', s => req2p(s.getAll())),
  get: (store, id) => tx(store, 'readonly', s => req2p(s.get(id))),
  put: (store, obj) => tx(store, 'readwrite', s => { s.put(obj); return obj; }),
  putMany: (store, arr) => tx(store, 'readwrite', s => { arr.forEach(o => s.put(o)); return arr; }),
  del: (store, id) => tx(store, 'readwrite', s => { s.delete(id); }),
  delMany: (store, ids) => tx(store, 'readwrite', s => { ids.forEach(id => s.delete(id)); }),
  clear: store => tx(store, 'readwrite', s => { s.clear(); }),
};

// Almacén clave-valor para perfil, ajustes, disponibilidad, etc.
export async function kvGet(key, def = null) {
  const r = await db.get('kv', key);
  return r ? r.value : def;
}
export const kvSet = (key, value) => db.put('kv', { id: key, value });

export async function exportAll() {
  const out = { app: 'mi-mejor-version', version: DB_VERSION, exportado: new Date().toISOString(), datos: {} };
  for (const s of STORES) out.datos[s] = await db.all(s);
  // La API key no sale del dispositivo en las copias.
  out.datos.kv = out.datos.kv.map(r => r.id === 'settings' ? { ...r, value: { ...r.value, apiKey: '' } } : r);
  return out;
}

export async function importAll(json) {
  if (json?.app !== 'mi-mejor-version' || !json.datos) throw new Error('El archivo no es una copia de Mi Mejor Versión.');
  const apiKey = (await kvGet('settings', {}))?.apiKey || '';
  for (const s of STORES) {
    await db.clear(s);
    if (Array.isArray(json.datos[s])) await db.putMany(s, json.datos[s]);
  }
  const settings = await kvGet('settings', {});
  if (!settings.apiKey && apiKey) await kvSet('settings', { ...settings, apiKey });
}

export async function pedirPersistencia() {
  try { if (navigator.storage?.persist) return await navigator.storage.persist(); } catch { /* sin soporte */ }
  return false;
}
