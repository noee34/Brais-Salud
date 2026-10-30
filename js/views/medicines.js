// MEDICAMENTOS: lista, ficha de cada medicamento (con CONTROL DE EXISTENCIAS)
// y el apartado REPOSICIONES.
import { store } from '../store.js';
import { icons, scene } from '../art.js';
import { esc, openSheet, $ } from '../ui.js';
import { dayKey, toTimeInput, fmtLongDate, addDays, parseDayKey } from '../dates.js';
import { qty, medTitle, FORMS, STATUS, RX, reminderLabel, fmtNum } from '../meds.js';
import { scheduleText, countdownText, durationText } from '../schedule.js';
import { daysLeftText, LEVEL_LABEL, restocksOf, runOutDate } from '../stock.js';
import { listedMeds, infoFor, nextFor, intakes, restocks, meds as allMeds, setRxStatus } from '../model.js';
import { syncPill, offlineBar, emptyState, meter, rxPill, intakeRow, statePill } from './common.js';

export function nextLine(med, now = Date.now(), prefix = true) {
  if (med.status !== 'activo') return med.status === 'pausado' ? 'Pausado: no genera tomas' : 'Tratamiento finalizado';
  if (med.frequency === 'demanda') return 'Sin horario fijo';
  const nd = nextFor(med, now);
  if (!nd) return 'Sin más tomas programadas';
  const when = dayKey(nd.at) === dayKey(now) ? toTimeInput(nd.at) : dayKey(nd.at) === addDays(dayKey(now), 1) ? `mañana ${toTimeInput(nd.at)}` : `${fmtLongDate(dayKey(nd.at))} ${toTimeInput(nd.at)}`;
  return nd.late ? `<span style="color:var(--warn)">Retrasada · ${when}</span>` : `${prefix ? 'Próxima: ' : ''}<strong>${when}</strong> · ${countdownText(nd.at, now, store.settings.toleranceMin).replace('Faltan ', 'en ')}`;
}

