// PERFIL: cuenta, contraseña, preferencias, notificaciones, umbrales,
// apariencia, exportación y copias, privacidad, cierre de sesión y eliminación.
import { store, TYPES } from '../store.js';
import { icons, logo } from '../art.js';
import { esc, openSheet, toast, confirmDialog, $ } from '../ui.js';
import { account, signOut, changePassword, deleteAccount, getRemember, setRemember } from '../account.js';
import { authMessage, MIN_PASSWORD } from '../auth.js';
import { THEMES, getTheme, setTheme } from '../theme.js';
import { REMINDERS } from '../meds.js';
import { notifyPermission, requestNotifications, isStandalone, medsToICS } from '../notify.js';
import { intakesToCSV, toBackup, parseBackup, mergeRecords, deliverFile } from '../data-io.js';
import { activeMeds } from '../model.js';
import { syncPill, syncState } from './common.js';
import { avatarFromFile, avatarHTML } from '../photo.js';
import { dayKey } from '../dates.js';

export const APP_VERSION = '1.1.0';

function notifRow() {
  const p = notifyPermission();
  if (p === 'granted') return `<div class="settings-row"><span class="ico">${icons.bell({ size: 18 })}</span><span class="grow">Notificaciones permitidas<br><span class="subtle">Avisos de toma y de existencias mientras la app está abierta</span></span><span class="pill ok">Activadas</span></div>`;
  if (p === 'denied') return `<div class="settings-row"><span class="ico">${icons.bell({ size: 18 })}</span><span class="grow">Notificaciones bloqueadas<br><span class="subtle">Actívalas en Ajustes del iPhone → Notificaciones → MEDICINA</span></span></div>`;
  if (p === 'unsupported' || !isStandalone()) return `<div class="settings-row"><span class="ico">${icons.bell({ size: 18 })}</span><span class="grow">Notificaciones del sistema<br><span class="subtle">En iPhone necesitas iOS 16.4 o posterior y abrir MEDICINA desde su icono de la pantalla de inicio</span></span></div>`;
  return `<button class="settings-row" data-pf="notif-ask"><span class="ico">${icons.bell({ size: 18 })}</span><span class="grow"><strong>Permitir notificaciones</strong><br><span class="subtle">El iPhone te pedirá permiso</span></span>${icons.right({ size: 16 })}</button>`;
}

