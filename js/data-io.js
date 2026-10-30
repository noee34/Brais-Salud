// Exportación CSV, copia de seguridad JSON e importación sin duplicados.
import { dayKey, toTimeInput } from './dates.js';
import { TYPES } from './store.js';

export const BACKUP_FORMAT = 'medicina-copia';
export const BACKUP_VERSION = 1;

function csvCell(value) {
  const s = value == null ? '' : String(value);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const iso = (ms) => (ms ? new Date(ms).toISOString() : '');
const dec = (n) => (n == null ? '' : String(n).replace('.', ','));

/** Historial de tomas en CSV (separador ';' y BOM para Numbers y Excel en español). */
export function intakesToCSV(intakes) {
  const header = ['fecha', 'hora', 'medicamento', 'cantidad', 'unidad', 'estado', 'hora_prevista', 'observaciones', 'creado', 'modificado', 'id'];
  const rows = [...intakes].sort((a, b) => a.at - b.at).map((r) => [
    dayKey(r.at), toTimeInput(r.at), r.medName, dec(r.quantity), r.unit, r.status,
    r.scheduledAt ? `${dayKey(r.scheduledAt)} ${toTimeInput(r.scheduledAt)}` : '', r.notes || '', iso(r.createdAt), iso(r.updatedAt), r.id,
  ].map(csvCell).join(';'));
  return '﻿' + [header.join(';'), ...rows].join('\r\n');
}

export function toBackup(data, settings) {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), settings, ...Object.fromEntries(TYPES.map((t) => [t, data[t] || []])) };
}

const isId = (v) => typeof v === 'string' && v.length > 0;
const VALID = {
  meds: (r) => isId(r.id) && typeof r.name === 'string' && Number(r.dose) > 0 && typeof r.frequency === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.startDate || ''),
  intakes: (r) => isId(r.id) && isId(r.medId) && Number.isFinite(r.at) && ['realizada', 'omitida'].includes(r.status),
  restocks: (r) => isId(r.id) && isId(r.medId) && Number.isFinite(r.at) && Number(r.quantity) > 0,
  alerts: (r) => isId(r.id) && isId(r.medId) && typeof r.message === 'string',
};

export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('El archivo no es una copia válida.'); }
  if (!data || data.format !== BACKUP_FORMAT || !Array.isArray(data.meds)) throw new Error('Este archivo no parece una copia de MEDICINA.');
  const out = { settings: data.settings || null };
  for (const t of TYPES) out[t] = (Array.isArray(data[t]) ? data[t] : []).filter((r) => r && VALID[t](r));
  // Tomas y reposiciones huérfanas (de un medicamento que no está en la copia) se descartan.
  const ids = new Set(out.meds.map((m) => m.id));
  for (const t of ['intakes', 'restocks', 'alerts']) out[t] = out[t].filter((r) => ids.has(r.medId));
  return out;
}

/** Fusiona por id; si existe en ambos lados gana el `updatedAt` más reciente. */
export function mergeRecords(local, incoming) {
  const map = new Map(local.map((r) => [r.id, r]));
  const changed = [];
  let added = 0, updated = 0;
  for (const r of incoming) {
    const cur = map.get(r.id);
    if (!cur) { map.set(r.id, r); changed.push(r); added++; }
    else if ((r.updatedAt || 0) > (cur.updatedAt || 0)) { map.set(r.id, r); changed.push(r); updated++; }
  }
  return { merged: [...map.values()], changed, added, updated };
}

/** Comparte el archivo (hoja de compartir de iOS) o, si no se puede, lo descarga. */
export async function deliverFile(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const file = new File([blob], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}
