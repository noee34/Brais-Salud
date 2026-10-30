// Utilidades de fecha. Todo se calcula en la zona horaria LOCAL del dispositivo.
// Los registros guardan el instante como milisegundos epoch (`at`); el "día"
// al que pertenecen se deriva siempre con getters locales, nunca con UTC,
// para que una toma de las 00:30 no aparezca en el día anterior.

export const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' en hora local. Acepta Date o milisegundos. */
export function dayKey(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Medianoche local del día indicado por la clave. */
export function parseDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Suma días respetando cambios de horario (no suma 24 h fijas). */
export function addDays(key, n) {
  const d = parseDayKey(key);
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

export function daysInMonth(year, month0) {
  return new Date(year, month0 + 1, 0).getDate();
}

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Lunes de la semana a la que pertenece el día. */
export function weekStart(key) {
  const d = parseDayKey(key);
  const offset = (d.getDay() + 6) % 7; // lunes = 0
  return addDays(key, -offset);
}

/**
 * Rejilla mensual empezando en lunes. Devuelve semanas con 7 celdas
 * { key, day, inMonth }.
 */
export function monthGrid(year, month0) {
  const first = new Date(year, month0, 1);
  const lead = (first.getDay() + 6) % 7;
  const total = daysInMonth(year, month0);
  const cells = [];
  for (let i = 0; i < lead; i++) {
    const d = new Date(year, month0, 1 - lead + i);
    cells.push({ key: dayKey(d), day: d.getDate(), inMonth: false });
  }
  for (let day = 1; day <= total; day++) {
    cells.push({ key: dayKey(new Date(year, month0, day)), day, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const d = new Date(year, month0, total + (cells.length - lead - total) + 1);
    cells.push({ key: dayKey(d), day: d.getDate(), inMonth: false });
  }
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Combina 'YYYY-MM-DD' + 'HH:MM' de un formulario en milisegundos locales. */
export function combineLocal(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

export const toDateInput = (ms) => dayKey(ms);
export function toTimeInput(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fmtTime = toTimeInput;

const LOCALE = 'es-ES';
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** 'jueves, 29 de octubre' */
export function fmtLongDate(key, { year = false } = {}) {
  const opts = { weekday: 'long', day: 'numeric', month: 'long' };
  if (year) opts.year = 'numeric';
  return new Intl.DateTimeFormat(LOCALE, opts).format(parseDayKey(key));
}

/** '29 oct' */
export function fmtShortDate(key) {
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' })
    .format(parseDayKey(key)).replace('.', '');
}

/** 'Octubre 2026' */
export function fmtMonth(year, month0) {
  return cap(new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' })
    .format(new Date(year, month0, 1)));
}

/** Inicial del día de la semana: L M X J V S D */
export const WEEKDAY_INITIALS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export function weekdayShort(key) {
  return cap(new Intl.DateTimeFormat(LOCALE, { weekday: 'short' })
    .format(parseDayKey(key)).replace('.', ''));
}

/** Diferencia en días naturales (b - a), inmune a cambios de hora. */
export function diffDays(aKey, bKey) {
  const a = parseDayKey(aKey), b = parseDayKey(bKey);
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

/** 'Hoy', 'Ayer', 'Hace 3 días' o la fecha larga. */
export function relativeDayLabel(key, todayKey = dayKey()) {
  const diff = diffDays(key, todayKey);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  if (diff === -1) return 'Mañana';
  if (diff > 1 && diff < 7) return `Hace ${diff} días`;
  return cap(fmtLongDate(key, { year: parseDayKey(key).getFullYear() !== parseDayKey(todayKey).getFullYear() }));
}

export { cap };

/**
 * Suma meses a un día. Si el día no existe en el mes de destino (31 de enero +
 * 1 mes), se usa el último día de ese mes (28 o 29 de febrero).
 */
export function addMonths(key, n) {
  const d = parseDayKey(key);
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const day = Math.min(d.getDate(), daysInMonth(target.getFullYear(), target.getMonth()));
  return dayKey(new Date(target.getFullYear(), target.getMonth(), day));
}

/** Meses completos cumplidos entre el nacimiento y hoy (0 si aún no ha cumplido uno). */
export function monthsBetween(birthKey, todayKey = dayKey()) {
  if (!birthKey || todayKey < birthKey) return 0;
  const a = parseDayKey(birthKey), b = parseDayKey(todayKey);
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (addMonths(birthKey, m) > todayKey) m -= 1;
  return Math.max(0, m);
}

/** Edad en años, meses y días: { years, months, days, totalMonths, totalDays }. */
export function ageParts(birthKey, todayKey = dayKey()) {
  if (!birthKey || todayKey < birthKey) return null;
  const totalMonths = monthsBetween(birthKey, todayKey);
  const days = diffDays(addMonths(birthKey, totalMonths), todayKey);
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12, days, totalMonths, totalDays: diffDays(birthKey, todayKey) };
}

/** "Recién nacida", "12 días", "3 meses y 5 días", "1 año y 2 meses". */
export function ageText(birthKey, todayKey = dayKey()) {
  const p = ageParts(birthKey, todayKey);
  if (!p) return '';
  const n = (v, one, many) => `${v} ${v === 1 ? one : many}`;
  if (p.totalDays === 0) return 'Recién nacida';
  if (p.totalMonths === 0) return n(p.days, 'día', 'días');
  if (p.years === 0) return p.days ? `${n(p.months, 'mes', 'meses')} y ${n(p.days, 'día', 'días')}` : n(p.months, 'mes', 'meses');
  return p.months ? `${n(p.years, 'año', 'años')} y ${n(p.months, 'mes', 'meses')}` : n(p.years, 'año', 'años');
}
