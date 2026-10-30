// Arranque, navegación por pestañas y gestión de eventos de MEDICINA.
import { store, IDBAdapter } from './store.js';
import { SyncedAdapter } from './sync.js';
import { SupabaseRemote } from './remote-supabase.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { showAuth } from './auth.js';
import { account, LAST_USER, sessionStorageAdapter, getRemember, localDbName } from './account.js';
import { icons } from './art.js';
import { applyTheme } from './theme.js';
import { openSheet, shiftMonth, toast, confirmDialog, $, esc } from './ui.js';
import { dayKey, parseDayKey, addDays, toTimeInput } from './dates.js';
import { medTitle, qty } from './meds.js';
import { countdownText } from './schedule.js';
import { openMedForm, openIntakeForm, openRestockForm, openPdfForm } from './forms.js';
import { getMed, registerIntake, setRxStatus, setMedStatus, archiveMed, deleteRestock, checkStockAlerts, upcoming, attendAlert, attendAll, openAlerts, activeMeds } from './model.js';
import { dueDoseReminders, markShown, doseMessage, notifySystem, medsToICS } from './notify.js';
import { deliverFile } from './data-io.js';
import { renderHome } from './views/home.js';
import { renderMedicines, renderRestocks, openMedDetail, closeMedDetail } from './views/medicines.js';
import { renderHistory } from './views/history.js';
import { renderCalendar } from './views/calendar.js';
import { renderProfile, handleProfileEvent } from './views/profile.js';
import { syncState } from './views/common.js';

const TABS = {
  inicio: { label: 'Inicio', icon: icons.home, render: renderHome },
  medicamentos: { label: 'Medicamentos', icon: icons.capsule, render: renderMedicines },
  historial: { label: 'Historial', icon: icons.history, render: renderHistory },
  calendario: { label: 'Calendario', icon: icons.calendar, render: renderCalendar },
  perfil: { label: 'Perfil', icon: icons.user, render: renderProfile },
};
// Pantallas sin pestaña propia: se marcan bajo la pestaña indicada.
const SUBVIEWS = { reposiciones: { parent: 'medicamentos', render: renderRestocks } };

const ym = (key) => { const d = parseDayKey(key); return [d.getFullYear(), d.getMonth()]; };
const today0 = dayKey();
const state = {
  view: 'inicio',
  medsFilter: 'activo',
  histPeriod: 'all', histMonth: ym(today0), histYear: Number(today0.slice(0, 4)), histFrom: addDays(today0, -29), histTo: today0,
  histMed: '', histStatus: 'all', histLimit: 60,
  calMonth: ym(today0), calSelected: today0,
  today: today0,
};

/* ---------- Render ---------- */

function renderTabbar() {
  const active = SUBVIEWS[state.view]?.parent || state.view;
  $('#tabbar').innerHTML = `<div class="tabbar-inner" role="tablist">${Object.entries(TABS).map(([id, t]) =>
    `<a class="tab ${active === id ? 'on' : ''}" href="#${id}" role="tab" aria-selected="${active === id}" aria-current="${active === id ? 'page' : 'false'}">
      <span class="tab-ico">${t.icon({ size: 22 })}</span><span>${t.label}</span></a>`).join('')}</div>`;
}

function render() {
  const view = $('#view');
  const r = TABS[state.view]?.render || SUBVIEWS[state.view]?.render;
  // Mantener el foco y la posición si se está escribiendo en un campo de la vista.
  const focused = document.activeElement?.closest?.('#view') ? document.activeElement.name : null;
  view.innerHTML = r(state);
  view.setAttribute('aria-label', TABS[state.view]?.label || 'Reposiciones');
  if (focused) view.querySelector(`[name="${focused}"]`)?.focus({ preventScroll: true });
  renderTabbar();
}

function go(name) {
  if (!TABS[name] && !SUBVIEWS[name]) name = 'inicio';
  if (state.view === name) return;
  state.view = name;
  if (name === 'medicamentos' && !store.all('meds').some((m) => !m.archived && m.status === 'activo')) state.medsFilter = 'all';
  render();
  window.scrollTo({ top: 0 });
}

/* ---------- Acciones de toma ---------- */

async function quickRegister(medId, slot) {
  const med = getMed(medId);
  if (!med) return;
  const early = slot ? Number(slot) - Date.now() : 0;
  if (early > 60 * 60000) {
    const ok = await confirmDialog({
      title: 'Aún no es la hora',
      message: `La toma de ${medTitle(med)} está programada a las ${toTimeInput(Number(slot))} (faltan ${Math.round(early / 60000) >= 120 ? `${Math.floor(early / 3600000)} h` : `${Math.round(early / 60000)} min`}). Regístrala solo si ya la has tomado.`,
      confirmLabel: 'Ya la he tomado', danger: false,
    });
    if (!ok) return;
  }
  await registerIntake(med, slot ? { scheduledAt: Number(slot) } : {});
}

