// Pruebas de la lógica de MEDICINA (pautas, próximas tomas, existencias y avisos).
// Se ejecutan en varias zonas horarias con `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineLocal, dayKey, addDays } from '../js/dates.js';
import { intervalTimes, scheduleTimes, dailyConsumption, slotStatuses, nextDose, slotForIntake, plannedSlots, countdownText } from '../js/schedule.js';
import { stockInfo, pendingAlerts, daysLeftText } from '../js/stock.js';
import { qty, validateMed } from '../js/meds.js';

const D = '2026-10-29';
const at = (day, hm) => combineLocal(day, hm);
let n = 0;
const intake = (medId, when, extra = {}) => ({ id: `i${++n}`, medId, medName: 'X', at: when, scheduledAt: null, quantity: 1, unit: 'comprimidos', status: 'realizada', createdAt: when, updatedAt: when, ...extra });
const med = (extra = {}) => ({
  id: 'm1', name: 'Ibuprofeno', dose: 1, unit: 'comprimidos', frequency: 'h8', times: ['08:00'], scheduleMode: 'fijo',
  startDate: D, endDate: '', status: 'activo', statusAt: 0, archived: false, createdAt: at(D, '00:00'),
  stockEnabled: true, stockInitial: 30, stockSince: at(D, '00:00'), minReserve: 5, thresholds: [10, 5, 2], alertDays: 3,
  needsRx: false, rxStatus: 'sin_receta', ...extra,
});

test('cada 8 horas desde las 08:00 → 00:00, 08:00, 16:00', () => {
  assert.deepEqual(intervalTimes('08:00', 8), ['00:00', '08:00', '16:00']);
  assert.deepEqual(scheduleTimes(med({ frequency: 'h6', times: ['07:30'] })), ['01:30', '07:30', '13:30', '19:30']);
  assert.deepEqual(scheduleTimes(med({ frequency: 'd2', times: ['21:00', '09:00'] })), ['09:00', '21:00']);
  assert.deepEqual(scheduleTimes(med({ frequency: 'demanda' })), []);
});

test('consumo diario: 3 comprimidos al día con 12 → 4 días (ejemplo de la especificación)', () => {
  const m = med({ frequency: 'd3', times: ['08:00', '14:00', '20:00'], stockInitial: 12 });
  assert.equal(dailyConsumption(m), 3);
  const info = stockInfo(m, [], []);
  assert.equal(info.stock, 12);
  assert.equal(info.daysLeft, 4);
  assert.equal(dailyConsumption(med({ frequency: 'demanda' })), null);
  assert.equal(daysLeftText(stockInfo(med({ frequency: 'demanda' }), [], [])), 'Estimación no disponible');
});

test('existencias: 30 − 2 tomas realizadas = 28; las omitidas no descuentan', () => {
  const m = med();
  const list = [intake('m1', at(D, '08:00')), intake('m1', at(D, '16:00')), intake('m1', at(D, '23:59'), { status: 'omitida' })];
  assert.equal(stockInfo(m, list, []).stock, 28);
});

test('corregir o borrar una toma recalcula sin duplicar descuentos', () => {
  const m = med();
  const t1 = intake('m1', at(D, '08:00'));
  let list = [t1, intake('m1', at(D, '16:00'))];
  assert.equal(stockInfo(m, list, []).stock, 28);
  list = [{ ...t1, quantity: 2 }, list[1]]; // corregida: eran 2 comprimidos
  assert.equal(stockInfo(m, list, []).stock, 27);
  list = [list[1]]; // borrada
  assert.equal(stockInfo(m, list, []).stock, 29);
  list = [{ ...list[0], status: 'omitida' }]; // cambiada a omitida
  assert.equal(stockInfo(m, list, []).stock, 30);
});

test('reposiciones suman y abren un nuevo periodo de avisos', () => {
  const m = med({ stockInitial: 4 });
  const r = { id: 'r1', medId: 'm1', at: at(D, '00:00'), createdAt: at(D, '12:00'), quantity: 20 };
  const before = stockInfo(m, [], []);
  const after = stockInfo(m, [], [r]);
  assert.equal(after.stock, 24);
  assert.notEqual(before.cycle, after.cycle);
});

test('un recuento posterior ignora tomas anteriores (ya estaban contadas)', () => {
  const m = med({ stockInitial: 10, stockSince: at(D, '12:00') });
  assert.equal(stockInfo(m, [intake('m1', at(D, '08:00'))], []).stock, 10);
  assert.equal(stockInfo(m, [intake('m1', at(D, '16:00'))], []).stock, 9);
});

test('niveles verde / naranja / rojo', () => {
  assert.equal(stockInfo(med({ stockInitial: 30 }), [], []).level, 'verde');
  assert.equal(stockInfo(med({ stockInitial: 9 }), [], []).level, 'naranja');
  assert.equal(stockInfo(med({ stockInitial: 2 }), [], []).level, 'rojo');
  assert.equal(stockInfo(med({ stockInitial: 0 }), [], []).level, 'rojo');
});

