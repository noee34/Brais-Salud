// La traducción app ⇄ Supabase no pierde ni cambia ningún dato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../js/remote-supabase.js';

const now = 1761836400000;
const med = { id: 'm', name: 'Paracetamol', strength: '1 g', form: 'comprimido', dose: 1, unit: 'comprimidos', frequency: 'h8', times: ['08:00'], scheduleMode: 'desde_ultima', startDate: '2026-10-30', endDate: '2026-11-15', notes: 'x', status: 'pausado', statusAt: now, archived: true, reminder: null, stockEnabled: true, stockInitial: 30, stockSince: now, minReserve: 5, thresholds: [10, 5, 2], alertDays: 3, needsRx: true, rxStatus: 'solicitada', rxStatusAt: now, lastRestockDate: '2026-10-01', leaflet: { uso: 'Dolor y fiebre', efectos: 'Raros' }, createdAt: now, updatedAt: now };
const cases = {
  meds: med,
  intakes: { id: 'i', medId: 'm', medName: 'Paracetamol 1 g', at: now, scheduledAt: now - 60000, quantity: 1.5, unit: 'comprimidos', status: 'omitida', notes: 'n', createdAt: now, updatedAt: now },
  restocks: { id: 'r', medId: 'm', medName: 'Paracetamol 1 g', at: now, quantity: 20, totalAfter: 49, notes: '', createdAt: now, updatedAt: now },
  alerts: { id: 'm:1:u5', medId: 'm', kind: 'u5', message: 'Te quedan 5', level: 'rojo', silent: true, attended: true, at: now, createdAt: now, updatedAt: now },
};
for (const [type, rec] of Object.entries(cases)) {
  test(`ida y vuelta: ${type}`, () => {
    const row = JSON.parse(JSON.stringify(MAP[type].to(rec))); // como viaja por la red
    assert.deepEqual(MAP[type].from(row), rec);
  });
}
