// Piezas de interfaz compartidas por varias pantallas.
import { store } from '../store.js';
import { icons, scene } from '../art.js';
import { esc } from '../ui.js';
import { qty, medTitle, RX } from '../meds.js';
import { STATE_LABEL } from '../schedule.js';
import { daysLeftText } from '../stock.js';
import { toTimeInput } from '../dates.js';

/**
 * Estado del guardado en la nube. Nunca dice "Guardado" si quedan cambios
 * por subir: Guardado · Sincronizando · Sin conexión · Error de sincronización.
 */
export function syncState() {
  const s = store.sync;
  if (!s) return store.backend === 'memory' ? { cls: 'crit', label: 'Sin guardar', detail: 'Este navegador no permite guardar datos.' } : { cls: 'warn', label: 'Modo local', detail: 'Los datos solo están en este dispositivo: falta configurar la nube (ver PUESTA-EN-MARCHA.md).' };
  const n = s.pending;
  const online = s.online !== false && globalThis.navigator?.onLine !== false;
  if (!online) return { cls: 'warn', label: n ? `Sin conexión · ${n} pendiente${n === 1 ? '' : 's'}` : 'Sin conexión', detail: n ? 'Los cambios están guardados en el iPhone y se subirán solos al volver la conexión.' : 'Sin conexión. Todo lo anterior ya está en la nube.' };
  if (s.error && n) return { cls: 'crit', label: 'Error de sincronización', detail: `No se han podido subir ${n} cambio${n === 1 ? '' : 's'}: ${s.error}. Se reintentará automáticamente.` };
  if (s.syncing || n) return { cls: 'busy', label: 'Sincronizando…', detail: 'Subiendo cambios a la nube.' };
  return { cls: '', label: 'Guardado', detail: s.lastSync ? `Todo guardado en la nube · ${new Date(s.lastSync).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : 'Todo guardado en la nube.' };
}

export function syncPill() {
  const s = syncState();
  return `<button class="sync-pill ${s.cls}" data-action="sync-info" aria-label="${esc(s.label)}. ${esc(s.detail)}"><i></i>${esc(s.label)}</button>`;
}

/** Barra visible de "sin conexión" para que nunca se confunda con guardado en la nube. */
export function offlineBar() {
  const s = store.sync;
  if (!s || (s.online !== false && navigator.onLine !== false)) return '';
  return `<div class="offline-bar" role="status">${icons.cloud({ size: 18 })}<span>Sin conexión. Lo que registres se guarda en el iPhone y se subirá a la nube al recuperar la conexión.</span></div>`;
}

export function emptyState(kind, title, sub, action = '') {
  return `<div class="empty">${scene(kind, { width: 190 })}<div class="empty-title">${esc(title)}</div><div class="empty-sub">${esc(sub)}</div>${action}</div>`;
}

/** Icono de estado: forma distinta para cada uno (no solo color). */
export function stateIcon(status) {
  const ico = { realizada: icons.check, omitida: icons.skip, pendiente: icons.clock, retrasada: icons.alert }[status] || icons.clock;
  return `<span class="st ${status}" aria-hidden="true">${ico({ size: 18 })}</span>`;
}

export function statePill(status, late = false) {
  const cls = { realizada: 'ok', omitida: 'off', pendiente: 'warn', retrasada: 'warn' }[status];
  return `<span class="pill ${cls}">${STATE_LABEL[status]}${late ? ' con retraso' : ''}</span>`;
}

/** Fila de una toma registrada (o prevista) para listas de historial y calendario. */
export function intakeRow({ intake, at, med, status, late }) {
  const time = toTimeInput(intake ? intake.at : at);
  const name = intake ? intake.medName : medTitle(med);
  const amount = intake ? qty(intake.quantity, intake.unit) : qty(med.dose, med.unit);
  const planned = intake && intake.scheduledAt && Math.abs(intake.scheduledAt - intake.at) > 60000 ? ` · prevista ${toTimeInput(intake.scheduledAt)}` : '';
  const attrs = intake ? `data-intake="${intake.id}" aria-label="${esc(name)}, ${time}, ${STATE_LABEL[intake.status]}. Editar"` : `data-slot-med="${med.id}" data-slot-at="${at}" aria-label="${esc(name)}, ${time}, ${STATE_LABEL[status]}. Registrar"`;
  return `<li><button class="row" ${attrs}>
    ${stateIcon(status)}
    <span class="row-main"><span class="row-title">${esc(name)}</span>
      <span class="row-sub"><span class="tnum">${time}</span> · ${esc(amount)}${planned}</span>
      ${intake?.notes ? `<div class="row-note">${esc(intake.notes)}</div>` : ''}
      <span class="tags">${statePill(status, late)}</span></span>
    <span class="row-chev">${icons.right({ size: 18 })}</span>
  </button></li>`;
}

/** Resumen de existencias de una línea: "28 comprimidos · Para 9 días aprox." */
export function stockLine(med, info) {
  if (!info) return '';
  return `${qty(Math.max(0, info.stock), med.unit)} · ${daysLeftText(info)}`;
}

export function meter(info, med) {
  if (!info) return '';
  const ref = Math.max(Number(med.stockInitial) || 0, ...(med.thresholds || []).map(Number), Number(med.minReserve) || 0, info.stock, 1);
  const pct = Math.max(0, Math.min(100, (info.stock / ref) * 100));
  return `<div class="meter ${info.level}" role="img" aria-label="Existencias: ${pct.toFixed(0)} %"><i style="width:${pct.toFixed(1)}%"></i></div>`;
}

export function rxPill(med) {
  const inProgress = ['pendiente_solicitar', 'solicitada', 'disponible', 'pendiente_compra'].includes(med.rxStatus);
  if (inProgress) return `<span class="pill ${med.rxStatus === 'pendiente_solicitar' ? 'warn' : 'blue'}">${icons.receipt({ size: 13 })} ${esc(RX[med.rxStatus].short)}</span>`;
  return med.needsRx ? `<span class="pill teal">${icons.receipt({ size: 13 })} Con receta</span>` : '';
}
