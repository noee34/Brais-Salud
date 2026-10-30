// Componentes reutilizables: hoja inferior, confirmación, aviso y calendario.
import { icons } from './art.js';
import { monthGrid, fmtMonth, WEEKDAY_INITIALS, dayKey } from './dates.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let openSheets = 0;

/**
 * Abre una hoja inferior. `render(el, close)` monta el contenido.
 * Devuelve una función para cerrarla.
 */
export function openSheet({ label, render, onClose }) {
  const root = document.createElement('div');
  root.className = 'sheet-root';
  root.innerHTML = `<div class="sheet-backdrop" data-close></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}"><div class="grabber" aria-hidden="true"></div><div class="sheet-body"></div></section>`;
  document.body.appendChild(root);
  openSheets++;
  document.body.style.overflow = 'hidden';
  const sheet = $('.sheet', root);
  const prevFocus = document.activeElement;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    root.classList.add('closing');
    sheet.classList.add('closing');
    setTimeout(() => {
      root.remove();
      if (--openSheets === 0) document.body.style.overflow = '';
      prevFocus?.focus?.({ preventScroll: true });
      onClose?.();
    }, 230);
  };

  root.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // Deslizar hacia abajo para cerrar: SOLO desde la parte de arriba (rayita y
  // título) y solo con un movimiento claro. Así, al tocar botones del formulario
  // la ventana no se mueve nada (en el iPhone, mover lo que hay bajo el dedo
  // durante un toque puede hacer que Safari descarte ese toque).
  const DRAG_FROM = '.grabber, .sheet-head';
  const THRESHOLD = 10;
  let startY = null;
  let dragging = false;
  sheet.addEventListener('touchstart', (e) => {
    const handle = e.target.closest(DRAG_FROM) && !e.target.closest('button, input, textarea, select, label');
    startY = handle && sheet.scrollTop <= 0 ? e.touches[0].clientY : null;
    dragging = false;
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    const dy = e.touches[0].clientY - startY;
    if (!dragging && dy > THRESHOLD) dragging = true;
    if (dragging) sheet.style.transform = `translateY(${Math.max(0, dy - THRESHOLD) * 0.6}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', (e) => {
    if (startY == null) return;
    const dy = e.changedTouches[0].clientY - startY;
    sheet.style.transform = '';
    startY = null;
    if (dragging && dy > 120) close();
    dragging = false;
  });

  render($('.sheet-body', root), close);
  requestAnimationFrame(() => sheet.focus?.({ preventScroll: true }));
  sheet.tabIndex = -1;
  return close;
}

export function confirmDialog({ title, message, confirmLabel = 'Eliminar', cancelLabel = 'Cancelar', danger = true, typeToConfirm = '' }) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'dialog-root';
    root.innerHTML = `<div class="sheet-backdrop" data-no></div>
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-m">
        <h3 id="dlg-t">${esc(title)}</h3>
        <p id="dlg-m">${esc(message)}</p>
        ${typeToConfirm ? `<label class="type-confirm"><span class="eyebrow">Escribe ${esc(typeToConfirm)} para confirmar</span><input autocomplete="off" autocapitalize="characters" spellcheck="false" data-type-confirm></label>` : ''}
        <button class="btn ${danger ? 'btn-danger-fill' : 'btn-primary'}" data-yes ${typeToConfirm ? 'disabled' : ''}>${esc(confirmLabel)}</button>
        <button class="btn btn-ghost" data-no>${esc(cancelLabel)}</button>
      </div>`;
    document.body.appendChild(root);
    const done = (v) => { root.remove(); resolve(v); };
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-yes]')) done(true);
      else if (e.target.closest('[data-no]')) done(false);
    });
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(false); });
    const typed = $('[data-type-confirm]', root);
    if (typed) typed.addEventListener('input', () => { $('[data-yes]', root).disabled = typed.value.trim().toUpperCase() !== typeToConfirm; });
    (typed || $('[data-no].btn', root)).focus();
  });
}

let toastTimer;
let toastUntil = 0;
export function toast(message, { kind = 'ok', ms = 2400, queue = false } = {}) {
  // Con `queue`, espera a que termine el aviso visible (p. ej. "Toma registrada") en vez de taparlo.
  const wait = toastUntil - Date.now();
  if (queue && wait > 0 && document.querySelector('.toast:not(.out)')) { setTimeout(() => toast(message, { kind, ms }), wait + 350); return; }
  toastUntil = Date.now() + ms;
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<span class="ok">${(kind === 'ok' ? icons.check : icons.alert)({ size: 15 })}</span><span>${esc(message)}</span>`;
  document.body.appendChild(el);
  toastTimer = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

/**
 * Calendario mensual con indicadores por día.
 * marks: Map(dayKey -> { done, pending, omitted })  (número de tomas de cada tipo)
 *   verde = realizada · naranja = pendiente o retrasada · gris = omitida
 */
export function calendarHTML({ year, month, selected, marks, id = 'cal', withYear = false }) {
  const today = dayKey();
  const weeks = monthGrid(year, month);
  const cells = weeks.flat().map((c) => {
    const m = marks.get(c.key) || {};
    let ind = '';
    if (m.done) ind += '<i class="dot ok"></i>';
    if (m.pending) ind += '<i class="dot warn"></i>';
    if (m.omitted) ind += '<i class="dot off"></i>';
    const cls = ['cal-day', !c.inMonth && 'out', c.key === today && 'today', c.key === selected && 'sel', c.key > today && 'future'].filter(Boolean).join(' ');
    const desc = [m.done && `${m.done} realizadas`, m.pending && `${m.pending} pendientes o retrasadas`, m.omitted && `${m.omitted} omitidas`].filter(Boolean).join(', ');
    return `<button class="${cls}" data-day="${c.key}" aria-pressed="${c.key === selected}" aria-label="${c.day}${desc ? `, ${desc}` : ''}"><span class="cal-num">${c.day}</span><span class="cal-marks">${ind}</span></button>`;
  }).join('');
  return `<div class="cal" id="${id}">
    <div class="cal-head">
      <button class="icon-btn" data-month="-1" aria-label="Mes anterior">${icons.left()}</button>
      <div class="cal-title" aria-live="polite">${fmtMonth(year, month)}</div>
      <button class="icon-btn" data-month="1" aria-label="Mes siguiente">${icons.right()}</button>
    </div>
    ${withYear ? `<div class="cal-year"><button class="link-btn" data-month="-12" aria-label="Año anterior">‹ ${year - 1}</button><span>${year}</span><button class="link-btn" data-month="12" aria-label="Año siguiente">${year + 1} ›</button></div>` : ''}
    <div class="cal-grid" role="grid">
      ${WEEKDAY_INITIALS.map((d) => `<div class="cal-wd" aria-hidden="true">${d}</div>`).join('')}
      ${cells}
    </div>
    <div class="cal-legend"><span><i class="dot ok"></i>Realizada</span><span><i class="dot warn"></i>Pendiente o retrasada</span><span><i class="dot off"></i>Omitida</span></div>
  </div>`;
}

/** Cambia de mes conservando año correcto (dic → ene). */
export function shiftMonth(year, month, delta) {
  const d = new Date(year, month + delta, 1);
  return [d.getFullYear(), d.getMonth()];
}

/** Gestos horizontales (anterior / siguiente). */
export function onSwipe(el, cb) {
  let x0 = null, y0 = null;
  el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) cb(dx < 0 ? 1 : -1);
  }, { passive: true });
}
