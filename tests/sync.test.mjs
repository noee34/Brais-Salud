// "Primero en el dispositivo, después en la nube": SyncedAdapter con una nube
// simulada que se puede desconectar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SyncedAdapter } from '../js/sync.js';
import { MemoryAdapter } from '../js/store.js';

function fakeCloud() {
  const tables = { meds: new Map(), intakes: new Map(), restocks: new Map(), alerts: new Map() };
  let settings = null;
  const cloud = {
    online: true,
    calls: 0,
    tables,
    get settings() { return settings; },
    guard() { cloud.calls++; if (!cloud.online) throw new Error('Failed to fetch'); },
    async fetchAll(t) { cloud.guard(); return [...tables[t].values()].map((r) => ({ ...r })); },
    async upsert(t, recs) { cloud.guard(); recs.forEach((r) => tables[t].set(r.id, { ...r })); },
    async remove(t, id) { cloud.guard(); tables[t].delete(id); },
    async clear(t) { cloud.guard(); tables[t].clear(); },
    async getSettings() { cloud.guard(); return settings; },
    async setSettings(v) { cloud.guard(); settings = v; },
  };
  return cloud;
}

const B = (id, taken = 100, at = 1000) => ({ id, at, prepared: 150, taken, notes: '', createdAt: 1, updatedAt: 1 });
const device = async (cloud) => { const a = new SyncedAdapter(new MemoryAdapter(), cloud); await a.open(); return a; };
const ids = async (a, t = 'intakes') => (await a.getAll(t)).map((r) => r.id).sort();

test('con conexión, cada registro llega a la nube', async () => {
  const cloud = fakeCloud();
  const a = await device(cloud);
  await a.put('intakes', B('1'));
  await a.flush();
  assert.ok(cloud.tables.intakes.has('1'));
  assert.equal(a.state.pending, 0);
  assert.equal(a.state.error, null);
});

test('sin conexión se guarda en el dispositivo y se sube al volver la red', async () => {
  const cloud = fakeCloud();
  cloud.online = false;
  const a = await device(cloud);
  await a.put('intakes', B('1'));
  await a.put('restocks', { id: 'p', at: 1, consistency: 'blanda', notes: '', createdAt: 1, updatedAt: 1 });
  await a.delete('intakes', '1');
  await a.put('intakes', B('2'));
  await a.flush();
  assert.equal(a.state.pending, 4, 'quedan en la bandeja');
  assert.ok(a.state.error);
  assert.deepEqual(await ids(a), ['2'], 'en pantalla se ve igualmente');
  clearTimeout(a.retryTimer);

  // la bandeja sobrevive a cerrar la app: un adaptador nuevo sobre el mismo almacén local
  const reopened = new SyncedAdapter(a.local, cloud);
  await reopened.open();
  assert.equal(reopened.state.pending, 4);

  cloud.online = true;
  assert.equal(await reopened.flush(), true);
  assert.deepEqual([...cloud.tables.intakes.keys()], ['2']);
  assert.ok(cloud.tables.restocks.has('p'));
  assert.equal(reopened.state.pending, 0);
});

test('lo hecho en otro dispositivo aparece, incluido lo borrado', async () => {
  const cloud = fakeCloud();
  const phone = await device(cloud), tablet = await device(cloud);
  await phone.put('intakes', B('a'));
  await phone.put('intakes', B('b'));
  await phone.flush();
  await tablet.pull();
  assert.deepEqual(await ids(tablet), ['a', 'b']);
  await phone.delete('intakes', 'a');
  await phone.put('intakes', { ...B('b'), taken: 140 });
  await phone.flush();
  await tablet.pull();
  assert.deepEqual(await ids(tablet), ['b']);
  assert.equal((await tablet.getAll('intakes'))[0].taken, 140);
});

test('traer de la nube no borra lo que aún no se ha subido', async () => {
  const cloud = fakeCloud();
  const other = await device(cloud);
  await other.put('intakes', B('remoto'));
  await other.flush();
  const a = await device(cloud);
  cloud.online = false;
  await a.put('intakes', B('local'));
  clearTimeout(a.retryTimer);
  // la red vuelve justo para el pull, pero el envío falla una vez
  cloud.online = true;
  const upsert = cloud.upsert;
  let fails = 1;
  cloud.upsert = async (...args) => { if (fails-- > 0) throw new Error('timeout'); return upsert(...args); };
  await a.pull();
  clearTimeout(a.retryTimer);
  assert.deepEqual(await ids(a), ['local', 'remoto'], 'se mantiene lo local pendiente');
  assert.equal(a.state.pending, 1);
  await a.flush();
  assert.deepEqual([...cloud.tables.intakes.keys()].sort(), ['local', 'remoto']);
});

test('ajustes: los locales suben la primera vez; después manda la nube', async () => {
  const cloud = fakeCloud();
  const a = await device(cloud);
  await a.local.setMeta('settings', { babyName: 'Nia' });
  await a.pull();
  await a.flush();
  assert.equal(cloud.settings.babyName, 'Nia');
  const b = await device(cloud);
  let got;
  b.handlers.onSettings = (v) => { got = v; };
  await b.pull();
  assert.equal(got.babyName, 'Nia');
  await b.setMeta('settings', { babyName: 'Nia CV' });
  await b.flush();
  await a.pull();
  assert.equal((await a.getMeta('settings')).babyName, 'Nia CV');
});

test('borrar todo y restaurar respetan el orden', async () => {
  const cloud = fakeCloud();
  const a = await device(cloud);
  await a.putMany('intakes', [B('1'), B('2'), B('3')]);
  await a.clear('intakes');
  await a.putMany('intakes', [B('4')]);
  await a.flush();
  assert.deepEqual([...cloud.tables.intakes.keys()], ['4']);
});
