// Notificaciones y recordatorios.
//
// CÓMO FUNCIONAN EN EL IPHONE (importante):
//  1. Con la app ABIERTA (o recién abierta): MEDICINA comprueba cada 30 s si
//     toca avisar de una toma y muestra una notificación del sistema (si se
//     ha dado permiso) y un aviso dentro de la app. Al abrir la app también
//     avisa de lo que tocó mientras estaba cerrada.
//  2. Con la app CERRADA: iOS no deja que una web programe notificaciones
//     locales. La forma fiable es "Añadir al Calendario del iPhone": crea un
//     evento que se repite a cada hora de toma, con su alarma. Avisa aunque
//     el iPhone esté bloqueado y sin conexión.
//  (Notificaciones "push" desde un servidor con la app cerrada requieren un
//  servidor de envío; ver PUESTA-EN-MARCHA.md, apartado "Avisos push".)
import { pad, dayKey, addDays, parseDayKey } from './dates.js';
import { scheduleTimes, intervalHours } from './schedule.js';
import { medTitle, qty, reminderLabel } from './meds.js';

export const notifySupported = () => typeof Notification !== 'undefined';
export const notifyPermission = () => (notifySupported() ? Notification.permission : 'unsupported');

/** ¿La app está instalada en la pantalla de inicio? (en iPhone es requisito para notificar) */
export const isStandalone = () => globalThis.matchMedia?.('(display-mode: standalone)').matches || globalThis.navigator?.standalone === true;

export async function requestNotifications() {
  if (!notifySupported()) return 'unsupported';
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

/** Notificación del sistema (si hay permiso). Devuelve true si se mostró. */
export async function notifySystem(title, body, tag) {
  if (notifyPermission() !== 'granted') return false;
  const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', renotify: false };
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg?.showNotification) { await reg.showNotification(title, opts); return true; }
    new Notification(title, opts); // eslint-disable-line no-new
    return true;
  } catch { return false; }
}

/* ------------------------------------------------------------------ */
/* Recordatorios de toma con la app abierta                              */
/* ------------------------------------------------------------------ */

const SHOWN_KEY = 'medicina:avisos-mostrados';
function shownSet() {
  try { return new Set(JSON.parse(localStorage.getItem(SHOWN_KEY) || '[]')); } catch { return new Set(); }
}
function saveShown(set) {
  try { localStorage.setItem(SHOWN_KEY, JSON.stringify([...set].slice(-300))); } catch { /* nada */ }
}

/**
 * Avisos de toma que tocan ahora: cuando llega la hora de aviso
 * (hora de la toma − minutos configurados) y hasta 30 min después de la toma.
 * Cada aviso se muestra una sola vez.
 */
export function dueDoseReminders(doses, now = Date.now()) {
  const shown = shownSet();
  const out = [];
  for (const d of doses) {
    const m = d.med.reminder;
    if (m == null) continue;
    const key = `${d.med.id}:${d.at}`;
    if (shown.has(key)) continue;
    if (now >= d.at - m * 60000 && now <= d.at + 30 * 60000) out.push({ ...d, key });
  }
  return out;
}
export function markShown(keys) {
  const s = shownSet();
  keys.forEach((k) => s.add(k));
  saveShown(s);
}

export function doseMessage(d) {
  const hhmm = new Date(d.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `${qty(d.med.dose, d.med.unit)} a las ${hhmm}.`;
}

/* ------------------------------------------------------------------ */
/* Calendario del iPhone (.ics con alarmas)                              */
/* ------------------------------------------------------------------ */

const icsText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsUtc = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`; };
const icsLocal = (key, hhmm) => `${key.replace(/-/g, '')}T${hhmm.replace(':', '')}00`;
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = []; let cur = ''; let len = 0;
  for (const ch of line) {
    const l = enc.encode(ch).length;
    if (len + l > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
    cur += ch; len += l;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/**
 * Un evento que se repite cada día por cada hora de toma, con su alarma.
 * Las horas se escriben en "hora local flotante" para que sigan siendo las
 * mismas (08:00 es 08:00) también tras el cambio de horario.
 */
export function medsToICS(list, { now = Date.now(), tz = Intl.DateTimeFormat().resolvedOptions().timeZone } = {}) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MEDICINA//Tomas//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const med of list) {
    const times = scheduleTimes(med);
    if (!times.length) continue;
    const today = dayKey(now);
    const start = med.startDate > today ? med.startDate : today;
    for (const t of times) {
      const desc = [
        `${qty(med.dose, med.unit)}${med.strength ? ` · ${med.strength}` : ''}`,
        intervalHours(med) && med.scheduleMode === 'desde_ultima' ? 'Pauta "contar desde la última toma": la hora real puede variar; consulta MEDICINA.' : '',
        'Registra la toma en MEDICINA.',
        'Recordatorio de organización: no sustituye las indicaciones de tu médico.',
      ].filter(Boolean).join('\n');
      lines.push(
        'BEGIN:VEVENT',
        `UID:${med.id}-${t.replace(':', '')}@medicina`,
        `DTSTAMP:${icsUtc(now)}`,
        `DTSTART${tz ? `;TZID=${tz}` : ''}:${icsLocal(start, t)}`,
        'DURATION:PT5M',
        `RRULE:FREQ=DAILY${med.endDate ? `;UNTIL=${icsUtc(parseDayKey(addDays(med.endDate, 1)).getTime() - 1000)}` : ''}`,
        `SUMMARY:${icsText(`💊 ${medTitle(med)}`)}`,
        `DESCRIPTION:${icsText(desc)}`,
      );
      const m = med.reminder ?? 0;
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(`${medTitle(med)} · ${reminderLabel(m)}`)}`, `TRIGGER:-PT${m}M`, 'END:VALARM');
      lines.push('END:VEVENT');
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
