// INICIO: saludo, resumen del día, PRÓXIMA TOMA, tomas de hoy, medicación por
// reponer y avisos de existencias.
import { store } from '../store.js';
import { icons, logo, scene, capsuleMark } from '../art.js';
import { esc } from '../ui.js';
import { dayKey, fmtLongDate, parseDayKey, addDays, toTimeInput } from '../dates.js';
import { qty, medTitle } from '../meds.js';
import { countdownText, slotStatuses } from '../schedule.js';
import { daysLeftText, LEVEL_LABEL } from '../stock.js';
import { activeMeds, intakes, upcoming, needingAttention, openAlerts } from '../model.js';
import { account } from '../account.js';
import { syncPill, offlineBar, intakeRow, emptyState, meter, rxPill } from './common.js';

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}

/** Tomas previstas y registradas de hoy, en orden. */
export function todaySlots(now = Date.now()) {
  const from = parseDayKey(dayKey(now)).getTime();
  const to = parseDayKey(addDays(dayKey(now), 1)).getTime();
  const tol = store.settings.toleranceMin;
  const planned = store.all('meds').flatMap((m) => slotStatuses(m, intakes(), from, to, { now, toleranceMin: tol }));
  const covered = new Set(planned.filter((s) => s.intake).map((s) => s.intake.id));
  const loose = intakes().filter((i) => i.at >= from && i.at < to && !covered.has(i.id))
    .map((i) => ({ intake: i, at: i.at, status: i.status, late: false }));
  return [...planned, ...loose].sort((a, b) => (a.intake?.at ?? a.at) - (b.intake?.at ?? b.at));
}

