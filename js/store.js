// Capa de datos. La app solo habla con `store`; debajo hay un adaptador:
//  · con cuenta: SyncedAdapter (IndexedDB en el iPhone + bandeja de envío a Supabase)
//  · sin cuenta (modo local de pruebas): IndexedDB → localStorage → memoria
// Todos los registros llevan id (UUID), createdAt y updatedAt en milisegundos.

const DB_NAME = 'medicina';
const DB_VERSION = 1;
/** Tipos de datos que se guardan y sincronizan. */
export const TYPES = ['meds', 'intakes', 'restocks', 'alerts'];

export const DEFAULT_SETTINGS = {
  displayName: '',
  toleranceMin: 30,          // margen antes de considerar una toma "retrasada"
  defaultReminder: 0,        // aviso de toma por defecto para medicamentos nuevos
  notifyDoses: true,         // avisos de toma con la app abierta
  notifyStock: true,         // avisos de pocas existencias
  defaultThresholds: [10, 5, 2],
  defaultMinReserve: 5,
  defaultAlertDays: 3,
};

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export class IDBAdapter {
  constructor(name = DB_NAME) { this.name = name; }
  async open() {
    this.db = await new Promise((resolve, reject) => {
      const r = indexedDB.open(this.name, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        for (const t of TYPES) if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('blocked'));
    });
  }
  tx(name, mode = 'readonly') { return this.db.transaction(name, mode).objectStore(name); }
  done(store) {
    return new Promise((resolve, reject) => {
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
      store.transaction.onabort = () => reject(store.transaction.error || new Error('abort'));
    });
  }
  getAll(type) { return req(this.tx(type).getAll()); }
  async put(type, rec) { const s = this.tx(type, 'readwrite'); s.put(rec); await this.done(s); }
  async putMany(type, recs) { const s = this.tx(type, 'readwrite'); recs.forEach((r) => s.put(r)); await this.done(s); }
  async delete(type, id) { const s = this.tx(type, 'readwrite'); s.delete(id); await this.done(s); }
  async clear(type) { const s = this.tx(type, 'readwrite'); s.clear(); await this.done(s); }
  getMeta(key) { return req(this.tx('meta').get(key)); }
  async setMeta(key, value) { const s = this.tx('meta', 'readwrite'); s.put(value, key); await this.done(s); }
}

class LocalStorageAdapter {
  key(t) { return `medicina:${t}`; }
  read(t) { try { return JSON.parse(localStorage.getItem(this.key(t)) || '{}'); } catch { return {}; } }
  write(t, obj) { localStorage.setItem(this.key(t), JSON.stringify(obj)); }
  async open() { localStorage.setItem('medicina:probe', '1'); localStorage.removeItem('medicina:probe'); }
  async getAll(t) { return Object.values(this.read(t)); }
  async put(t, rec) { const o = this.read(t); o[rec.id] = rec; this.write(t, o); }
  async putMany(t, recs) { const o = this.read(t); recs.forEach((r) => { o[r.id] = r; }); this.write(t, o); }
  async delete(t, id) { const o = this.read(t); delete o[id]; this.write(t, o); }
  async clear(t) { this.write(t, {}); }
  async getMeta(k) { return this.read('meta')[k]; }
  async setMeta(k, v) { const o = this.read('meta'); o[k] = v; this.write('meta', o); }
}

/** Memoria volátil: último recurso para que la app no se rompa (se avisa al usuario). */
export class MemoryAdapter extends LocalStorageAdapter {
  constructor() { super(); this.mem = {}; }
  read(t) { return this.mem[t] || {}; }
  write(t, o) { this.mem[t] = o; }
  async open() {}
}

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

class Store {
  constructor() {
    this.data = Object.fromEntries(TYPES.map((t) => [t, []]));
    this.settings = { ...DEFAULT_SETTINGS };
    this.listeners = new Set();
    this.backend = 'none';
  }

  /** `options.adapter` permite inyectar el adaptador con sincronización tras iniciar sesión. */
  async init(options = {}) {
    if (options.adapter) {
      await options.adapter.open();
      this.adapter = options.adapter;
      this.backend = options.backend;
      return this.load();
    }
    const candidates = [['indexeddb', () => new IDBAdapter()], ['localstorage', () => new LocalStorageAdapter()], ['memory', () => new MemoryAdapter()]];
    for (const [name, make] of candidates) {
      try {
        if (name === 'indexeddb' && !('indexedDB' in globalThis)) continue;
        const a = make();
        await a.open();
        this.adapter = a;
        this.backend = name;
        break;
      } catch (e) { console.warn('Almacenamiento no disponible:', name, e); }
    }
    await this.load();
  }

  async load() {
    for (const t of TYPES) this.data[t] = await this.adapter.getAll(t);
    const saved = await this.adapter.getMeta('settings');
    this.settings = { ...DEFAULT_SETTINGS, ...(saved || {}) };
    if (this.adapter.subscribe) {
      this.adapter.subscribe({
        onRecords: () => { for (const t of TYPES) this.data[t] = this.adapter.cache[t].slice(); this.emit(); },
        onSettings: (v) => { this.settings = { ...DEFAULT_SETTINGS, ...(v || {}) }; this.emit(); },
        onStatus: () => this.emit(),
      });
    }
    // Pide al navegador que no borre los datos por falta de espacio.
    try { this.persisted = await navigator.storage?.persist?.(); } catch { this.persisted = false; }
  }

  /** Estado de la sincronización ({ online, pending, syncing, lastSync, error }) o null. */
  get sync() { return this.adapter?.state ?? null; }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((fn) => fn()); }

  all(type) { return this.data[type]; }
  get(type, id) { return this.data[type].find((r) => r.id === id); }

  /** Crea o actualiza (si trae un id que ya existe). Nunca duplica. */
  async save(type, fields) {
    const now = Date.now();
    const existing = fields.id && this.get(type, fields.id);
    const rec = existing
      ? { ...existing, ...fields, updatedAt: now }
      : { ...fields, id: fields.id || uuid(), createdAt: fields.createdAt || now, updatedAt: now };
    await this.adapter.put(type, rec);
    const list = this.data[type];
    const i = list.findIndex((r) => r.id === rec.id);
    if (i >= 0) list[i] = rec; else list.push(rec);
    this.emit();
    return rec;
  }

  /** Guarda varios de una vez (copias de seguridad, avisos). */
  async saveMany(type, recs) {
    if (!recs.length) return;
    await this.adapter.putMany(type, recs);
    for (const rec of recs) {
      const list = this.data[type];
      const i = list.findIndex((r) => r.id === rec.id);
      if (i >= 0) list[i] = rec; else list.push(rec);
    }
    this.emit();
  }

  async remove(type, id) {
    await this.adapter.delete(type, id);
    this.data[type] = this.data[type].filter((r) => r.id !== id);
    this.emit();
  }

  async updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    await this.adapter.setMeta('settings', this.settings);
    this.emit();
  }
}

export const store = new Store();
