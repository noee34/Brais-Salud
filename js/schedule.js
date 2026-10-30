// Pautas y horarios: qué tomas tocan, cuál es la próxima y en qué estado está
// cada una. Funciones puras (sin pantalla ni base de datos) para poder probarlas.
//
// Reglas importantes:
//  · La app NUNCA registra una toma sola: solo calcula lo previsto.
//  · Una toma prevista sin registrar es "pendiente" hasta que pasa el margen de
//    tolerancia; después es "retrasada". Nunca se propone duplicar una dosis.
//  · Con "Contar desde la última toma", la siguiente se calcula desde la hora
//    REAL de la última toma realizada (si se tomó tarde, todo se desplaza).
//    Con "Horario fijo", las horas no cambian aunque una toma se retrase.
import { dayKey, parseDayKey, addDays, combineLocal, pad } from './dates.js';

const H = 3600000;
const MIN = 60000;

export const FREQUENCIES = {
  h4: { label: 'Cada 4 horas', every: 4 },
  h6: { label: 'Cada 6 horas', every: 6 },
  h8: { label: 'Cada 8 horas', every: 8 },
  h12: { label: 'Cada 12 horas', every: 12 },
  d1: { label: 'Una vez al día', count: 1 },
  d2: { label: 'Dos veces al día', count: 2 },
  d3: { label: 'Tres veces al día', count: 3 },
  custom: { label: 'Horarios personalizados' },
  demanda: { label: 'Sin horario (cuando lo necesite)' },
};
export const DEFAULT_TIMES = { d1: ['09:00'], d2: ['09:00', '21:00'], d3: ['08:00', '14:00', '20:00'], custom: ['09:00'] };

const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

/** Horas de un día para una pauta "cada N horas" empezando en `first`. */
export function intervalTimes(first, every) {
  const start = toMin(first || '08:00');
  const out = [];
  for (let k = 0; k < Math.round(24 / every); k++) out.push(fromMin((start + k * every * 60) % 1440));
  return out.sort();
}

export const intervalHours = (med) => FREQUENCIES[med.frequency]?.every || null;

/** Horas del día (HH:MM, ordenadas) en las que toca el medicamento. */
export function scheduleTimes(med) {
  if (med.frequency === 'demanda') return [];
  const every = intervalHours(med);
  if (every) return intervalTimes(med.times?.[0], every);
  return [...new Set(med.times || [])].sort();
}

/** Consumo previsto al día (null si no hay pauta suficiente para calcularlo). */
export function dailyConsumption(med) {
  const n = scheduleTimes(med).length;
  if (!n || !(Number(med.dose) > 0)) return null;
  return n * Number(med.dose);
}

/** Texto de la pauta: "Cada 8 horas · 08:00, 16:00, 00:00". */
export function scheduleText(med) {
  const f = FREQUENCIES[med.frequency]?.label || '';
  const t = scheduleTimes(med);
  return t.length ? `${f} · ${t.join(', ')}` : f;
}

/** Periodo en que el tratamiento genera tomas previstas: [desde, hasta). */
export function activeWindow(med) {
  // Desde el inicio del tratamiento, pero no antes de 1 h antes de darlo de alta en la app
  // (así no aparecen como retrasadas tomas de días en que aún no se usaba MEDICINA).
  let from = Math.max(parseDayKey(med.startDate).getTime(), (med.createdAt || 0) - H);
  let to = med.endDate ? parseDayKey(addDays(med.endDate, 1)).getTime() : Infinity;
  if (med.status !== 'activo' || med.archived) to = Math.min(to, med.statusAt || 0);
  if (to < from) to = from;
  return [from, to];
}

/** Tomas de este medicamento, ordenadas por hora. */
const ofMed = (med, intakes) => intakes.filter((i) => i.medId === med.id).sort((a, b) => a.at - b.at);

/** Margen para asociar una toma suelta a una hora prevista: media separación, entre 1 y 3 horas. */
function matchWindow(med) {
  const n = scheduleTimes(med).length || 1;
  return Math.min(3 * H, Math.max(H, (24 / n / 2) * H));
}

/**
 * Horas previstas entre `from` y `to` (milisegundos).
 * Devuelve [{ at, next }] donde `next` es la hora prevista siguiente.
 */