export function renderProfile() {
  const s = store.settings;
  const sync = syncState();
  const email = account.user?.email;
  return `
  <header class="topbar"><h1 class="h-page">Perfil</h1><div class="topbar-end">${syncPill()}</div></header>

  <div class="profile-head">
    <label class="avatar-pick" aria-label="Cambiar foto de perfil">${avatarHTML({ photo: s.photo, name: s.displayName, email }, 96)}
      <span class="avatar-edit">${icons.pencil({ size: 14 })}</span>
      <input type="file" name="pf-photo" accept="image/*" hidden></label>
    <div class="profile-name">${esc(s.displayName || (email ? email.split('@')[0] : 'Tu perfil'))}</div>
    <div class="subtle">${email ? esc(email) : 'Modo local (sin cuenta)'}</div>
    <div class="photo-actions"><label class="btn btn-soft btn-sm">${icons.upload({ size: 16 })} ${s.photo ? 'Cambiar foto' : 'Añadir foto'}<input type="file" name="pf-photo" accept="image/*" hidden></label>
      ${s.photo ? '<button class="btn btn-ghost btn-sm" data-pf="photo-remove">Quitar</button>' : ''}</div>
  </div>
  <div class="settings-group">
    <div class="settings-row"><span class="ico">${icons.user({ size: 18 })}</span><span class="grow">${email ? esc(email) : 'Modo local (sin cuenta)'}<br><span class="subtle">${email ? 'Correo de la cuenta' : 'Configura Supabase para tener cuenta y copia en la nube'}</span></span></div>
    <label class="settings-row"><span class="ico">${icons.note({ size: 18 })}</span><span class="grow">Nombre para el saludo</span><input type="text" name="pf-name" value="${esc(s.displayName || '')}" maxlength="30" placeholder="Opcional"></label>
    ${email ? `<button class="settings-row" data-pf="password"><span class="ico">${icons.lock({ size: 18 })}</span><span class="grow">Cambiar contraseña</span>${icons.right({ size: 16 })}</button>
    <label class="settings-row"><span class="ico">${icons.shield({ size: 18 })}</span><span class="grow">Mantener la sesión iniciada<br><span class="subtle">En este dispositivo</span></span><input type="checkbox" class="switch" name="pf-remember" ${getRemember() ? 'checked' : ''}></label>` : ''}
  </div>

  <section class="section"><div class="eyebrow">Sincronización</div>
  <div class="settings-group">
    <div class="settings-row"><span class="ico">${icons.cloud({ size: 18 })}</span><span class="grow"><strong>${esc(sync.label)}</strong><br><span class="subtle">${esc(sync.detail)}</span></span></div>
    ${store.sync ? `<button class="settings-row" data-pf="sync-now"><span class="ico">${icons.refresh({ size: 18 })}</span><span class="grow">Sincronizar ahora</span></button>` : ''}
  </div></section>

  <section class="section"><div class="eyebrow">Notificaciones y avisos</div>
  <div class="settings-group">
    ${notifRow()}
    <label class="settings-row"><span class="ico">${icons.clock({ size: 18 })}</span><span class="grow">Avisos de toma<br><span class="subtle">Con la app abierta</span></span><input type="checkbox" class="switch" name="pf-notify-doses" ${s.notifyDoses !== false ? 'checked' : ''}></label>
    <label class="settings-row"><span class="ico">${icons.box({ size: 18 })}</span><span class="grow">Avisos de pocas existencias</span><input type="checkbox" class="switch" name="pf-notify-stock" ${s.notifyStock !== false ? 'checked' : ''}></label>
    <label class="settings-row"><span class="ico">${icons.bell({ size: 18 })}</span><span class="grow">Aviso por defecto<br><span class="subtle">Para medicamentos nuevos</span></span>
      <select name="pf-reminder">${REMINDERS.map(([v, l]) => `<option value="${v ?? ''}" ${(s.defaultReminder ?? '') === (v ?? '') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="settings-row"><span class="ico">${icons.alert({ size: 18 })}</span><span class="grow">Retrasada a partir de<br><span class="subtle">Minutos tras la hora prevista</span></span><input type="number" name="pf-tolerance" min="5" max="180" value="${esc(s.toleranceMin)}"></label>
    ${activeMeds().some((m) => m.frequency !== 'demanda') ? `<button class="settings-row" data-pf="ics-all"><span class="ico">${icons.calendar({ size: 18 })}</span><span class="grow"><strong>Añadir todas las tomas al Calendario del iPhone</strong><br><span class="subtle">Avisan aunque la app esté cerrada</span></span>${icons.right({ size: 16 })}</button>` : ''}
  </div>
  <p class="field-hint" style="padding:0 6px">Con la app cerrada, iOS solo avisa mediante el Calendario. No dependas solo de las notificaciones para tratamientos importantes.</p></section>

  <section class="section"><div class="eyebrow">Umbrales por defecto (medicamentos nuevos)</div>
  <div class="settings-group">
    <label class="settings-row"><span class="ico">${icons.sliders({ size: 18 })}</span><span class="grow">Avisar cuando queden</span><input type="text" name="pf-thresholds" value="${esc((s.defaultThresholds || []).join(', '))}" inputmode="decimal"></label>
    <label class="settings-row"><span class="ico">${icons.box({ size: 18 })}</span><span class="grow">Reserva mínima</span><input type="number" name="pf-min" min="0" value="${esc(s.defaultMinReserve)}"></label>
    <label class="settings-row"><span class="ico">${icons.calendar({ size: 18 })}</span><span class="grow">Días de antelación</span><input type="number" name="pf-days" min="0" max="60" value="${esc(s.defaultAlertDays)}"></label>
  </div></section>

  <section class="section"><div class="eyebrow">Apariencia</div>
  <div class="settings-group"><div class="settings-row" style="display:block"><div class="segmented" role="radiogroup" aria-label="Apariencia">
    ${THEMES.map(([id, l]) => `<button role="radio" aria-checked="${getTheme() === id}" class="${getTheme() === id ? 'on' : ''}" data-theme-set="${id}">${l}</button>`).join('')}</div></div></div></section>

  <section class="section"><div class="eyebrow">Exportación y copias</div>
  <div class="settings-group">
    <button class="settings-row" data-action="pdf"><span class="ico">${icons.pdf({ size: 18 })}</span><span class="grow"><strong>Exportar informe PDF</strong></span>${icons.right({ size: 16 })}</button>
    <button class="settings-row" data-pf="csv"><span class="ico">${icons.download({ size: 18 })}</span><span class="grow">Exportar historial (CSV)<br><span class="subtle">Para Numbers o Excel</span></span></button>
    <button class="settings-row" data-pf="backup"><span class="ico">${icons.download({ size: 18 })}</span><span class="grow">Crear copia de seguridad</span></button>
    <label class="settings-row"><span class="ico">${icons.upload({ size: 18 })}</span><span class="grow">Restaurar copia<br><span class="subtle">Se fusiona sin duplicados</span></span><input type="file" name="pf-restore" accept="application/json,.json" hidden></label>
  </div></section>

  <section class="section"><div class="eyebrow">Privacidad</div>
  <div class="settings-group">
    <button class="settings-row" data-pf="privacy"><span class="ico">${icons.shield({ size: 18 })}</span><span class="grow">Privacidad y protección de datos</span>${icons.right({ size: 16 })}</button>
  </div></section>

  ${email ? `<section class="section"><div class="eyebrow">Cuenta</div>
  <div class="settings-group">
    <button class="settings-row" data-pf="logout"><span class="ico">${icons.logout({ size: 18 })}</span><span class="grow">Cerrar sesión</span></button>
    <button class="settings-row danger" data-pf="delete"><span class="ico">${icons.trash({ size: 18 })}</span><span class="grow">Eliminar cuenta<br><span class="subtle">Borra la cuenta y todos sus datos</span></span></button>
  </div></section>` : ''}

  <div class="foot">${logo()}<br>Versión ${APP_VERSION} · Registro personal de medicación.<br>No sustituye la indicación de un profesional sanitario.</div>`;
}

/* ---------- Acciones ---------- */

function openPassword() {
  openSheet({
    label: 'Cambiar contraseña',
    render(body, close) {
      body.innerHTML = `<form novalidate><div class="sheet-head"><h2 class="h-section">Cambiar contraseña</h2><button type="button" class="icon-btn" data-close aria-label="Cerrar">${icons.close()}</button></div>
        <div class="field"><div class="field-label"><span class="eyebrow">Contraseña actual</span></div><div class="input-shell"><input type="password" name="cur" autocomplete="current-password"></div></div>
        <div class="field"><div class="field-label"><span class="eyebrow">Contraseña nueva</span></div><div class="input-shell"><input type="password" name="next" autocomplete="new-password" minlength="${MIN_PASSWORD}"></div></div>
        <div class="field"><div class="field-label"><span class="eyebrow">Repite la nueva</span></div><div class="input-shell"><input type="password" name="rep" autocomplete="new-password"></div></div>
        <p class="form-error" role="alert"></p>
        <div class="form-actions"><button class="btn btn-primary btn-block" type="submit">Guardar contraseña</button></div></form>`;
      const f = $('form', body);
      const err = $('.form-error', body);
      f.onsubmit = async (e) => {
        e.preventDefault();
        if (f.next.value.length < MIN_PASSWORD) { err.textContent = `Mínimo ${MIN_PASSWORD} caracteres.`; return; }
        if (f.next.value !== f.rep.value) { err.textContent = 'Las contraseñas no coinciden.'; return; }
        const b = $('button[type="submit"]', f); b.disabled = true;
        try { await changePassword(f.cur.value, f.next.value); close(); toast('Contraseña cambiada'); }
        catch (ex) { err.textContent = authMessage(ex); b.disabled = false; }
      };
    },
  });
}

function openPrivacy() {
  openSheet({
    label: 'Privacidad',
    render(body) {
      body.innerHTML = `<div class="sheet-head"><h2 class="h-section">Privacidad y protección de datos</h2><button type="button" class="icon-btn" data-close aria-label="Cerrar">${icons.close()}</button></div>
      <div class="prose">
        <p>Tus datos de medicación son datos de salud, una categoría especialmente protegida por el RGPD y la Ley Orgánica 3/2018 (LOPDGDD). MEDICINA los trata así:</p>
        <h4>Qué se guarda</h4><p>Tu correo, tus medicamentos y pautas, las tomas que registras, las reposiciones, los avisos y tus preferencias. Nada más: no hay analíticas, publicidad ni seguimiento.</p>
        <h4>Dónde</h4><p>En tu iPhone (para que funcione sin conexión) y en tu proyecto de Supabase (base de datos cifrada en tránsito con HTTPS). Cada cuenta solo puede ver sus propios datos gracias a las reglas de seguridad por filas.</p>
        <h4>Quién lo ve</h4><p>Solo tu cuenta. La app no comparte nada con médicos, farmacias ni terceros. Los informes PDF y las copias solo salen del iPhone si tú los compartes.</p>
        <h4>Tus derechos</h4><p>Puedes exportar todo (PDF, CSV o copia de seguridad), corregir cualquier registro y eliminar tu cuenta con todos sus datos desde Perfil → Eliminar cuenta.</p>
        <h4>Recomendación</h4><p>Elige una región de Supabase en la Unión Europea al crear el proyecto y usa una contraseña única. MEDICINA es una herramienta de organización: no prescribe ni modifica tratamientos.</p>
      </div>`;
    },
  });
}

async function restore(file) {
  let data;
  try { data = parseBackup(await file.text()); } catch (e) { return toast(e.message, { kind: 'warn' }); }
  const counts = `${data.meds.length} medicamentos, ${data.intakes.length} tomas y ${data.restocks.length} reposiciones`;
  const ok = await confirmDialog({ title: 'Restaurar copia', message: `La copia tiene ${counts}. Se añadirán los que falten y se actualizarán los que sean más recientes. No se duplica nada.`, confirmLabel: 'Restaurar', danger: false });
  if (!ok) return;
  let added = 0, updated = 0;
  for (const t of TYPES) {
    const r = mergeRecords(store.all(t), data[t]);
    added += r.added; updated += r.updated;
    await store.saveMany(t, r.changed);
  }
  toast(`Copia restaurada · ${added} añadidos, ${updated} actualizados`);
}

export async function handleProfileEvent(e) {
  const t = e.target;
  if (e.type === 'click') {
    const th = t.closest('[data-theme-set]');
    if (th) { setTheme(th.dataset.themeSet); return true; }
    const a = t.closest('[data-pf]')?.dataset.pf;
    if (!a) return false;
    const act = {
      password: openPassword,
      privacy: openPrivacy,
      logout: signOut,
      delete: deleteAccount,
      'photo-remove': async () => {
        if (await confirmDialog({ title: 'Quitar foto de perfil', message: 'Se quitará la foto en todos tus dispositivos.', confirmLabel: 'Quitar' })) { await store.updateSettings({ photo: '' }); toast('Foto quitada'); }
      },
      'sync-now': () => { store.adapter?.retry?.(); toast('Sincronizando…'); },
      'notif-ask': async () => { const r = await requestNotifications(); toast(r === 'granted' ? 'Notificaciones activadas' : 'No se han permitido las notificaciones', { kind: r === 'granted' ? 'ok' : 'warn' }); store.emit(); },
      'ics-all': () => deliverFile(`MEDICINA-tomas-${dayKey()}.ics`, medsToICS(activeMeds()), 'text/calendar'),
      csv: () => deliverFile(`MEDICINA-historial-${dayKey()}.csv`, intakesToCSV(store.all('intakes')), 'text/csv'),
      backup: () => deliverFile(`MEDICINA-copia-${dayKey()}.json`, JSON.stringify(toBackup(store.data, store.settings), null, 1), 'application/json'),
    };
    await act[a]?.();
    return true;
  }
  if (e.type === 'change' || e.type === 'input') {
    const n = t.name;
    if (e.type !== 'change') return false;
    if (n === 'pf-name') { await store.updateSettings({ displayName: t.value.trim().slice(0, 30) }); toast('Guardado'); return true; }
    const nums = (v) => v.split(/[;,\s]+/).map((x) => Number(x.replace(',', '.'))).filter((x) => Number.isFinite(x) && x >= 0);
    const map = {
      'pf-photo': async () => {
        const f = t.files?.[0];
        if (!f) return;
        try { await store.updateSettings({ photo: await avatarFromFile(f) }); toast('Foto de perfil guardada'); }
        catch (ex) { toast(ex.message, { kind: 'warn' }); }
        t.value = '';
      },
      'pf-remember': () => setRemember(t.checked),
      'pf-notify-doses': () => store.updateSettings({ notifyDoses: t.checked }),
      'pf-notify-stock': () => store.updateSettings({ notifyStock: t.checked }),
      'pf-reminder': () => store.updateSettings({ defaultReminder: t.value === '' ? null : Number(t.value) }),
      'pf-tolerance': () => store.updateSettings({ toleranceMin: Math.max(5, Math.min(180, Math.round(Number(t.value) || 30))) }),
      'pf-thresholds': () => store.updateSettings({ defaultThresholds: [...new Set(nums(t.value))].sort((a, b) => b - a) }),
      'pf-min': () => store.updateSettings({ defaultMinReserve: Math.max(0, Number(t.value) || 0) }),
      'pf-days': () => store.updateSettings({ defaultAlertDays: Math.max(0, Math.min(60, Math.round(Number(t.value) || 0))) }),
      'pf-restore': () => t.files?.[0] && restore(t.files[0]).finally(() => { t.value = ''; }),
    };
    if (map[n]) { await map[n](); if (!['pf-restore', 'pf-remember', 'pf-photo'].includes(n)) toast('Guardado'); return true; }
  }
  return false;
}
