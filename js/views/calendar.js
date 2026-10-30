// CALENDARIO: mes a mes con indicadores por día (verde realizada, naranja
// pendiente o retrasada, gris omitida) y el detalle del día elegido.
import { store } from '../store.js';
import { icons } from '../art.js';
import { esc, calendarHTML } from '../ui.js';
import { dayKey, parseDayKey, addDays, fmtLongDate } from '../dates.js';
import { slotStatuses } from '../schedule.js';
import { intakes, meds as allMeds } from '../model.js';
import { syncPill, offlineBar, intakeRow, emptyState } from './common.js';

/** Tomas previstas + registradas entre dos instantes, con su estado. */
export function entriesBetween(from, to, now = Date.now()) {
  const tol = store.settings.toleranceMin;
  const all = intakes();
  const planned = allMeds().flatMap((m) => slotStatuses(m, all, from, to, { now, toleranceMin: tol }));
  const covered = new Set(planned.filter((s) => s.intake).map((s) => s.intake.id));
  const loose = all.filter((i) => i.at >= from && i.at < to && !covered.has(i.id)).map((i) => ({ intake: i, at: i.at, status: i.status, late: false }));
  return [...planned, ...loose];
}

export function renderCalendar(state) {
  const [y, m] = state.calMonth;
  const now = Date.now();
  const from = new Date(y, m, 1 - 7).getTime();
  const to = new Date(y, m + 1, 8).getTime();
  const entries = entriesBetween(from, Math.min(to, parseDayKey(addDays(dayKey(now), 1)).getTime()), now);
  const marks = new Map();
  for (const e of entries) {
    const k = dayKey(e.intake ? e.intake.at : e.at);
    if (!marks.has(k)) marks.set(k, { done: 0, pending: 0, omitted: 0 });
    const mk = marks.get(k);
    if (e.status === 'realizada') mk.done++;
    else if (e.status === 'omitida') mk.omitted++;
    else mk.pending++;
  }
  const sel = state.calSelected;
  const s0 = parseDayKey(sel).getTime();
  const s1 = parseDayKey(addDays(sel, 1)).getTime();
  const day = entriesBetween(s0, s1, now).sort((a, b) => (a.intake?.at ?? a.at) - (b.intake?.at ?? b.at));
  const isFuture = sel > dayKey(now);
  const count = (st) => day.filter((e) => e.status === st).length;

  return `
  <header class="topbar"><h1 class="h-page">Calendario</h1><div class="topbar-end">${syncPill()}</div></header>
  ${offlineBar()}
  ${calendarHTML({ year: y, month: m, selected: sel, marks, withYear: true })}
  <button class="btn btn-ghost btn-sm" data-action="cal-today" style="margin:10px auto 0;display:flex">Ir a hoy</button>
  <section class="section" style="margin-top:18px">
    <div class="section-head"><h2 class="h-section" style="text-transform:none">${esc(fmtLongDate(sel, { year: sel.slice(0, 4) !== dayKey(now).slice(0, 4) }).replace(/^./, (c) => c.toUpperCase()))}</h2>
      ${!isFuture ? `<button class="link-btn" data-action="add-intake-day">+ Registrar</button>` : ''}</div>
    ${day.length ? `<div class="tags" style="margin-bottom:10px"><span class="pill ok">${count('realizada')} realizadas</span><span class="pill warn">${count('pendiente') + count('retrasada')} ${isFuture ? 'programadas' : 'pendientes'}</span><span class="pill off">${count('omitida')} omitidas</span></div>
      <div class="card" style="padding:4px 16px"><ul class="list">${day.map(intakeRow).join('')}</ul></div>`
      : emptyState('calendar', 'Sin tomas este día', isFuture ? 'No hay tomas programadas.' : 'No hay tomas registradas ni programadas.')}
  </section>`;
}