export function plannedSlots(med, intakes, from, to, now = Date.now()) {
  if (med.frequency === 'demanda') return [];
  const [w0, w1] = activeWindow(med);
  const lo = Math.max(from, w0);
  const hi = Math.min(to, w1);
  if (hi <= lo) return [];
  const times = scheduleTimes(med);
  const every = intervalHours(med);

  // Horario fijo: todas las horas de cada día del periodo.
  if (med.scheduleMode !== 'desde_ultima' || !every) {
    const out = [];
    for (let k = dayKey(lo - 86400000); k <= dayKey(hi + 86400000); k = addDays(k, 1)) {
      for (const t of times) out.push(combineLocal(k, t));
    }
    out.sort((a, b) => a - b);
    return out.map((at, i) => ({ at, next: out[i + 1] ?? at + (every || 24) * H })).filter((s) => s.at >= lo && s.at < hi);
  }

  // Contar desde la última toma: la cadena se reajusta con cada toma realizada.
  const done = ofMed(med, intakes).filter((i) => i.status === 'realizada');
  const step = every * H;
  const tol = matchWindow(med);
  const out = [];
  const taken = new Set();
  // Primer eslabón: la primera hora fija dentro del tratamiento.
  let t = null;
  for (let k = dayKey(w0); t == null; k = addDays(k, 1)) {
    for (const hh of times) { const c = combineLocal(k, hh); if (c >= w0) { t = c; break; } }
    if (k > dayKey(w0 + 3 * 86400000)) break;
  }
  if (t == null) return [];
  for (let guard = 0; guard < 5000 && t < hi; guard++) {
    // ¿Alguna toma realizada cubre esta hora? (la asociada a ella o una suelta cercana)
    const hit = done.find((i) => !taken.has(i.id) && i.scheduledAt === t)
      || done.find((i) => !taken.has(i.id) && Math.abs(i.at - t) <= tol);
    if (hit) taken.add(hit.id);
    // La siguiente cuenta desde la hora REAL de la toma (o desde la prevista si no se registró).
    const next = (hit ? hit.at : t) + step;
    if (t >= lo) out.push({ at: t, next });
    t = next;
  }
  return out;
}

/**
 * Estado de cada hora prevista y qué toma la cubre.
 * status: 'realizada' | 'omitida' | 'pendiente' | 'retrasada'
 * late (solo en realizadas): true si se tomó después del margen de tolerancia.
 */
export function slotStatuses(med, intakes, from, to, { now = Date.now(), toleranceMin = 30 } = {}) {
  const slots = plannedSlots(med, intakes, from, to, now);
  const mine = ofMed(med, intakes);
  const used = new Set();
  const win = matchWindow(med);
  const tol = toleranceMin * MIN;
  // 1º las tomas que ya dicen a qué hora prevista corresponden; 2º las sueltas, a la más cercana.
  const cover = new Map();
  const slotSet = new Set(slots.map((s) => s.at));
  for (const s of slots) {
    const i = mine.find((x) => !used.has(x.id) && x.scheduledAt === s.at);
    if (i) { cover.set(s.at, i); used.add(i.id); }
  }
  for (const s of slots) {
    if (cover.has(s.at)) continue;
    const near = mine.filter((x) => !used.has(x.id) && (x.scheduledAt == null || !slotSet.has(x.scheduledAt)) && Math.abs(x.at - s.at) <= win)
      .sort((a, b) => Math.abs(a.at - s.at) - Math.abs(b.at - s.at))[0];
    if (near) { cover.set(s.at, near); used.add(near.id); }
  }
  return slots.map((s) => {
    const intake = cover.get(s.at) || null;
    let status;
    if (intake) status = intake.status;
    else status = now <= s.at + tol ? 'pendiente' : 'retrasada';
    return { med, at: s.at, next: s.next, intake, status, late: Boolean(intake && intake.status === 'realizada' && intake.at > s.at + tol) };
  });
}

/**
 * Próxima toma de un medicamento: la primera hora prevista sin registrar cuya
 * siguiente hora aún no ha llegado (así una toma olvidada de hace horas no se
 * acumula con la nueva). null si no hay pauta o el tratamiento no está activo.
 */
export function nextDose(med, intakes, { now = Date.now(), toleranceMin = 30 } = {}) {
  if (med.status !== 'activo' || med.archived || med.frequency === 'demanda') return null;
  const list = slotStatuses(med, intakes, now - 36 * H, now + 8 * 86400000, { now, toleranceMin });
  const s = list.find((x) => !x.intake && x.next > now);
  return s ? { med, at: s.at, late: s.status === 'retrasada', status: s.status } : null;
}

/** Próximas tomas de todos los medicamentos, ordenadas. */
export function upcomingDoses(meds, intakes, opts) {
  return meds.map((m) => nextDose(m, intakes, opts)).filter(Boolean).sort((a, b) => a.at - b.at);
}

/**
 * Al registrar una toma a la hora `at`, ¿a qué hora prevista corresponde?
 * La hora sin registrar más cercana dentro del margen; null si es una toma suelta.
 */
export function slotForIntake(med, intakes, at, opts = {}) {
  const win = matchWindow(med);
  const list = slotStatuses(med, intakes.filter((i) => i.id !== opts.ignoreId), at - win - H, at + win + H, { now: Math.max(at, opts.now || 0) });
  const free = list.filter((s) => !s.intake && Math.abs(s.at - at) <= win).sort((a, b) => Math.abs(a.at - at) - Math.abs(b.at - at));
  return free[0]?.at ?? null;
}

/** "45 min", "2 h 10 min", "3 días". */
export function durationText(ms) {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) { const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${r} min` : `${h} h`; }
  const d = Math.round(m / 1440);
  return `${d} días`;
}

/** Texto de cuenta atrás para la tarjeta de Próxima toma. */
export function countdownText(at, now = Date.now(), toleranceMin = 30) {
  if (at > now) return `Faltan ${durationText(at - now)}`;
  if (now - at < MIN) return 'Es la hora';
  return now - at <= toleranceMin * MIN ? `Era hace ${durationText(now - at)}` : `Retrasada ${durationText(now - at)}`;
}

export const STATE_LABEL = { realizada: 'Realizada', omitida: 'Omitida', pendiente: 'Pendiente', retrasada: 'Retrasada' };