test('avisos: solo el más importante suena y no se repiten', () => {
  const m = med({ stockInitial: 5 });
  const info = stockInfo(m, [], []);
  const first = pendingAlerts(m, info, new Set());
  assert.ok(first.length >= 2);
  assert.equal(first.filter((a) => !a.silent).length, 1);
  assert.equal(first[0].kind, 'u5');
  assert.match(first[0].message, /Te quedan 5 comprimidos de Ibuprofeno\. Recuerda gestionar la reposición\./);
  const again = pendingAlerts(m, info, new Set(first.map((a) => a.id)));
  assert.equal(again.length, 0);
  // Una toma más: baja a 4, ningún umbral nuevo (el siguiente es 2) → nada
  const info2 = stockInfo(m, [intake('m1', at(D, '08:00'))], []);
  assert.equal(pendingAlerts(m, info2, new Set(first.map((a) => a.id))).length, 0);
});

test('aviso con receta usa el texto de días restantes', () => {
  const m = med({ frequency: 'd3', times: ['08:00', '14:00', '20:00'], stockInitial: 6, thresholds: [], minReserve: 0, alertDays: 3, needsRx: true, rxStatus: 'pendiente_solicitar' });
  const a = pendingAlerts(m, stockInfo(m, [], []), new Set());
  assert.equal(a.length, 1);
  assert.equal(a[0].kind, 'dias');
  assert.match(a[0].message, /aproximadamente 2 días\. Recuerda solicitar una nueva receta/);
});

test('próxima toma: última a las 08:00 cada 8 h → 16:00 (ejemplo de la especificación)', () => {
  const m = med();
  const list = [intake('m1', at(D, '08:00'))];
  const nd = nextDose(m, list, { now: at(D, '10:00') });
  assert.equal(nd.at, at(D, '16:00'));
  assert.equal(nd.late, false);
});

test('toma olvidada: se muestra retrasada, pero no se acumula con la siguiente', () => {
  const m = med();
  const list = [intake('m1', at(D, '08:00'))];
  let nd = nextDose(m, list, { now: at(D, '16:45') });
  assert.equal(nd.at, at(D, '16:00'));
  assert.equal(nd.late, true);
  nd = nextDose(m, list, { now: at(addDays(D, 1), '00:10') });
  assert.equal(nd.at, at(addDays(D, 1), '00:00')); // la de las 16:00 ya no se propone
});

test('omitir una toma pasa a la siguiente', () => {
  const m = med();
  const list = [intake('m1', at(D, '16:00'), { status: 'omitida', scheduledAt: at(D, '16:00') })];
  const nd = nextDose(m, list, { now: at(D, '16:05') });
  assert.equal(nd.at, at(addDays(D, 1), '00:00'));
});

test('contar desde la última toma: un retraso desplaza la siguiente', () => {
  const m = med({ scheduleMode: 'desde_ultima' });
  const list = [intake('m1', at(D, '09:30'))]; // la de las 08:00 se tomó a las 09:30
  const nd = nextDose(m, list, { now: at(D, '10:00') });
  assert.equal(nd.at, at(D, '17:30'));
  // con horario fijo seguiría a las 16:00
  assert.equal(nextDose(med(), list, { now: at(D, '10:00') }).at, at(D, '16:00'));
});

test('estados del día y asociación de tomas sueltas', () => {
  const m = med();
  const list = [intake('m1', at(D, '08:40')), intake('m1', at(D, '16:00'), { status: 'omitida', scheduledAt: at(D, '16:00') })];
  const day = slotStatuses(m, list, at(D, '00:00'), at(addDays(D, 1), '00:00'), { now: at(D, '23:00') });
  assert.deepEqual(day.map((s) => s.status), ['retrasada', 'realizada', 'omitida']);
  assert.equal(day[1].late, true); // 40 min tarde > 30 de margen
  assert.equal(slotForIntake(m, list, at(D, '23:50'), { now: at(D, '23:50') }), at(addDays(D, 1), '00:00'));
});

test('tratamiento pausado o finalizado no genera tomas futuras', () => {
  const m = med({ status: 'pausado', statusAt: at(D, '12:00') });
  assert.equal(nextDose(m, [], { now: at(D, '13:00') }), null);
  const slots = plannedSlots(m, [], at(D, '00:00'), at(addDays(D, 2), '00:00'));
  assert.deepEqual(slots.map((s) => dayKey(s.at) + ' ' + new Date(s.at).getHours()), [`${D} 0`, `${D} 8`]);
});

test('fecha de finalización limita las tomas', () => {
  const m = med({ endDate: D });
  const slots = plannedSlots(m, [], at(D, '00:00'), at(addDays(D, 3), '00:00'));
  assert.equal(slots.length, 3); // 00:00, 08:00 y 16:00 del último día; nada después
});

test('textos', () => {
  assert.equal(qty(1, 'comprimidos'), '1 comprimido');
  assert.equal(qty(2.5, 'ml'), '2,5 ml');
  assert.equal(countdownText(at(D, '16:30'), at(D, '15:45')), 'Faltan 45 min');
  assert.equal(validateMed({ name: '', dose: 1 }), 'Escribe el nombre del medicamento.');
  assert.equal(validateMed({ name: 'A', dose: 1, unit: 'ml', startDate: D, endDate: '2026-01-01', frequency: 'd1', times: ['09:00'] }), 'La fecha de finalización no puede ser anterior a la de inicio.');
});

test('cambio de hora (Madrid, 25 oct 2026): las horas fijas siguen siendo locales', () => {
  const m = med({ startDate: '2026-10-24', createdAt: combineLocal('2026-10-24', '00:00'), stockSince: 0 });
  const slots = plannedSlots(m, [], combineLocal('2026-10-25', '00:00'), combineLocal('2026-10-26', '00:00'));
  assert.deepEqual(slots.map((s) => new Date(s.at).getHours()), [0, 8, 16]);
});