/** Opciones de una toma prevista: registrar ahora, con otra hora, u omitir. */
function slotMenu(medId, at) {
  const med = getMed(medId);
  if (!med) return;
  const slot = Number(at);
  if (slot > Date.now() + 15 * 60000) return openMedDetail(medId);
  openSheet({
    label: 'Toma prevista',
    render(body, close) {
      body.innerHTML = `<div class="sheet-head"><div class="grow"><span class="eyebrow">Toma prevista · ${toTimeInput(slot)}</span><h2 class="h-section">${esc(medTitle(med))}</h2><div class="subtle">${esc(qty(med.dose, med.unit))}</div></div>
          <button class="icon-btn" data-close aria-label="Cerrar">${icons.close()}</button></div>
        <div class="form-actions">
          <button class="btn btn-primary btn-block" data-a="now">${icons.check({ size: 20 })} Registrar toma ahora</button>
          <button class="btn btn-ghost btn-block" data-a="other">${icons.clock({ size: 18 })} La tomé a otra hora</button>
          <button class="btn btn-ghost btn-block" data-a="skip">${icons.skip({ size: 18 })} Marcar como omitida</button>
          <button class="btn btn-danger btn-block" data-a="detail">Ver ficha del medicamento</button>
        </div>
        <p class="disclaimer">${icons.shield({ size: 14 })} Registra solo lo que realmente has tomado. Si has olvidado una toma, no la dupliques.</p>`;
      body.addEventListener('click', async (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (!a) return;
        close();
        if (a === 'now') await registerIntake(med, { scheduledAt: slot });
        if (a === 'other') openIntakeForm({ medId: med.id, at: Math.min(slot, Date.now()), scheduledAt: slot });
        if (a === 'skip') await registerIntake(med, { status: 'omitida', quantity: 0, at: Math.min(slot, Date.now()), scheduledAt: slot });
        if (a === 'detail') openMedDetail(med.id);
      });
    },
  });
}

function addICS(list) {
  if (!list.length) return;
  deliverFile(`MEDICINA-${list.length === 1 ? medTitle(list[0]).replace(/[^\wÀ-ÿ-]+/g, '-') : 'tomas'}.ics`, medsToICS(list), 'text/calendar');
}

/* ---------- Eventos ---------- */

