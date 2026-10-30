// Sincronización "primero en el dispositivo, después en la nube".
//
// Cada cambio se guarda al instante en el almacenamiento local (IndexedDB) y se
// apunta en una bandeja de salida (outbox) que también se guarda en local. La
// bandeja se envía a la nube en orden; si no hay conexión, espera y se reintenta
// sola. Nada de lo que se introduce se pierde aunque se cierre la app sin red.
//
// Al traer datos de la nube (pull) se reaplican encima los cambios aún no
// enviados, para que nunca desaparezca de la pantalla algo recién registrado.

import { TYPES } from './store.js';
import { TABLE } from './remote-supabase.js';
const RETRY_MS = 15000;

export class SyncedAdapter {
  /**
   * @param local  adaptador local (IDBAdapter) exclusivo de esta cuenta
   * @param remote objeto con fetchAll / upsert / remove / clear / getSettings / setSettings / onChange
   */
  constructor(local, remote) {
    this.local = local;
    this.remote = remote;
    this.outbox = [];
    this.cache = Object.fromEntries(TYPES.map((t) => [t, []]));
    this.state = { online: globalThis.navigator?.onLine ?? true, pending: 0, syncing: false, lastSync: null, error: null };
    this.handlers = {};
  }

  async open() {
    await this.local.open();
    this.outbox = (await this.local.getMeta('outbox')) || [];
    for (const t of TYPES) this.cache[t] = await this.local.getAll(t);
    this.state.pending = this.outbox.length;
  }

  async getAll(t) { return this.cache[t].slice(); }
  getMeta(k) { return this.local.getMeta(k); }

  async put(type, rec) {
    await this.local.put(type, rec);
    upsertInto(this.cache[type], rec);
    await this.enqueue({ op: 'put', type, rec });
  }

  async putMany(type, recs) {
    await this.local.putMany(type, recs);
    recs.forEach((r) => upsertInto(this.cache[type], r));
    await this.enqueue({ op: 'putMany', type, recs });
  }

  async delete(type, id) {
    await this.local.delete(type, id);
    this.cache[type] = this.cache[type].filter((r) => r.id !== id);
    await this.enqueue({ op: 'del', type, id });
  }

  async clear(type) {
    await this.local.clear(type);
    this.cache[type] = [];
    await this.enqueue({ op: 'clear', type });
  }

  async setMeta(k, v) {
    await this.local.setMeta(k, v);
    if (k === 'settings') await this.enqueue({ op: 'settings', value: v });
  }

  /* ---------- Bandeja de salida ---------- */

  async enqueue(op) {
    this.outbox.push(op);
    await this.local.setMeta('outbox', this.outbox);
    this.status({ pending: this.outbox.length });
    this.flush();
  }

  /** Envía la bandeja en orden. Devuelve true si quedó vacía. */
  async flush() {
    if (this.flushing) { this.flushAgain = true; return this.flushing; }
    this.flushing = (async () => {
      clearTimeout(this.retryTimer);
      this.status({ syncing: true });
      try {
        while (this.outbox.length) {
          await this.apply(this.outbox[0]);
          this.outbox.shift();
          await this.local.setMeta('outbox', this.outbox);
          this.status({ pending: this.outbox.length });
        }
        this.status({ error: null, online: true, lastSync: Date.now() });
        return true;
      } catch (e) {
        this.status({ error: describe(e), online: globalThis.navigator?.onLine ?? false });
        this.retryTimer = setTimeout(() => this.flush(), RETRY_MS);
        return false;
      } finally {
        this.status({ syncing: false });
      }
    })();
    const done = await this.flushing;
    this.flushing = null;
    if (this.flushAgain) { this.flushAgain = false; return this.flush(); }
    return done;
  }

  async apply(op) {
    switch (op.op) {
      case 'put': return this.remote.upsert(op.type, [op.rec]);
      case 'putMany': return this.remote.upsert(op.type, op.recs);
      case 'del': return this.remote.remove(op.type, op.id);
      case 'clear': return this.remote.clear(op.type);
      case 'settings': return this.remote.setSettings(op.value);
      default: return undefined;
    }
  }

  /* ---------- Traer de la nube ---------- */

  /** Trae de la nube los tipos indicados (por defecto, todos). */
  async pull(types = TYPES) {
    if (this.pulling) { this.pullAgain = [...new Set([...(this.pullAgain || []), ...types])]; return this.pulling; }
    this.pulling = (async () => {
      try {
        await this.flush();
        const fresh = {};
        for (const t of TYPES) fresh[t] = types.includes(t) ? await this.remote.fetchAll(t) : this.cache[t].slice();
        const remoteSettings = await this.remote.getSettings();
        // Lo que aún no se ha enviado manda sobre lo que hay en la nube.
        let localSettings = await this.local.getMeta('settings');
        for (const op of this.outbox) {
          if (op.op === 'put') upsertInto(fresh[op.type], op.rec);
          else if (op.op === 'putMany') op.recs.forEach((r) => upsertInto(fresh[op.type], r));
          else if (op.op === 'del') fresh[op.type] = fresh[op.type].filter((r) => r.id !== op.id);
          else if (op.op === 'clear') fresh[op.type] = [];
        }
        const pendingSettings = this.outbox.some((o) => o.op === 'settings');
        for (const t of types) {
          await this.local.clear(t);
          await this.local.putMany(t, fresh[t]);
          this.cache[t] = fresh[t];
        }
        if (remoteSettings && !pendingSettings) {
          localSettings = remoteSettings;
          await this.local.setMeta('settings', remoteSettings);
          this.handlers.onSettings?.(remoteSettings);
        } else if (!remoteSettings && localSettings && !pendingSettings) {
          await this.enqueue({ op: 'settings', value: localSettings }); // primera vez: sube los ajustes
        }
        this.status({ error: null, online: true, lastSync: Date.now() });
        this.handlers.onRecords?.();
      } catch (e) {
        this.status({ error: describe(e), online: globalThis.navigator?.onLine ?? false });
      } finally {
        this.pulling = null;
        if (this.pullAgain) { const again = this.pullAgain; this.pullAgain = null; this.pull(again); }
      }
    })();
    return this.pulling;
  }

  /** Reintenta ya (botón "Reintentar" de Perfil). */
  retry() { return this.pull(); }

  /** Lo llama el store: conecta cambios en vivo, reconexión y reintentos. */
  subscribe(handlers) {
    this.handlers = handlers;
    // Si la nube dice qué tabla cambió, solo se trae esa.
    const BY_TABLE = Object.fromEntries(Object.entries(TABLE).map(([type, table]) => [table, type]));
    let t;
    let pending = new Set();
    const soon = (change) => {
      const type = BY_TABLE[change?.table];
      if (type) pending.add(type); else TYPES.forEach((x) => pending.add(x));
      clearTimeout(t);
      t = setTimeout(() => { const types = [...pending]; pending = new Set(); this.pull(types); }, 600);
    };
    this.unwatch = this.remote.onChange?.(soon);
    if (globalThis.addEventListener) {
      addEventListener('online', () => { this.status({ online: true }); this.pull(); });
      addEventListener('offline', () => this.status({ online: false }));
      globalThis.document?.addEventListener('visibilitychange', () => { if (!document.hidden) soon(); });
    }
    this.pull();
  }

  status(patch) {
    Object.assign(this.state, patch);
    this.handlers.onStatus?.();
  }
}

function upsertInto(list, rec) {
  const i = list.findIndex((r) => r.id === rec.id);
  if (i >= 0) list[i] = rec; else list.push(rec);
}

function describe(e) {
  return e?.message || String(e);
}
