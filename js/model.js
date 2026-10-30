// Acciones de la app sobre los datos: registrar tomas, reposiciones, cambiar
// estados y generar avisos de existencias. Las pantallas llaman a estas
// funciones; aquí no se pinta nada salvo los avisos de confirmación.
import { store } from './store.js';
import { stockInfo, pendingAlerts } from './stock.js';
import { slotForIntake, nextDose, upcomingDoses } from './schedule.js';
import { medTitle, qty } from './meds.js';
import { toast, confirmDialog } from './ui.js';
import { dayKey } from './dates.js';
import { notifySystem } from './notify.js';

export const meds = () => store.all('meds');
export const intakes = () => store.all('intakes');
export const restocks = () => store.all('restocks');
export const alerts = () => store.all('alerts');
export const getMed = (id) => store.get('meds', id);
const tolerance = () => Number(store.settings.toleranceMin) || 30;

const STATUS_ORDER = { activo: 0, pausado: 1, finalizado: 2 };
/** Medicamentos de la lista (sin los quitados), activos primero. */
export function listedMeds() {
  return meds().filter((m) => !m.archived)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name, 'es'));
}
export const activeMeds = () => meds().filter((m) => !m.archived && m.status === 'activo');

export const infoFor = (med) => stockInfo(med, intakes(), restocks());
export const nextFor = (med, now = Date.now()) => nextDose(med, intakes(), { now, toleranceMin: tolerance() });
export const upcoming = (now = Date.now()) => upcomingDoses(activeMeds(), intakes(), { now, toleranceMin: tolerance() });

/** Medicamentos que necesitan atención (pocas existencias o receta en marcha). */
export function needingAttention() {
  return listedMeds().filter((m) => m.status !== 'finalizado').map((m) => ({ med: m, info: infoFor(m) }))
    .filter(({ med, info }) => (info && info.level !== 'verde') || ['pendiente_solicitar', 'solicitada', 'disponible', 'pendiente_compra'].includes(med.rxStatus))
    .sort((a, b) => (b.info ? { rojo: 2, naranja: 1, verde: 0 }[b.info.level] : 0) - (a.info ? { rojo: 2, naranja: 1, verde: 0 }[a.info.level] : 0));
}

/**
 * Registra una toma. Por defecto: ahora, la cantidad de la pauta, "realizada".
 * Avisa si parece repetida (otra toma del mismo medicamento hace menos de 2 min).
 */
export async function registerIntake(med, { at = Date.now(), quantity = med.dose, status = 'realizada', notes = '', scheduledAt, silent = false } = {}) {
  if (status === 'realizada') {
    const dup = intakes().find((i) => i.medId === med.id && i.status === 'realizada' && Math.abs(i.at - at) < 2 * 60000);
    if (dup) {
      const ok = await confirmDialog({
        title: '¿Registrar otra toma?',
        message: `Ya hay una toma de ${medTitle(med)} registrada a las ${new Date(dup.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}. Registra otra solo si realmente la has tomado.`,
        confirmLabel: 'Sí, registrar otra', danger: false,
      });
      if (!ok) return null;
    }
  }
  const slot = scheduledAt !== undefined ? scheduledAt : slotForIntake(med, intakes(), at, { now: Date.now() });
  const rec = await store.save('intakes', {
    medId: med.id, medName: medTitle(med), at, scheduledAt: slot ?? null,
    quantity: Number(quantity), unit: med.unit, status, notes: notes.trim(),
  });
  if (!silent) toast(status === 'realizada' ? 'Toma registrada correctamente' : 'Toma marcada como omitida');
  await checkStockAlerts();
  return rec;
}

/** Corrige una toma existente (mismo id: no se duplica y las existencias se recalculan). */
export async function updateIntake(rec, patch) {
  const med = getMed(rec.medId);
  const next = { ...rec, ...patch };
  if (med && patch.at != null && patch.at !== rec.at && rec.scheduledAt != null && Math.abs(patch.at - rec.scheduledAt) > 4 * 3600000) {
    next.scheduledAt = slotForIntake(med, intakes(), patch.at, { ignoreId: rec.id, now: Date.now() });
  }
  const saved = await store.save('intakes', next);
  toast('Toma corregida');
  await checkStockAlerts();
  return saved;
}

export async function deleteIntake(rec) {
  const ok = await confirmDialog({
    title: 'Eliminar este registro',
    message: `Se eliminará la toma de ${rec.medName} del ${new Date(rec.at).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}. Las existencias se recalcularán.`,
  });
  if (!ok) return false;
  await store.remove('intakes', rec.id);
  toast('Registro eliminado');
  return true;
}