document.addEventListener('click', async (e) => {
  // Las hojas gestionan sus clics, salvo las marcadas como "globales" (ficha del medicamento).
  if (e.target.closest('.sheet-root:not([data-global]), .dialog-root')) return;
  const t = e.target;
  const inSheet = Boolean(t.closest('.sheet-root'));

  if (state.view === 'perfil' && !inSheet && await handleProfileEvent(e)) return;

  const action = t.closest('[data-action]')?.dataset.action;
  if (action) {
    const actions = {
      'add-med': () => openMedForm(),
      'add-intake': () => openIntakeForm(),
      'add-intake-day': () => openIntakeForm({ at: state.calSelected === dayKey() ? Date.now() : parseDayKey(state.calSelected).getTime() + 12 * 3600000 }),
      pdf: () => openPdfForm({ medId: state.histMed }),
      'hist-more': () => { state.histLimit += 60; render(); },
      'cal-today': () => { state.calSelected = dayKey(); state.calMonth = ym(dayKey()); render(); },
      'attend-all': attendAll,
      'sync-info': () => { const s = syncState(); toast(s.detail, { kind: s.cls === 'warn' || s.cls === 'crit' ? 'warn' : 'ok', ms: 4000 }); },
    };
    return actions[action]?.();
  }

  const reg = t.closest('[data-register]');
  if (reg) { reg.disabled = true; await quickRegister(reg.dataset.register, reg.dataset.slot); reg.disabled = false; return; }
  const menu = t.closest('[data-slot-menu]');
  if (menu) return slotMenu(menu.dataset.slotMenu, menu.dataset.slot);
  const slot = t.closest('[data-slot-med]');
  if (slot) return slotMenu(slot.dataset.slotMed, slot.dataset.slotAt);
  const intake = t.closest('[data-intake]');
  if (intake) { const rec = store.get('intakes', intake.dataset.intake); if (rec) openIntakeForm({ record: rec }); return; }
  const other = t.closest('[data-intake-other]');
  if (other) return openIntakeForm({ medId: other.dataset.intakeOther });
  const restock = t.closest('[data-restock]');
  if (restock) { const m = getMed(restock.dataset.restock); if (m) openRestockForm(m); return; }
  const rrow = t.closest('[data-restock-row]');
  if (rrow) { const r = store.get('restocks', rrow.dataset.restockRow); if (r) await deleteRestock(r); return; }
  const rx = t.closest('[data-rx]');
  if (rx) { const m = getMed(rx.dataset.rx); if (m) await setRxStatus(m, rx.dataset.rxTo); return; }
  const pdfMed = t.closest('[data-pdf-med]');
  if (pdfMed) return openPdfForm({ medId: pdfMed.dataset.pdfMed });
  const edit = t.closest('[data-edit-med]');
  if (edit) { const m = getMed(edit.dataset.editMed); if (m) openMedForm({ med: m }); return; }
  const st = t.closest('[data-med-status]');
  if (st) {
    const m = getMed(st.dataset.id);
    const to = st.dataset.medStatus;
    if (m && to === 'finalizado') {
      const ok = await confirmDialog({ title: 'Finalizar tratamiento', message: `${medTitle(m)} dejará de generar tomas y avisos. Su historial se conserva.`, confirmLabel: 'Finalizar', danger: false });
      if (!ok) return;
    }
    if (m) await setMedStatus(m, to);
    return;
  }
  const ics = t.closest('[data-ics]');
  if (ics) { const m = getMed(ics.dataset.ics); if (m) addICS([m]); return; }
  const arch = t.closest('[data-archive]');
  if (arch) { const m = getMed(arch.dataset.archive); if (m && await archiveMed(m)) closeMedDetail(); return; }
  const hm = t.closest('[data-history-med]');
  if (hm) { state.histMed = hm.dataset.historyMed; state.histPeriod = 'all'; closeMedDetail(); return; }
  const attend = t.closest('[data-attend]');
  if (attend) { const a = store.get('alerts', attend.dataset.attend); if (a) await attendAlert(a); return; }
  const med = t.closest('[data-med]');
  if (med) return openMedDetail(med.dataset.med);

  if (inSheet) return;
  const mf = t.closest('[data-meds-filter]');
  if (mf) { state.medsFilter = mf.dataset.medsFilter; return render(); }
  // Historial
  const hp = t.closest('[data-hist-period]');
  if (hp) { state.histPeriod = hp.dataset.histPeriod; state.histLimit = 60; return render(); }
  const hs = t.closest('[data-hist-step]');
  if (hs) {
    const d = Number(hs.dataset.histStep);
    if (state.histPeriod === 'month') state.histMonth = shiftMonth(...state.histMonth, d);
    else state.histYear += d;
    return render();
  }
  // Calendario
  if (state.view === 'calendario') {
    const mb = t.closest('[data-month]');
    if (mb) { state.calMonth = shiftMonth(...state.calMonth, Number(mb.dataset.month)); return render(); }
    const db = t.closest('[data-day]');
    if (db) { state.calSelected = db.dataset.day; state.calMonth = ym(db.dataset.day); return render(); }
  }
});

document.addEventListener('change', async (e) => {
  if (e.target.closest('.sheet-root:not([data-global]), .dialog-root')) return;
  const t = e.target;
  if (state.view === 'perfil' && !t.closest('.sheet-root') && await handleProfileEvent(e)) return;
  if (t.dataset.rxSelect) { const m = getMed(t.dataset.rxSelect); if (m) await setRxStatus(m, t.value); return; }
  const map = {
    'hist-med': () => { state.histMed = t.value; },
    'hist-status': () => { state.histStatus = t.value; },
    'hist-from': () => { if (t.value) state.histFrom = t.value; if (state.histTo < state.histFrom) state.histTo = state.histFrom; },
    'hist-to': () => { if (t.value) state.histTo = t.value; if (state.histTo < state.histFrom) state.histFrom = state.histTo; },
  };
  if (map[t.name]) { map[t.name](); state.histLimit = 60; render(); }
});

window.addEventListener('hashchange', () => { if (started) go(location.hash.slice(1)); });

/* ---------- Relojes, avisos de toma y cambio de día ---------- */

let reminderOpen = false;
async function checkDoseReminders() {
  if (store.settings.notifyDoses === false) return;
  const due = dueDoseReminders(upcoming());
  if (!due.length) return;
  markShown(due.map((d) => d.key));
  for (const d of due) notifySystem(`Hora de tu medicación: ${medTitle(d.med)}`, doseMessage(d), `toma-${d.key}`);
  if (reminderOpen || document.querySelector('.dialog-root')) return;
  reminderOpen = true;
  const first = due[0];
  const ok = await confirmDialog({
    title: due.length === 1 ? `Toma de ${medTitle(first.med)}` : `${due.length} tomas`,
    message: due.map((d) => `• ${medTitle(d.med)}: ${doseMessage(d)}`).join('\n') + '\n\nRegístrala cuando la hayas tomado.',
    confirmLabel: due.length === 1 ? 'Ya la he tomado · Registrar' : 'Ir a Inicio', cancelLabel: 'Más tarde', danger: false,
  });
  reminderOpen = false;
  if (ok && due.length === 1) await registerIntake(first.med, { scheduledAt: first.at });
  else if (ok) location.hash = 'inicio';
}