function medCard(med) {
  const info = infoFor(med);
  const cls = med.status === 'pausado' ? 'paused' : med.status === 'finalizado' ? 'ended' : '';
  return `<article class="card med-card ${cls}">
    <span class="med-ico">${icons.capsule({ size: 24 })}</span>
    <div style="min-width:0">
      <button class="med-name" data-med="${med.id}" style="text-align:left">${esc(medTitle(med))}</button>
      <div class="med-meta">${esc(qty(med.dose, med.unit))} · ${esc(scheduleText(med))}</div>
      <div class="med-next">${nextLine(med)}</div>
      ${info ? `<div class="med-next">${icons.box({ size: 14 }).replace('class="icon"', 'class="icon" style="display:inline;vertical-align:-2px"')} ${esc(qty(Math.max(0, info.stock), med.unit))} · ${esc(daysLeftText(info))}</div>${meter(info, med)}` : ''}
      <div class="tags">${med.status !== 'activo' ? `<span class="pill off">${STATUS[med.status].label}</span>` : ''}${info && info.level !== 'verde' ? `<span class="lvl ${info.level}">${LEVEL_LABEL[info.level]}</span>` : ''}${rxPill(med)}</div>
      <div class="med-actions">
        ${med.status === 'activo' ? `<button class="btn btn-primary btn-sm" data-register="${med.id}">${icons.check({ size: 18 })} REGISTRAR TOMA</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-med="${med.id}">Ficha</button>
      </div>
    </div>
  </article>`;
}

export function renderMedicines(state) {
  const list = listedMeds();
  const filter = state.medsFilter;
  const shown = list.filter((m) => filter === 'all' || m.status === filter);
  const archived = allMeds().filter((m) => m.archived).length;
  return `
  <header class="topbar"><h1 class="h-page">Medicamentos</h1><div class="topbar-end">${syncPill()}<button class="icon-btn" data-action="add-med" aria-label="Añadir medicamento">${icons.plus()}</button></div></header>
  ${offlineBar()}
  <a class="card" href="#reposiciones" style="display:flex;align-items:center;gap:14px;text-decoration:none;color:inherit;padding:14px 16px;margin-bottom:14px">
    <span class="badge blue">${icons.box()}</span><span style="flex:1"><strong>Existencias y reposiciones</strong><br><span class="subtle">Recetas, compras y lo que queda de cada medicamento</span></span>${icons.right({ size: 18 })}</a>
  <div class="chips scroll" role="group" aria-label="Filtrar" style="margin-bottom:14px">
    ${[['all', 'Todos'], ['activo', 'Activos'], ['pausado', 'Pausados'], ['finalizado', 'Finalizados']].map(([id, l]) => `<button class="chip ${filter === id ? 'on' : ''}" data-meds-filter="${id}" aria-pressed="${filter === id}">${l} <span class="subtle">${id === 'all' ? list.length : list.filter((m) => m.status === id).length}</span></button>`).join('')}
  </div>
  ${shown.length ? shown.map(medCard).join('') : emptyState('meds', list.length ? 'Nada en este filtro' : 'Aún no hay medicamentos', list.length ? 'Prueba con otro filtro.' : 'Añade los medicamentos de tu tratamiento con la pauta que te han indicado.', list.length ? '' : '<button class="btn btn-primary" data-action="add-med">Añadir medicamento</button>')}
  ${archived ? `<p class="subtle" style="text-align:center;margin-top:18px">${archived} ${archived === 1 ? 'medicamento quitado' : 'medicamentos quitados'} de la lista: su historial sigue en Historial.</p>` : ''}
  <div class="dock"><div class="dock-inner"><button class="btn btn-primary" data-action="add-med">${icons.plus({ size: 20 })} Añadir medicamento</button></div></div>`;
}

/* ------------------------------------------------------------------ */
/* Ficha del medicamento                                                 */
/* ------------------------------------------------------------------ */

export function medDetailHTML(med) {
  const info = infoFor(med);
  const now = Date.now();
  const recent = intakes().filter((i) => i.medId === med.id).sort((a, b) => b.at - a.at).slice(0, 6);
  const reps = restocksOf(med, restocks());
  const out = runOutDate(info, now);
  return `<div class="sheet-head"><div class="grow"><span class="eyebrow">${esc(FORMS[med.form]?.label || '')}${med.strength ? ` · ${esc(med.strength)}` : ''}</span><h2 class="h-section">${esc(med.name)}</h2></div>
      <button type="button" class="icon-btn" data-close aria-label="Cerrar">${icons.close()}</button></div>
    <div class="tags" style="margin:-4px 0 12px"><span class="pill ${med.status === 'activo' ? 'ok' : 'off'}">${STATUS[med.status].label}</span>${med.archived ? '<span class="pill off">Quitado de la lista</span>' : ''}${rxPill(med)}</div>
    ${med.status === 'activo' && !med.archived ? `<div class="form-actions" style="margin:0 0 14px">
      <button class="btn btn-primary btn-block" data-register="${med.id}">${icons.check({ size: 20 })} REGISTRAR TOMA</button>
      <div class="grid2"><button class="btn btn-ghost btn-sm" data-intake-other="${med.id}">Otra hora u omitida</button><button class="btn btn-ghost btn-sm" data-pdf-med="${med.id}">${icons.pdf({ size: 16 })} Informe</button></div></div>` : ''}

    <section class="card"><div class="facts">
      <div class="fact"><span class="fact-label">Cantidad por toma</span><span class="fact-value">${esc(qty(med.dose, med.unit))}</span></div>
      <div class="fact"><span class="fact-label">Próxima toma</span><span class="fact-value" style="font-weight:400">${nextLine(med, now, false)}</span></div>
      <div class="fact wide"><span class="fact-label">Pauta</span><span class="fact-value">${esc(scheduleText(med))}${med.scheduleMode === 'desde_ultima' ? ' · cuenta desde la última toma' : ''}</span></div>
      <div class="fact"><span class="fact-label">Inicio</span><span class="fact-value">${parseDayKey(med.startDate).toLocaleDateString('es-ES')}</span></div>
      <div class="fact"><span class="fact-label">Finalización</span><span class="fact-value">${med.endDate ? parseDayKey(med.endDate).toLocaleDateString('es-ES') : 'Sin fecha definida'}</span></div>
      <div class="fact wide"><span class="fact-label">Aviso de toma</span><span class="fact-value">${reminderLabel(med.reminder)}</span></div>
      ${med.notes ? `<div class="fact wide"><span class="fact-label">Observaciones</span><span class="fact-value" style="font-weight:400">${esc(med.notes)}</span></div>` : ''}
    </div></section>

    <section class="section" style="margin-top:22px"><div class="section-head"><h3 class="h-section">CONTROL DE EXISTENCIAS</h3></div>
    ${info ? `<div class="card">
      <div class="facts">
        <div class="fact"><span class="fact-label">Disponible</span><span class="fact-value big">${fmtNum(Math.max(0, info.stock))}</span><span class="subtle">${esc(qty(Math.max(0, info.stock), med.unit).split(' ').slice(1).join(' '))}</span></div>
        <div class="fact"><span class="fact-label">Días restantes</span><span class="fact-value big">${info.daysLeft == null ? '—' : info.daysLeft}</span><span class="subtle">${esc(info.daysLeft == null ? 'Estimación no disponible' : out ? `hasta el ${new Date(out).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} aprox.` : '')}</span></div>
      </div>
      ${meter(info, med)}
      <div class="tags" style="margin-top:10px"><span class="lvl ${info.level}">${LEVEL_LABEL[info.level]}</span></div>
      <div class="facts" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line)">
        <div class="fact"><span class="fact-label">Consumo previsto</span><span class="fact-value">${info.daily ? `${esc(qty(info.daily, med.unit))}/día` : 'No disponible'}</span></div>
        <div class="fact"><span class="fact-label">Reserva mínima</span><span class="fact-value">${esc(qty(med.minReserve || 0, med.unit))}</span></div>
        <div class="fact"><span class="fact-label">Avisos en</span><span class="fact-value">${(med.thresholds || []).length ? esc(med.thresholds.map(fmtNum).join(', ')) : '—'} · ${med.alertDays} días</span></div>
        <div class="fact"><span class="fact-label">Última reposición</span><span class="fact-value">${reps[0] ? new Date(reps[0].at).toLocaleDateString('es-ES') : med.lastRestockDate ? parseDayKey(med.lastRestockDate).toLocaleDateString('es-ES') : '—'}</span></div>
        <div class="fact wide"><span class="fact-label">Receta</span><span class="fact-value">${med.needsRx ? esc(RX[med.rxStatus]?.label || '') : 'No necesita receta'}</span></div>
      </div>
      <div class="rx-actions">
        <button class="btn btn-soft btn-sm" data-restock="${med.id}">${icons.plus({ size: 16 })} Registrar reposición</button>
        ${med.needsRx && !['solicitada', 'disponible'].includes(med.rxStatus) ? `<button class="btn btn-blue btn-sm" data-rx="${med.id}" data-rx-to="solicitada">${icons.receipt({ size: 16 })} SOLICITAR RECETA</button>` : ''}
        ${rxSelect(med)}
      </div>
      <p class="field-hint">Calculado con el recuento del ${new Date(med.stockSince).toLocaleDateString('es-ES')} (${esc(qty(med.stockInitial, med.unit))}), ${esc(qty(info.added, med.unit))} repuestos y ${esc(qty(info.used, med.unit))} tomados desde entonces.</p>
    </div>` : `<div class="card"><p class="subtle" style="margin:0">Este medicamento no lleva control de existencias. Puedes activarlo en Editar.</p></div>`}
    </section>

    ${reps.length ? `<section class="section" style="margin-top:22px"><div class="section-head"><h3 class="h-section">Historial de reposiciones</h3></div>
      <div class="card" style="padding:4px 16px"><ul class="list">${reps.map((r) => `<li><button class="row" data-restock-row="${r.id}">
        <span class="st realizada">${icons.plus({ size: 18 })}</span>
        <span class="row-main"><span class="row-title">+${esc(qty(r.quantity, med.unit))}</span><span class="row-sub">${new Date(r.at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })} · total ${esc(qty(r.totalAfter, med.unit))}</span>${r.notes ? `<div class="row-note">${esc(r.notes)}</div>` : ''}</span>
        <span class="row-chev">${icons.trash({ size: 16 })}</span></button></li>`).join('')}</ul></div></section>` : ''}

    <section class="section" style="margin-top:22px"><div class="section-head"><h3 class="h-section">Últimas tomas</h3><a class="link-btn" href="#historial" data-history-med="${med.id}">Ver historial</a></div>
      ${recent.length ? `<div class="card" style="padding:4px 16px"><ul class="list">${recent.map((i) => intakeRow({ intake: i, status: i.status })).join('')}</ul></div>` : '<p class="subtle">Todavía no hay tomas registradas.</p>'}</section>

    <div class="settings-group" style="margin-top:22px">
      <button class="settings-row" data-edit-med="${med.id}"><span class="ico">${icons.pencil({ size: 18 })}</span><span class="grow">Editar medicamento y existencias</span>${icons.right({ size: 16 })}</button>
      ${med.status === 'activo' ? `<button class="settings-row" data-med-status="pausado" data-id="${med.id}"><span class="ico">${icons.pause({ size: 18 })}</span><span class="grow">Pausar tratamiento</span></button>` : ''}
      ${med.status === 'pausado' ? `<button class="settings-row" data-med-status="activo" data-id="${med.id}"><span class="ico">${icons.play({ size: 18 })}</span><span class="grow">Reanudar tratamiento</span></button>` : ''}
      ${med.status !== 'finalizado' ? `<button class="settings-row" data-med-status="finalizado" data-id="${med.id}"><span class="ico">${icons.stop({ size: 18 })}</span><span class="grow">Finalizar tratamiento</span></button>` : `<button class="settings-row" data-med-status="activo" data-id="${med.id}"><span class="ico">${icons.play({ size: 18 })}</span><span class="grow">Volver a activar</span></button>`}
      ${med.frequency !== 'demanda' && med.status === 'activo' ? `<button class="settings-row" data-ics="${med.id}"><span class="ico">${icons.calendar({ size: 18 })}</span><span class="grow">Añadir al Calendario del iPhone<br><span class="subtle">Avisos aunque la app esté cerrada</span></span></button>` : ''}
      ${!med.archived ? `<button class="settings-row danger" data-archive="${med.id}"><span class="ico">${icons.archive({ size: 18 })}</span><span class="grow">Quitar de la lista<br><span class="subtle">El historial se conserva</span></span></button>` : ''}
    </div>`;
}

export function rxSelect(med) {
  return `<select class="select-inline" data-rx-select="${med.id}" aria-label="Cambiar estado de receta o reposición">
    ${Object.entries(RX).map(([id, r]) => `<option value="${id}" ${med.rxStatus === id ? 'selected' : ''}>${r.label}</option>`).join('')}</select>`;
}

let detailClose = null;
let detailId = null;
/** Abre la ficha; se redibuja sola cuando cambian los datos. */
export function openMedDetail(id) {
  const med = store.get('meds', id);
  if (!med) return;
  detailId = id;
  let unsub;
  detailClose = openSheet({
    label: medTitle(med),
    render(body) {
      body.closest('.sheet-root').dataset.global = '1'; // sus botones los atiende app.js
      const draw = () => {
        const m = store.get('meds', detailId);
        if (!m) return;
        const top = body.closest('.sheet').scrollTop;
        body.innerHTML = medDetailHTML(m);
        body.closest('.sheet').scrollTop = top;
      };
      draw();
      unsub = store.subscribe(draw);
    },
    onClose: () => { unsub?.(); detailClose = null; detailId = null; },
  });
}
export const closeMedDetail = () => detailClose?.();

/* ------------------------------------------------------------------ */
/* REPOSICIONES                                                          */
/* ------------------------------------------------------------------ */

const GROUPS = [
  ['low', 'Pocas existencias', ({ info }) => info && info.level !== 'verde'],
  ['needRx', 'Necesitan receta', ({ med }) => med.needsRx && med.rxStatus === 'pendiente_solicitar'],
  ['asked', 'Receta solicitada', ({ med }) => med.rxStatus === 'solicitada'],
  ['buy', 'Pendientes de recoger o comprar', ({ med }) => ['disponible', 'pendiente_compra'].includes(med.rxStatus)],
  ['done', 'Repuestos recientemente', ({ med }) => med.rxStatus === 'repuesto' && Date.now() - (med.rxStatusAt || 0) < 14 * 86400000],
];

function rxCard({ med, info }) {
  return `<article class="card rx-card">
    <div class="card-head"><span class="badge ${info?.level === 'rojo' ? 'crit' : info?.level === 'naranja' ? 'warn' : ''}">${icons.box({ size: 20 })}</span>
      <div class="grow"><button class="row-title" data-med="${med.id}" style="text-align:left">${esc(medTitle(med))}</button>
        <div class="subtle">${info ? `${esc(qty(Math.max(0, info.stock), med.unit))} · ${esc(daysLeftText(info))}` : 'Sin control de existencias'}</div></div></div>
    ${info ? meter(info, med) : ''}
    <div class="tags" style="margin-top:8px">${info ? `<span class="lvl ${info.level}">${LEVEL_LABEL[info.level]}</span>` : ''}<span class="pill ${med.rxStatus === 'pendiente_solicitar' ? 'warn' : med.rxStatus === 'repuesto' ? 'ok' : 'blue'}">${esc(RX[med.rxStatus]?.label || '')}</span></div>
    <div class="rx-actions">
      ${med.needsRx && !['solicitada', 'disponible'].includes(med.rxStatus) ? `<button class="btn btn-blue btn-sm" data-rx="${med.id}" data-rx-to="solicitada">${icons.receipt({ size: 16 })} SOLICITAR RECETA</button>` : ''}
      ${med.rxStatus === 'solicitada' ? `<button class="btn btn-ghost btn-sm" data-rx="${med.id}" data-rx-to="disponible">Receta disponible</button>` : ''}
      ${info ? `<button class="btn btn-soft btn-sm" data-restock="${med.id}">${icons.plus({ size: 16 })} Comprado / repuesto</button>` : ''}
      ${rxSelect(med)}
    </div>
  </article>`;
}

export function renderRestocks() {
  const items = listedMeds().filter((m) => m.status !== 'finalizado').map((med) => ({ med, info: infoFor(med) }));
  const seen = new Set();
  const groups = GROUPS.map(([id, label, test]) => {
    const list = items.filter((x) => !seen.has(x.med.id) && test(x));
    list.forEach((x) => seen.add(x.med.id));
    return { id, label, list };
  }).filter((g) => g.list.length);
  const ok = items.filter((x) => !seen.has(x.med.id));
  const history = restocks().slice().sort((a, b) => b.at - a.at).slice(0, 12);
  return `
  <header class="topbar"><a class="icon-btn" href="#medicamentos" aria-label="Volver a Medicamentos">${icons.left()}</a><h1 class="h-page" style="flex:1">Reposiciones</h1>${syncPill()}</header>
  ${offlineBar()}
  <p class="subtle" style="margin-top:0">Organiza recetas y compras. Los estados los cambias tú: MEDICINA no envía nada al médico ni a la farmacia.</p>
  ${groups.length ? groups.map((g) => `<section class="section" style="margin-top:20px"><div class="section-head"><h2 class="h-section">${g.label}</h2><span class="pill">${g.list.length}</span></div>${g.list.map(rxCard).join('')}</section>`).join('')
    : emptyState('stock', 'Nada que reponer', items.length ? 'Todos tus medicamentos tienen existencias suficientes.' : 'Añade medicamentos con control de existencias para verlos aquí.')}
  ${ok.length ? `<section class="section"><div class="section-head"><h2 class="h-section">Existencias suficientes</h2></div>
    <div class="card" style="padding:4px 16px"><ul class="list">${ok.map(({ med, info }) => `<li><button class="row" data-med="${med.id}"><span class="badge">${icons.box({ size: 18 })}</span>
      <span class="row-main"><span class="row-title">${esc(medTitle(med))}</span><span class="row-sub">${info ? `${esc(qty(Math.max(0, info.stock), med.unit))} · ${esc(daysLeftText(info))}` : 'Sin control de existencias'}</span></span><span class="row-chev">${icons.right({ size: 18 })}</span></button></li>`).join('')}</ul></div></section>` : ''}
  ${history.length ? `<section class="section"><div class="section-head"><h2 class="h-section">Últimas reposiciones</h2></div>
    <div class="card" style="padding:4px 16px"><ul class="list">${history.map((r) => `<li><div class="row"><span class="st realizada">${icons.plus({ size: 18 })}</span>
      <span class="row-main"><span class="row-title">${esc(r.medName)} · +${esc(fmtNum(r.quantity))}</span><span class="row-sub">${new Date(r.at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })} · total ${esc(fmtNum(r.totalAfter))}</span>${r.notes ? `<div class="row-note">${esc(r.notes)}</div>` : ''}</span><span></span></div></li>`).join('')}</ul></div></section>` : ''}`;
}

export { setRxStatus, statePill, durationText };