export function renderHome(state) {
  const now = Date.now();
  const name = (store.settings.displayName || '').trim();
  const active = activeMeds();
  const today = todaySlots(now);
  const doneToday = today.filter((s) => s.status === 'realizada').length;
  const pendingToday = today.filter((s) => s.status === 'pendiente' || s.status === 'retrasada').length;
  const doses = upcoming(now);
  const next = doses[0];
  const attention = needingAttention();
  const low = attention.filter((a) => a.info && a.info.level !== 'verde').length;
  const alertsOpen = openAlerts();

  const nextCard = next ? (() => {
    const others = doses.filter((d) => d !== next && Math.abs(d.at - next.at) < 60000);
    return `<section class="card next ${next.late ? 'late' : ''}" aria-label="Próxima toma">
      <span class="next-deco">${capsuleMark(120)}</span>
      <span class="eyebrow">${next.late ? 'Toma retrasada' : 'Próxima toma'}</span>
      <div class="next-name">${esc(medTitle(next.med))}</div>
      <div class="next-qty">${esc(qty(next.med.dose, next.med.unit))}</div>
      <div class="next-row">
        <div><span class="k">Hora programada</span><span class="v">${toTimeInput(next.at)}${dayKey(next.at) !== dayKey(now) ? ` · ${dayKey(next.at) === addDays(dayKey(now), 1) ? 'mañana' : fmtLongDate(dayKey(next.at))}` : ''}</span></div>
        <div><span class="k">Tiempo restante</span><span class="v" data-countdown="${next.at}">${countdownText(next.at, now, store.settings.toleranceMin)}</span></div>
      </div>
      <div class="next-actions">
        <button class="btn btn-light btn-block" data-register="${next.med.id}" data-slot="${next.at}">${icons.check({ size: 20 })} REGISTRAR TOMA</button>
        <button class="btn btn-outline-light" data-slot-menu="${next.med.id}" data-slot="${next.at}" aria-label="Otras opciones: otra hora u omitir">Más</button>
      </div>
      ${others.length ? `<div class="next-more">A la misma hora: ${others.map((d) => esc(medTitle(d.med))).join(', ')}</div>` : ''}
    </section>
    ${next.late ? `<p class="disclaimer">${icons.shield({ size: 14 })} Si has olvidado una toma, no la dupliques. Ante dudas, consulta a tu médico o farmacéutico.</p>` : ''}`;
  })() : `<section class="card"><div class="card-head"><span class="badge">${icons.clock()}</span><div class="grow">
      <div class="eyebrow">Próxima toma</div>
      <div style="font-weight:600;margin-top:2px">${active.length ? 'No hay tomas programadas pendientes' : 'Aún no tienes medicamentos'}</div>
      <div class="subtle">${active.length ? 'Los medicamentos sin horario se registran cuando los tomas.' : 'Añade tu primer medicamento para ver aquí tu próxima toma.'}</div></div></div>
      ${active.length ? '' : '<button class="btn btn-primary btn-block" data-action="add-med" style="margin-top:14px">Añadir medicamento</button>'}
    </section>`;

  const restockCard = `<section class="section">
    <div class="section-head"><h2 class="h-section">MEDICACIÓN POR REPONER</h2><a class="link-btn" href="#reposiciones">Ver todo ${icons.right({ size: 16 })}</a></div>
    ${attention.length ? `<div class="card" style="padding:6px 18px"><ul class="list">${attention.slice(0, 4).map(({ med, info }) => `<li><button class="row" data-med="${med.id}">
        <span class="badge ${info?.level === 'rojo' ? 'crit' : info?.level === 'naranja' ? 'warn' : 'blue'}">${icons.box({ size: 20 })}</span>
        <span class="row-main"><span class="row-title">${esc(medTitle(med))}</span>
          <span class="row-sub">${info ? `${esc(qty(Math.max(0, info.stock), med.unit))} · ${esc(daysLeftText(info))}` : 'Sin control de existencias'}</span>
          ${info ? meter(info, med) : ''}
          <span class="tags">${info ? `<span class="lvl ${info.level}">${LEVEL_LABEL[info.level]}</span>` : ''}${rxPill(med)}</span></span>
        <span class="row-chev">${icons.right({ size: 18 })}</span></button></li>`).join('')}</ul></div>`
      : `<div class="card"><div class="card-head"><span class="badge">${icons.check()}</span><div class="grow"><div style="font-weight:600">Todo en orden</div><div class="subtle">Ningún medicamento necesita reposición por ahora.</div></div></div></div>`}
  </section>`;

  const alertsCard = alertsOpen.length ? `<section class="section">
    <div class="section-head"><h2 class="h-section">Avisos</h2><button class="link-btn" data-action="attend-all">Marcar como atendidos</button></div>
    <div class="card" style="padding:4px 18px">${alertsOpen.slice(0, 3).map((a) => `<div class="alert-row"><span class="badge ${a.level === 'rojo' ? 'crit' : 'warn'}">${icons.bell({ size: 18 })}</span>
      <div><p>${esc(a.message)}</p><button class="link-btn" data-attend="${a.id}">Atendido</button></div></div>`).join('')}</div></section>` : '';

  return `
  <header class="topbar">${logo()}<div class="topbar-end">${syncPill()}</div></header>
  ${offlineBar()}
  <div class="hero"><div class="hero-text">
    <h1 class="h-display">${greeting()}${name ? `, ${esc(name)}` : ''}</h1>
    <p class="date-line">${fmtLongDate(dayKey(now), { year: true })}</p></div>
    ${scene('welcome', { width: 132 })}</div>
  <div class="stats">
    <a class="stat" href="#medicamentos"><div class="num">${active.length}</div><div class="lbl">Medicamentos activos</div></a>
    <a class="stat" href="#calendario"><div class="num">${doneToday}</div><div class="lbl">Tomas realizadas hoy</div></a>
    <a class="stat ${pendingToday ? 'warn' : ''}" href="#calendario"><div class="num">${pendingToday}</div><div class="lbl">Pendientes hoy</div></a>
  </div>
  ${nextCard}
  ${alertsCard}
  ${low ? `<div class="note-box warn">${icons.box({ size: 18 })}<span>${low === 1 ? 'Un medicamento tiene' : `${low} medicamentos tienen`} pocas existencias.</span></div>` : ''}
  ${restockCard}
  <section class="section">
    <div class="section-head"><h2 class="h-section">Tomas de hoy</h2><button class="link-btn" data-action="add-intake">+ Registrar</button></div>
    ${today.length ? `<div class="card" style="padding:4px 16px"><ul class="list">${today.map(intakeRow).join('')}</ul></div>`
      : emptyState('history', 'Sin tomas para hoy', active.length ? 'Las tomas que registres hoy aparecerán aquí.' : 'Cuando añadas medicamentos, verás aquí las tomas del día.')}
  </section>
  <p class="foot">${account.user?.email ? esc(account.user.email) : ''}</p>`;
}