/** Nueva compra o recogida: suma unidades, guarda el historial y marca "repuesto". */
export async function registerRestock(med, { at, quantity, notes = '' }) {
  const before = infoFor(med);
  const totalAfter = Math.round(((before?.stock || 0) + Number(quantity)) * 1000) / 1000;
  await store.save('restocks', { medId: med.id, medName: medTitle(med), at, quantity: Number(quantity), totalAfter, notes: notes.trim() });
  const day = dayKey(at);
  await store.save('meds', {
    id: med.id,
    lastRestockDate: !med.lastRestockDate || day > med.lastRestockDate ? day : med.lastRestockDate,
    rxStatus: 'repuesto', rxStatusAt: Date.now(),
  });
  toast(`Reposición guardada · ahora tienes ${qty(totalAfter, med.unit)}`);
  return totalAfter;
}

export async function deleteRestock(rec) {
  const ok = await confirmDialog({ title: 'Eliminar reposición', message: `Se quitarán ${rec.quantity} unidades añadidas el ${new Date(rec.at).toLocaleDateString('es-ES')}. Las existencias se recalcularán.` });
  if (!ok) return false;
  await store.remove('restocks', rec.id);
  toast('Reposición eliminada');
  return true;
}

/** Cambia el estado de la receta (siempre a mano: la app no contacta con nadie). */
export async function setRxStatus(med, rxStatus) {
  await store.save('meds', { id: med.id, rxStatus, rxStatusAt: Date.now() });
  toast(rxStatus === 'solicitada' ? 'Receta marcada como pendiente' : 'Estado actualizado');
}

/** Pausar, reanudar, finalizar o quitar de la lista. El historial nunca se borra. */
export async function setMedStatus(med, status) {
  const labels = { activo: 'Tratamiento reanudado', pausado: 'Tratamiento pausado', finalizado: 'Tratamiento finalizado' };
  await store.save('meds', { id: med.id, status, statusAt: Date.now() });
  toast(labels[status]);
}

export async function archiveMed(med) {
  const ok = await confirmDialog({
    title: 'Quitar de la lista',
    message: `${medTitle(med)} dejará de aparecer en tus medicamentos y no generará tomas ni avisos.\n\nSu historial de tomas y reposiciones se conserva y seguirá saliendo en el Historial, el Calendario y los informes PDF.`,
    confirmLabel: 'Quitar de la lista',
  });
  if (!ok) return false;
  await store.save('meds', { id: med.id, archived: true, status: 'finalizado', statusAt: med.status === 'activo' ? Date.now() : med.statusAt });
  toast('Medicamento quitado de la lista');
  return true;
}

/**
 * Revisa las existencias y crea los avisos que tocan (sin repetir).
 * Solo el aviso más importante de cada medicamento llega a mostrarse.
 */
let checking = false;
export async function checkStockAlerts() {
  if (checking) return;
  checking = true;
  try {
    const existing = new Set(alerts().map((a) => a.id));
    const fresh = [];
    for (const med of meds()) {
      const info = infoFor(med);
      fresh.push(...pendingAlerts(med, info, existing));
    }
    if (!fresh.length) return;
    const now = Date.now();
    await store.saveMany('alerts', fresh.map((a) => ({ ...a, createdAt: now, updatedAt: now })));
    const loud = fresh.filter((a) => !a.silent);
    if (loud.length && store.settings.notifyStock !== false) {
      for (const a of loud) notifySystem('Medicación por reponer', a.message, `stock-${a.id}`);
      toast(loud.length === 1 ? loud[0].message.split('. ')[0] : `${loud.length} medicamentos necesitan reposición`, { kind: 'warn', ms: 4500, queue: true });
    }
  } finally { checking = false; }
}

/** Avisos sin atender (los silenciosos no cuentan). */
export const openAlerts = () => alerts().filter((a) => !a.attended && !a.silent && getMed(a.medId) && !getMed(a.medId).archived).sort((a, b) => b.at - a.at);

export async function attendAlert(a) {
  await store.save('alerts', { id: a.id, attended: true });
}
export async function attendAll() {
  const list = openAlerts();
  const now = Date.now();
  await store.saveMany('alerts', list.map((a) => ({ ...a, attended: true, updatedAt: now })));
  toast('Avisos marcados como atendidos');
}

export { nextDose };