function tick() {
  if (!started) return;
  const now = Date.now();
  document.querySelectorAll('[data-countdown]').forEach((el) => { el.textContent = countdownText(Number(el.dataset.countdown), now, store.settings.toleranceMin); });
  checkDoseReminders();
  const d = dayKey(now);
  if (d !== state.today) {
    if (state.calSelected === state.today) { state.calSelected = d; state.calMonth = ym(d); }
    state.today = d;
    checkStockAlerts();
  }
}
let minuteRender = 0;
setInterval(() => {
  tick();
  if (started && ++minuteRender % 2 === 0 && !document.querySelector('.sheet-root, .dialog-root') && !document.activeElement?.closest?.('#view input, #view select')) render();
}, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && started) { render(); tick(); } });
addEventListener('online', () => started && render());
addEventListener('offline', () => started && render());

/* ---------- Arranque ---------- */

let started = false;

function fail(e) {
  console.error(e);
  const v = $('#view');
  v.hidden = false;
  v.innerHTML = `<div class="empty"><div class="empty-title">No se pudo abrir MEDICINA</div><div class="empty-sub">${esc(e.message)}</div></div>`;
}

function start() {
  store.subscribe(() => { if (started) render(); });
  state.view = TABS[location.hash.slice(1)] || SUBVIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'inicio';
  if (!activeMeds().length) state.medsFilter = 'all';
  started = true;
  $('#view').hidden = false;
  render();
  setTimeout(() => { checkStockAlerts(); tick(); }, 1200);
  document.documentElement.classList.add('ready');
}

function registerSW() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      // Busca versiones nuevas cada vez que se vuelve a la app.
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch((err) => console.warn('SW', err));
    // Cuando llega una versión nueva de la app, se recarga sola (salvo con un formulario abierto).
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      const go = () => { if (reloading) return; reloading = true; location.reload(); };
      if (!document.querySelector('.sheet-root, .dialog-root')) go();
      else document.addEventListener('visibilitychange', () => { if (document.hidden) go(); }, { once: true });
    });
  }
}

/* Modo cuenta: usuario y contraseña con Supabase, datos en la nube. */
async function bootSupabase() {
  const client = globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: sessionStorageAdapter },
  });
  account.client = client;
  const authRoot = $('#auth');
  let recovering = false;
  client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      recovering = true;
      $('#view').hidden = true;
      showAuth(authRoot, client, { mode: 'recovery', onSession: (s) => (started ? location.reload() : enter(s)) });
    }
  });

  let session = null;
  try { session = (await client.auth.getSession()).data.session; } catch (e) { console.warn(e); }
  if (recovering) return;
  if (session) return enter(session);

  // Sin red pero con una sesión anterior en este dispositivo: abrir los datos
  // guardados en local; se subirán en cuanto vuelva la conexión.
  const last = readLastUser();
  if (last && getRemember() && navigator.onLine === false) return enter({ user: last }, { offline: true });
  let notice = '';
  try {
    const p = new URLSearchParams(location.search);
    if (p.get('cuenta') === 'eliminada') notice = 'Tu cuenta y todos sus datos se han eliminado.';
    if (p.has('cuenta')) history.replaceState(null, '', location.pathname + location.hash);
  } catch { /* nada */ }
  $('#view').hidden = true;
  showAuth(authRoot, client, { mode: 'login', notice, onSession: enter });
}

async function enter(session, { offline = false } = {}) {
  const user = { id: session.user.id, email: session.user.email };
  account.user = user;
  try { if (getRemember()) localStorage.setItem(LAST_USER, JSON.stringify(user)); } catch { /* sin almacenamiento */ }
  const adapter = new SyncedAdapter(new IDBAdapter(localDbName(user.id)), new SupabaseRemote(account.client, user.id));
  try { await store.init({ adapter, backend: 'supabase' }); } catch (e) { return fail(e); }
  start();
  registerSW();
  if (offline) toast('Sin conexión: lo que registres se subirá a la nube al volver la red.', { kind: 'warn', ms: 4000 });
}

function readLastUser() {
  try { return JSON.parse(localStorage.getItem(LAST_USER) || 'null'); } catch { return null; }
}

async function boot() {
  applyTheme();
  if (SUPABASE_URL && SUPABASE_ANON_KEY && globalThis.supabase?.createClient) return bootSupabase();
  // Modo local (sin nube): para probar la app antes de configurar Supabase.
  try { await store.init(); } catch (e) { return fail(e); }
  start();
  if (store.backend === 'memory') toast('Este navegador no permite guardar datos. Usa Safari normal, no privado.', { kind: 'warn', ms: 5000 });
  registerSW();
}

boot();

// Para pruebas automáticas y depuración desde la consola.
globalThis.__medicina = { store, state, openAlerts };
