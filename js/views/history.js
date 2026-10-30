// HISTORIAL: todas las tomas registradas, con filtros por medicamento y por
// fechas (todo, mes, año o intervalo). Incluye medicamentos finalizados o
// quitados de la lista: el historial nunca desaparece.
import { icons } from '../art.js';
import { esc } from '../ui.js';
import { dayKey, relativeDayLabel, fmtMonth, parseDayKey, addDays } from '../dates.js';
import { medTitle } from '../meds.js';
import { intakes, meds as allMeds } from '../model.js';
import { syncPill, offlineBar, intakeRow, emptyState } from './common.js';

export function historyRange(state) {
  switch (state.histPeriod) {
    case 'month': { const [y, m] = state.histMonth; return [new Date(y, m, 1).getTime(), new Date(y, m + 1, 1).getTime()]; }
    case 'year': return [new Date(state.histYear, 0, 1).getTime(), new Date(state.histYear + 1, 0, 1).getTime()];
    case 'range': return [parseDayKey(state.histFrom).getTime(), parseDayKey(addDays(state.histTo, 1)).getTime()];
    default: return [-Infinity, Infinity];
  }
}

export function filteredIntakes(state) {
  const [from, to] = historyRange(state);
  return intakes().filter((i) => i.at >= from && i.at < to && (!state.histMed || i.medId === state.histMed) && (state.histStatus === 'all' || i.status === state.histStatus))
    .sort((a, b) => b.at - a.at);
}

export function renderHistory(state) {
  const all = [...allMeds()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const list = filteredIntakes(state);
  const shown = list.slice(0, state.histLimit);
  const done = list.filter((i) => i.status === 'realizada').length;
  const omitted = list.length - done;
  const byDay = new Map();
  for (const i of shown) { const k = dayKey(i.at); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(i); }

  const periodNav = {
    month: `<div class="cal-head" style="margin-top:10px"><button class="icon-btn" data-hist-step="-1" aria-label="Mes anterior">${icons.left()}</button><div class="cal-title">${fmtMonth(...state.histMonth)}</div><button class="icon-btn" data-hist-step="1" aria-label="Mes siguiente">${icons.right()}</button></div>`,
    year: `<div class="cal-head" style="margin-top:10px"><button class="icon-btn" data-hist-step="-1" aria-label="Año anterior">${icons.left()}</button><div class="cal-title">${state.histYear}</div><button class="icon-btn" data-hist-step="1" aria-label="Año siguiente">${icons.right()}</button></div>`,
    range: `<div class="grid2" style="margin-top:10px"><div class="input-shell"><input type="date" name="hist-from" value="${state.histFrom}" aria-label="Desde"></div><div class="input-shell"><input type="date" name="hist-to" value="${state.histTo}" aria-label="Hasta"></div></div>`,
  }[state.histPeriod] || '';

  return `
  <header class="topbar"><h1 class="h-page">Historial</h1><div class="topbar-end">${syncPill()}</div></header>
  ${offlineBar()}
  <button class="btn btn-primary btn-block" data-action="pdf">${icons.pdf({ size: 20 })} EXPORTAR INFORME PDF</button>
  <div class="card" style="margin-top:14px;padding:14px">
    <div class="segmented" role="tablist" aria-label="Período">
      ${[['all', 'Todo'], ['month', 'Mes'], ['year', 'Año'], ['range', 'Fechas']].map(([id, l]) => `<button role="tab" aria-selected="${state.histPeriod === id}" class="${state.histPeriod === id ? 'on' : ''}" data-hist-period="${id}">${l}</button>`).join('')}
    </div>
    ${periodNav}
    <div class="grid2" style="margin-top:10px">
      <div class="input-shell select"><select name="hist-med" aria-label="Medicamento"><option value="">Todos los medicamentos</option>${all.map((m) => `<option value="${m.id}" ${state.histMed === m.id ? 'selected' : ''}>${esc(medTitle(m))}${m.archived || m.status === 'finalizado' ? ' (finalizado)' : ''}</option>`).join('')}</select></div>
      <div class="input-shell select"><select name="hist-status" aria-label="Estado"><option value="all" ${state.histStatus === 'all' ? 'selected' : ''}>Todos los estados</option><option value="realizada" ${state.histStatus === 'realizada' ? 'selected' : ''}>Realizadas</option><option value="omitida" ${state.histStatus === 'omitida' ? 'selected' : ''}>Omitidas</option></select></div>
    </div>
  </div>
  <p class="subtle" style="margin:14px 2px 0">${list.length} ${list.length === 1 ? 'registro' : 'registros'} · ${done} realizadas · ${omitted} omitidas</p>
  ${list.length ? [...byDay].map(([k, items]) => `<div class="eyebrow group-label" style="margin-top:18px">${esc(relativeDayLabel(k))}</div>
      <div class="card" style="padding:4px 16px"><ul class="list">${items.map((i) => intakeRow({ intake: i, status: i.status })).join('')}</ul></div>`).join('')
    : emptyState('history', 'Sin registros', 'No hay tomas registradas con estos filtros.')}
  ${list.length > shown.length ? `<button class="btn btn-ghost btn-block" data-action="hist-more" style="margin-top:16px">Ver más (${list.length - shown.length})</button>` : ''}`;
}
