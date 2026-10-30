// Existencias, días restantes y avisos de reposición. Funciones puras.
//
// Las existencias NO se guardan en ningún sitio: se calculan cada vez como
//   recuento inicial + reposiciones − tomas REALIZADAS desde el recuento.
// Por eso, al corregir, mover o borrar una toma, el número se recalcula solo y
// es imposible descontar dos veces la misma toma. Las omitidas no descuentan.
import { dailyConsumption } from './schedule.js';
import { qty, medTitle, fmtNum } from './meds.js';

const round = (n) => Math.round(n * 1000) / 1000;

/** Reposiciones de un medicamento posteriores al recuento inicial. */
export const restocksOf = (med, restocks) => restocks.filter((r) => r.medId === med.id).sort((a, b) => b.at - a.at || b.createdAt - a.createdAt);

/**
 * Estado del inventario de un medicamento.
 * { stock, daily, daysLeft, level: 'verde'|'naranja'|'rojo', cycle, used, added }
 * null si el medicamento no lleva control de existencias.
 */
export function stockInfo(med, intakes, restocks) {
  if (!med.stockEnabled) return null;
  const since = med.stockSince || 0;
  // Tomas: cuentan las realizadas a partir del momento del recuento.
  const used = intakes
    .filter((i) => i.medId === med.id && i.status === 'realizada' && i.at >= since)
    .reduce((a, i) => a + (Number(i.quantity) || 0), 0);
  // Reposiciones: cuentan las anotadas después del recuento (aunque su fecha sea de ese mismo día).
  const mine = restocks.filter((r) => r.medId === med.id && (r.createdAt || r.at) >= since);
  const added = mine.reduce((a, r) => a + (Number(r.quantity) || 0), 0);
  const stock = round((Number(med.stockInitial) || 0) + added - used);
  const daily = med.status === 'activo' && !med.archived ? dailyConsumption(med) : null;
  const left = Math.max(0, stock);
  const daysLeft = daily ? Math.floor(left / daily + 1e-9) : null;
  const thresholds = (med.thresholds || []).map(Number).filter((t) => t >= 0);
  const critical = thresholds.length ? Math.min(...thresholds) : 0;
  let level = 'verde';
  if (stock <= 0 || stock <= critical || (daysLeft != null && daysLeft <= 1)) level = 'rojo';
  else if (stock <= Number(med.minReserve || 0) || thresholds.some((t) => stock <= t) || (daysLeft != null && daysLeft <= Number(med.alertDays || 0))) level = 'naranja';
  // Periodo de avisos: empieza de nuevo con cada recuento o reposición.
  const cycle = String(Math.max(since, ...mine.map((r) => r.createdAt || r.at)));
  return { stock, daily, daysLeft, level, cycle, used: round(used), added: round(added) };
}

export const LEVEL_LABEL = { verde: 'Existencias suficientes', naranja: 'Quedan pocas unidades', rojo: 'Existencias críticas' };

/** Fecha estimada en que se acaba (milisegundos) o null. */
export function runOutDate(info, now = Date.now()) {
  if (!info || info.daysLeft == null) return null;
  return now + info.daysLeft * 86400000;
}

/** "Para unos 4 días" / "Estimación no disponible". */
export function daysLeftText(info) {
  if (!info) return '';
  if (info.daysLeft == null) return 'Estimación no disponible';
  if (info.stock <= 0) return 'Agotado';
  if (info.daysLeft === 0) return 'Menos de 1 día';
  return info.daysLeft === 1 ? 'Para 1 día aprox.' : `Para ${info.daysLeft} días aprox.`;
}

const RX_PENDING = ['sin_receta', 'pendiente_solicitar', 'repuesto'];

/** Texto de cada aviso. Son recordatorios de organización, nunca consejos de tratamiento. */
export function alertMessage(kind, med, info) {
  const name = medTitle(med);
  const rx = med.needsRx && RX_PENDING.includes(med.rxStatus);
  if (kind === 'agotado') {
    return `No te quedan existencias de ${name}.${rx ? ' Recuerda solicitar una nueva receta.' : ''} Cuando la tengas, regístrala en Reposiciones.`;
  }
  if (kind === 'dias') {
    const d = info.daysLeft;
    const when = d <= 0 ? 'menos de 1 día' : d === 1 ? 'aproximadamente 1 día' : `aproximadamente ${d} días`;
    return rx
      ? `Te queda ${name} para ${when}. Recuerda solicitar una nueva receta para evitar quedarte sin tratamiento.`
      : `Te queda ${name} para ${when}. Recuerda gestionar la reposición.`;
  }
  return `Te quedan ${qty(Math.max(0, info.stock), med.unit)} de ${name}. Recuerda gestionar la reposición.${rx ? ' Es posible que necesites solicitar una nueva receta.' : ''}`;
}

/**
 * Avisos que corresponden ahora y aún no existen.
 * Cada aviso tiene un id fijo (medicamento + periodo + tipo): no se repite
 * hasta la siguiente reposición o recuento, aunque se abra la app mil veces.
 * Si saltan varios a la vez, solo el más importante avisa; el resto queda
 * guardado como "silencioso" para que tampoco salte después.
 */
export function pendingAlerts(med, info, existingIds, now = Date.now()) {
  if (!info || med.archived || med.status === 'finalizado') return [];
  const kinds = [];
  if (info.stock <= 0) kinds.push(['agotado', 1000]);
  const ts = [...new Set((med.thresholds || []).map(Number).filter((t) => t >= 0))];
  for (const t of ts) if (info.stock <= t) kinds.push([`u${fmtNum(t).replace(',', '_')}`, 500 - t]);
  if (Number(med.minReserve) > 0 && info.stock <= Number(med.minReserve)) kinds.push(['minimo', 500 - Number(med.minReserve) - 0.5]);
  if (info.daysLeft != null && info.daysLeft <= Number(med.alertDays || 0)) kinds.push(['dias', 400 - info.daysLeft]);
  const fresh = kinds.map(([kind, weight]) => ({ kind, weight, id: `${med.id}:${info.cycle}:${kind}` })).filter((k) => !existingIds.has(k.id));
  if (!fresh.length) return [];
  fresh.sort((a, b) => b.weight - a.weight);
  return fresh.map((k, i) => ({
    id: k.id,
    medId: med.id,
    kind: k.kind,
    message: alertMessage(k.kind === 'agotado' || k.kind === 'dias' ? k.kind : 'unidades', med, info),
    level: k.kind === 'agotado' || info.level === 'rojo' ? 'rojo' : 'naranja',
    silent: i > 0,
    attended: i > 0,
    at: now,
  }));
}
