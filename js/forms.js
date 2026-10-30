// Formularios en hojas que suben desde abajo: medicamento, toma, reposición
// e informe PDF. Validan antes de guardar y nunca duplican registros.
import { store } from './store.js';
import { icons } from './art.js';
import { openSheet, confirmDialog, toast, esc, $, $$ } from './ui.js';
import { dayKey, combineLocal, toDateInput, toTimeInput, addDays } from './dates.js';
import { FORMS, UNITS, REMINDERS, RX, qty, medTitle, validateMed, fmtNum, LEAFLET, LEAFLET_MAX, cimaUrl } from './meds.js';
import { FREQUENCIES, DEFAULT_TIMES, intervalTimes, intervalHours } from './schedule.js';
import { registerIntake, updateIntake, deleteIntake, registerRestock, infoFor, listedMeds, getMed, meds as allMeds, checkStockAlerts } from './model.js';
import { account } from './account.js';
import { reportData, buildPdf, periodRange } from './pdf.js';
import { deliverFile } from './data-io.js';

const head = (title, sub = '') => `<div class="sheet-head"><div class="grow"><h2 class="h-section">${esc(title)}</h2>${sub ? `<div class="subtle">${esc(sub)}</div>` : ''}</div>
  <button type="button" class="icon-btn" data-close aria-label="Cerrar">${icons.close()}</button></div>`;

const stepper = (name, value, unitLabel, { step = 1, min = 0 } = {}) => `<div class="amount" data-stepper="${name}" data-step="${step}" data-min="${min}">
  <button type="button" class="step" data-dec aria-label="Menos">${icons.minus()}</button>
  <label class="amount-input"><input name="${name}" type="number" inputmode="decimal" step="any" min="${min}" value="${esc(value)}" aria-label="Cantidad"><span data-unit-label>${esc(unitLabel)}</span></label>
  <button type="button" class="step" data-inc aria-label="Más">${icons.plus()}</button></div>`;

function wireSteppers(root) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-inc], [data-dec]');
    if (!b) return;
    const box = b.closest('[data-stepper]');
    const input = $('input', box);
    const step = Number(box.dataset.step) || 1;
    const min = Number(box.dataset.min) || 0;
    const cur = Number(String(input.value).replace(',', '.')) || 0;
    const next = Math.max(min, Math.round((cur + (b.hasAttribute('data-inc') ? step : -step)) * 100) / 100);
    input.value = next;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const numVal = (input) => Number(String(input?.value ?? '').replace(',', '.'));

/* ================================================================== */
/* Medicamento                                                          */
/* ================================================================== */

export function openMedForm({ med = null } = {}) {
  const s = store.settings;
  const now = Date.now();
  const info = med ? infoFor(med) : null;
  const m = med ? { ...med } : {
    name: '', strength: '', form: 'comprimido', dose: 1, unit: 'comprimidos', frequency: 'h8', times: ['08:00'], scheduleMode: 'fijo',
    startDate: dayKey(), endDate: '', notes: '', reminder: s.defaultReminder ?? 0,
    stockEnabled: true, stockInitial: '', minReserve: s.defaultMinReserve ?? 5, thresholds: s.defaultThresholds || [10, 5, 2],
    alertDays: s.defaultAlertDays ?? 3, needsRx: false, rxStatus: 'sin_receta', lastRestockDate: '',
  };
  let times = [...(m.times?.length ? m.times : ['08:00'])];
  const currentStock = info ? Math.max(0, info.stock) : m.stockInitial;

  openSheet({
    label: med ? 'Editar medicamento' : 'Nuevo medicamento',
    render(body, close) {
      body.innerHTML = `<form novalidate>
        ${head(med ? 'Editar medicamento' : 'Nuevo medicamento')}
        <div class="field"><div class="field-label"><span class="eyebrow">Nombre</span></div>
          <div class="input-shell"><input name="name" value="${esc(m.name)}" maxlength="80" autocomplete="off" placeholder="Ej. Paracetamol" required></div></div>
        <div class="grid2">
          <div class="field"><div class="field-label"><span class="eyebrow">Concentración</span></div>
            <div class="input-shell"><input name="strength" value="${esc(m.strength)}" maxlength="60" autocomplete="off" placeholder="Ej. 1 g"></div></div>
          <div class="field"><div class="field-label"><span class="eyebrow">Presentación</span></div>
            <div class="input-shell select"><select name="form">${Object.entries(FORMS).map(([id, f]) => `<option value="${id}" ${m.form === id ? 'selected' : ''}>${f.label}</option>`).join('')}</select></div></div>
        </div>
        <div class="field"><div class="field-label"><span class="eyebrow">Cantidad por toma</span>
            <span class="input-shell select" style="min-height:36px;padding:0 10px"><select name="unit" aria-label="Unidad de medida" style="min-height:34px;font-size:.88rem">${Object.keys(UNITS).map((u) => `<option value="${u}" ${m.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></span></div>
          ${stepper('dose', m.dose, m.unit, { step: 0.5, min: 0 })}</div>

        <div class="fieldset"><span class="eyebrow">Pauta</span>
          <div class="field"><div class="field-label"><span class="eyebrow">Frecuencia</span></div>
            <div class="input-shell select"><select name="frequency">${Object.entries(FREQUENCIES).map(([id, f]) => `<option value="${id}" ${m.frequency === id ? 'selected' : ''}>${f.label}</option>`).join('')}</select></div></div>
          <div class="field" data-times-field></div>
          <div class="field" data-mode-field></div>
          <div class="grid2">
            <div class="field"><div class="field-label"><span class="eyebrow">Fecha de inicio</span></div>
              <div class="input-shell"><input type="date" name="startDate" value="${esc(m.startDate)}" required></div></div>
            <div class="field"><div class="field-label"><span class="eyebrow">Finalización</span></div>
              <div class="input-shell"><input type="date" name="endDate" value="${esc(m.endDate || '')}" aria-label="Fecha de finalización (opcional)"></div></div>
          </div>
          <p class="field-hint">Deja la finalización vacía si el tratamiento no tiene fecha definida.</p>
          <div class="field"><div class="field-label"><span class="eyebrow">Aviso de toma</span></div>
            <div class="input-shell select"><select name="reminder">${REMINDERS.map(([v, l]) => `<option value="${v ?? ''}" ${(m.reminder ?? '') === (v ?? '') ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
        </div>

        <div class="fieldset"><span class="eyebrow">Existencias</span>
          <label class="check-row field"><span class="grow"><strong>Controlar existencias</strong><br><span class="subtle">Descuenta cada toma y avisa cuando queden pocas.</span></span>
            <input type="checkbox" class="switch" name="stockEnabled" ${m.stockEnabled ? 'checked' : ''}></label>
          <div data-stock-fields>
            <div class="field"><div class="field-label"><span class="eyebrow">${med ? 'Cantidad disponible ahora' : 'Cantidad inicial disponible'}</span></div>
              ${stepper('stockInitial', currentStock === '' ? '' : fmtNum(currentStock).replace(',', '.'), m.unit, { step: 1, min: 0 })}
              ${med ? '<p class="field-hint">Cámbiala solo si has contado lo que te queda: será el nuevo punto de partida.</p>' : ''}</div>
            <div class="grid2">
              <div class="field"><div class="field-label"><span class="eyebrow">Reserva mínima</span></div>
                <div class="input-shell"><input name="minReserve" type="number" inputmode="decimal" min="0" value="${esc(m.minReserve)}"><span class="unit" data-unit-label>${esc(m.unit)}</span></div></div>
              <div class="field"><div class="field-label"><span class="eyebrow">Avisar con</span></div>
                <div class="input-shell"><input name="alertDays" type="number" inputmode="numeric" min="0" max="60" value="${esc(m.alertDays)}"><span class="unit">días</span></div></div>
            </div>
            <div class="field"><div class="field-label"><span class="eyebrow">Umbrales de aviso</span></div>
              <div class="input-shell"><input name="thresholds" value="${esc((m.thresholds || []).join(', '))}" inputmode="decimal" placeholder="10, 5, 2"><span class="unit" data-unit-label>${esc(m.unit)}</span></div>
              <p class="field-hint">Avisa cuando queden estas cantidades (sepáralas con comas).</p></div>
            <label class="check-row field"><span class="grow"><strong>Necesita receta médica</strong><br><span class="subtle">Te recordará pedirla a tiempo.</span></span>
              <input type="checkbox" class="switch" name="needsRx" ${m.needsRx ? 'checked' : ''}></label>
            <div class="field"><div class="field-label"><span class="eyebrow">Última reposición · opcional</span></div>
              <div class="input-shell"><input type="date" name="lastRestockDate" value="${esc(m.lastRestockDate || '')}"></div></div>
          </div>
        </div>

        <div class="field"><div class="field-label"><span class="eyebrow">Observaciones</span></div>
          <textarea class="notes" name="notes" maxlength="500" placeholder="Ej. Tomar con comida (según indicación médica)">${esc(m.notes)}</textarea></div>

        <div class="fieldset"><span class="eyebrow">Prospecto breve · opcional</span>
          <p class="field-hint">Resume lo importante del prospecto de la caja o del oficial. <a class="link-btn" data-cima href="${esc(cimaUrl(m))}" target="_blank" rel="noopener" style="min-height:0;display:inline">Ver prospecto oficial (CIMA)</a></p>
          ${LEAFLET.map(([k, label]) => `<div class="field"><div class="field-label"><span class="eyebrow">${label}</span></div>
            <textarea class="notes" name="lf-${k}" maxlength="${LEAFLET_MAX}" rows="2">${esc(m.leaflet?.[k] || '')}</textarea></div>`).join('')}
        </div>
        <div class="note-box">${icons.shield({ size: 18 })}<span>MEDICINA registra la pauta indicada por tu médico o farmacéutico. No recomienda dosis ni cambia tratamientos.</span></div>
        <p class="form-error" role="alert"></p>
        <div class="form-actions"><button type="submit" class="btn btn-primary btn-block">${med ? 'Guardar cambios' : 'Añadir medicamento'}</button></div>
      </form>`;

      const form = $('form', body);
      const err = $('.form-error', body);
      wireSteppers(body);

      const drawTimes = () => {
        const f = form.frequency.value;
        const every = FREQUENCIES[f]?.every;
        const tf = $('[data-times-field]', body);
        const mf = $('[data-mode-field]', body);
        if (f === 'demanda') {
          tf.innerHTML = '<p class="field-hint">Sin horario: registrarás cada toma cuando la hagas. No se calculan próximas tomas ni días restantes.</p>';
          mf.innerHTML = '';
          return;
        }
        if (every) {
          tf.innerHTML = `<div class="field-label"><span class="eyebrow">Hora de la primera toma</span></div>
            <div class="input-shell"><input type="time" name="firstTime" value="${esc(times[0] || '08:00')}"></div>
            <p class="field-hint">Horas del día: <strong data-preview>${intervalTimes(times[0] || '08:00', every).join(' · ')}</strong></p>`;
          const mode = form.dataset.mode || m.scheduleMode || 'fijo';
          mf.innerHTML = `<div class="field-label"><span class="eyebrow">Si una toma se retrasa</span></div>
            <div class="choice" role="radiogroup">
              <button type="button" class="${mode === 'fijo' ? 'on' : ''}" data-mode="fijo" role="radio" aria-checked="${mode === 'fijo'}">${icons.clock({ size: 18 })}<span>Mantener el horario fijo</span></button>
              <button type="button" class="${mode === 'desde_ultima' ? 'on' : ''}" data-mode="desde_ultima" role="radio" aria-checked="${mode === 'desde_ultima'}">${icons.refresh({ size: 18 })}<span>Contar desde la última toma</span></button>
            </div><p class="field-hint">Elige lo que te haya indicado tu médico o farmacéutico.</p>`;
          form.dataset.mode = mode;
        } else {
          const count = FREQUENCIES[f]?.count;
          if (count && times.length !== count) times = [...(DEFAULT_TIMES[f] || times)].slice(0, count);
          tf.innerHTML = `<div class="field-label"><span class="eyebrow">Horarios</span>${f === 'custom' ? '<button type="button" class="link-btn" data-add-time>+ Añadir hora</button>' : ''}</div>
            <div class="times">${times.map((t, i) => `<span class="time-chip"><input type="time" value="${esc(t)}" data-time="${i}" aria-label="Hora ${i + 1}">${f === 'custom' && times.length > 1 ? `<button type="button" data-del-time="${i}" aria-label="Quitar hora">${icons.close({ size: 14 })}</button>` : ''}</span>`).join('')}</div>`;
          mf.innerHTML = '';
        }
      };
      const syncUnit = () => $$('[data-unit-label]', body).forEach((el) => { el.textContent = form.unit.value; });
      const syncStock = () => { $('[data-stock-fields]', body).hidden = !form.stockEnabled.checked; };
      drawTimes(); syncStock();

      body.addEventListener('change', (e) => {
        const t = e.target;
        if (t.name === 'frequency') {
          const f = t.value;
          if (FREQUENCIES[f]?.every) times = [times[0] || '08:00'];
          else if (DEFAULT_TIMES[f] && (f !== 'custom' || !times.length)) times = [...DEFAULT_TIMES[f]];
          drawTimes();
        }
        if (t.name === 'form') { form.unit.value = FORMS[t.value].unit; syncUnit(); }
        if (t.name === 'unit') syncUnit();
        if (t.name === 'stockEnabled') syncStock();
      });
      form.name.addEventListener('input', () => { const a = $('[data-cima]', body); if (a) a.href = cimaUrl({ name: form.name.value }); });
      body.addEventListener('input', (e) => {
        const t = e.target;
        if (t.dataset.time != null) times[Number(t.dataset.time)] = t.value;
        if (t.name === 'firstTime') {
          times = [t.value];
          const p = $('[data-preview]', body);
          if (p && t.value) p.textContent = intervalTimes(t.value, FREQUENCIES[form.frequency.value].every).join(' · ');
        }
      });
      body.addEventListener('click', (e) => {
        const md = e.target.closest('[data-mode]');
        if (md) { form.dataset.mode = md.dataset.mode; drawTimes(); return; }
        if (e.target.closest('[data-add-time]')) { times.push('12:00'); drawTimes(); return; }
        const del = e.target.closest('[data-del-time]');
        if (del) { times.splice(Number(del.dataset.delTime), 1); drawTimes(); }
      });

      form.onsubmit = async (e) => {
        e.preventDefault();
        err.textContent = '';
        const f = form.frequency.value;
        const thresholds = form.thresholds.value.split(/[;,\s]+/).map((x) => x.replace(',', '.')).filter(Boolean).map(Number);
        const stockNow = numVal(form.stockInitial);
        const data = {
          name: form.name.value.trim(), strength: form.strength.value.trim(), form: form.form.value,
          dose: numVal(form.dose), unit: form.unit.value, frequency: f,
          times: f === 'demanda' ? [] : FREQUENCIES[f]?.every ? [times[0] || '08:00'] : [...new Set(times.filter(Boolean))].sort(),
          scheduleMode: FREQUENCIES[f]?.every ? (form.dataset.mode || 'fijo') : 'fijo',
          startDate: form.startDate.value, endDate: form.endDate.value || '',
          reminder: form.reminder.value === '' ? null : Number(form.reminder.value),
          notes: form.notes.value.trim(),
          leaflet: Object.fromEntries(LEAFLET.map(([k]) => [k, form[`lf-${k}`].value.trim()]).filter(([, v]) => v)),
          stockEnabled: form.stockEnabled.checked,
          minReserve: numVal(form.minReserve) || 0,
          alertDays: Math.max(0, Math.min(60, Math.round(numVal(form.alertDays) || 0))),
          thresholds: [...new Set(thresholds)].sort((a, b) => b - a),
          needsRx: form.needsRx.checked,
          lastRestockDate: form.lastRestockDate.value || '',
          stockInitial: form.stockInitial.value === '' ? (form.stockEnabled.checked ? NaN : 0) : stockNow,
        };
        const problem = validateMed(data);
        if (problem) { err.textContent = problem; return; }
        const t = Date.now();
        // Recuento: solo si es nuevo o si ha cambiado la cantidad disponible.
        const recount = !med || !med.stockEnabled || (data.stockEnabled && Math.abs(data.stockInitial - Math.max(0, info?.stock ?? 0)) > 1e-9);
        const rec = {
          ...(med ? { id: med.id } : { status: 'activo', statusAt: t, archived: false }),
          ...data,
          stockInitial: recount ? data.stockInitial : med.stockInitial,
          stockSince: recount ? t : med.stockSince,
          rxStatus: med ? (data.needsRx && med.rxStatus === 'sin_receta' ? 'pendiente_solicitar' : !data.needsRx && ['pendiente_solicitar', 'solicitada', 'disponible'].includes(med.rxStatus) ? 'sin_receta' : med.rxStatus) : (data.needsRx ? 'repuesto' : 'sin_receta'),
          rxStatusAt: med?.rxStatusAt || t,
        };
        if (!data.stockEnabled && !med) { rec.stockInitial = 0; }
        await store.save('meds', rec);
        close();
        toast(med ? 'Cambios guardados' : 'Medicamento añadido');
        checkStockAlerts();
      };
      if (!med) setTimeout(() => form.name.focus({ preventScroll: true }), 350);
    },
  });
}

/* ================================================================== */
/* Toma (registrar con otra hora, omitir o corregir)                     */
/* ================================================================== */

export function openIntakeForm({ record = null, medId = null, at = null, scheduledAt } = {}) {
  const editing = Boolean(record);
  const options = editing ? [] : listedMeds().filter((m) => m.status !== 'finalizado');
  let med = editing ? getMed(record.medId) : getMed(medId) || options[0];
  if (!editing && !med) { toast('Primero añade un medicamento', { kind: 'warn' }); return; }
  const when = record ? record.at : at ?? Date.now();
  const unit = record ? record.unit : med.unit;
  let status = record ? record.status : 'realizada';

  openSheet({
    label: editing ? 'Corregir toma' : 'Registrar toma',
    render(body, close) {
      body.innerHTML = `<form novalidate>
        ${head(editing ? 'Corregir toma' : 'Registrar toma', editing ? record.medName : '')}
        ${!editing ? `<div class="field"><div class="field-label"><span class="eyebrow">Medicamento</span></div>
          <div class="input-shell select"><select name="med">${options.map((o) => `<option value="${o.id}" ${o.id === med.id ? 'selected' : ''}>${esc(medTitle(o))}</option>`).join('')}</select></div></div>` : ''}
        <div class="field"><div class="field-label"><span class="eyebrow">Estado</span></div>
          <div class="choice" role="radiogroup">
            <button type="button" data-status="realizada" class="${status === 'realizada' ? 'on' : ''}" role="radio" aria-checked="${status === 'realizada'}">${icons.check({ size: 18 })}<span>Realizada</span></button>
            <button type="button" data-status="omitida" class="${status === 'omitida' ? 'on' : ''}" role="radio" aria-checked="${status === 'omitida'}">${icons.skip({ size: 18 })}<span>Omitida</span></button>
          </div></div>
        <div class="field"><div class="field-label"><span class="eyebrow">Fecha y hora reales</span></div>
          <div class="grid2"><div class="input-shell"><input type="date" name="date" value="${toDateInput(when)}" max="${dayKey()}"></div>
          <div class="input-shell"><input type="time" name="time" value="${toTimeInput(when)}"></div></div>
          <div class="shortcuts">${[[0, 'Ahora'], [15, 'Hace 15 min'], [30, 'Hace 30 min'], [60, 'Hace 1 h']].map(([mm, l]) => `<button type="button" class="chip sm" data-ago="${mm}">${l}</button>`).join('')}</div></div>
        <div class="field" data-qty><div class="field-label"><span class="eyebrow">Cantidad administrada</span></div>
          ${stepper('quantity', record ? record.quantity : med.dose, unit, { step: 0.5, min: 0 })}
          <p class="field-hint">Por defecto, la cantidad de la pauta. Cámbiala solo si tomaste otra.</p></div>
        <div class="field"><div class="field-label"><span class="eyebrow">Observaciones · opcional</span></div>
          <textarea class="notes" name="notes" maxlength="500">${esc(record?.notes || '')}</textarea></div>
        <p class="form-error" role="alert"></p>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary btn-block">${editing ? 'Guardar corrección' : 'Guardar toma'}</button>
          ${editing ? `<button type="button" class="btn btn-danger btn-block" data-delete>${icons.trash({ size: 18 })} Eliminar registro</button>` : ''}
        </div></form>`;
      const form = $('form', body);
      const err = $('.form-error', body);
      wireSteppers(body);
      const syncQty = () => { $('[data-qty]', body).hidden = status === 'omitida'; };
      syncQty();
      body.addEventListener('click', async (e) => {
        const st = e.target.closest('[data-status]');
        if (st) { status = st.dataset.status; $$('[data-status]', body).forEach((b) => { b.classList.toggle('on', b === st); b.setAttribute('aria-checked', String(b === st)); }); syncQty(); }
        const ago = e.target.closest('[data-ago]');
        if (ago) { const t = Date.now() - Number(ago.dataset.ago) * 60000; form.date.value = toDateInput(t); form.time.value = toTimeInput(t); }
        if (e.target.closest('[data-delete]')) { if (await deleteIntake(record)) close(); }
      });
      form.med?.addEventListener('change', () => { med = getMed(form.med.value); form.quantity.value = med.dose; $('[data-unit-label]', body).textContent = med.unit; });
      form.onsubmit = async (e) => {
        e.preventDefault();
        err.textContent = '';
        const t = combineLocal(form.date.value, form.time.value);
        if (!form.date.value || !form.time.value || !Number.isFinite(t)) { err.textContent = 'Indica la fecha y la hora.'; return; }
        if (t > Date.now() + 5 * 60000) { err.textContent = 'No se pueden registrar tomas en el futuro. Registra la toma cuando la hagas.'; return; }
        const quantity = status === 'omitida' ? 0 : numVal(form.quantity);
        if (status === 'realizada' && !(quantity > 0)) { err.textContent = 'La cantidad debe ser mayor que cero.'; return; }
        if (quantity > 1000) { err.textContent = 'La cantidad parece demasiado alta.'; return; }
        if (editing) await updateIntake(record, { at: t, quantity, status, notes: form.notes.value.trim() });
        else {
          const saved = await registerIntake(med, { at: t, quantity, status, notes: form.notes.value, scheduledAt });
          if (!saved) return;
        }
        close();
      };
    },
  });
}

/* ================================================================== */
/* Reposición                                                           */
/* ================================================================== */

export function openRestockForm(med) {
  const info = infoFor(med);
  openSheet({
    label: 'Registrar reposición',
    render(body, close) {
      body.innerHTML = `<form novalidate>
        ${head('Registrar reposición', medTitle(med))}
        <p class="subtle">Añade las unidades de la caja nueva que has comprado o recogido.</p>
        <div class="field"><div class="field-label"><span class="eyebrow">Fecha de reposición</span></div>
          <div class="input-shell"><input type="date" name="date" value="${dayKey()}" max="${dayKey()}"></div></div>
        <div class="field"><div class="field-label"><span class="eyebrow">Cantidad añadida</span></div>
          ${stepper('quantity', '', med.unit, { step: 1, min: 0 })}
          <p class="field-hint">Disponible ahora: ${esc(qty(Math.max(0, info?.stock ?? 0), med.unit))} · Después: <strong data-after>—</strong></p></div>
        <div class="field"><div class="field-label"><span class="eyebrow">Observaciones · opcional</span></div>
          <textarea class="notes" name="notes" maxlength="500" placeholder="Ej. Recogida en la farmacia"></textarea></div>
        <p class="form-error" role="alert"></p>
        <div class="form-actions"><button type="submit" class="btn btn-primary btn-block">Guardar reposición</button></div></form>`;
      const form = $('form', body);
      wireSteppers(body);
      const after = () => { const q = numVal(form.quantity); $('[data-after]', body).textContent = q > 0 ? qty((info?.stock || 0) + q, med.unit) : '—'; };
      form.addEventListener('input', after);
      form.onsubmit = async (e) => {
        e.preventDefault();
        const q = numVal(form.quantity);
        if (!(q > 0)) { $('.form-error', body).textContent = 'Indica cuántas unidades has añadido.'; return; }
        if (!form.date.value) { $('.form-error', body).textContent = 'Indica la fecha.'; return; }
        const dateMs = form.date.value === dayKey() ? Date.now() : combineLocal(form.date.value, '12:00');
        await registerRestock(med, { at: dateMs, quantity: q, notes: form.notes.value });
        close();
      };
      setTimeout(() => form.quantity.focus({ preventScroll: true }), 350);
    },
  });
}

/* ================================================================== */
/* Informe PDF                                                          */
/* ================================================================== */

export function openPdfForm({ medId = '' } = {}) {
  const all = [...allMeds()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  let kind = '30';
  const thisMonth = dayKey().slice(0, 7);
  openSheet({
    label: 'Exportar informe PDF',
    render(body, close) {
      body.innerHTML = `<form novalidate>
        ${head('Exportar informe PDF', 'Historial de tomas con tablas y resumen')}
        <div class="field"><div class="field-label"><span class="eyebrow">Período</span></div>
          <div class="chips">${[['all', 'Todo el historial'], ['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['90', 'Últimos 3 meses'], ['month', 'Un mes concreto'], ['range', 'Intervalo personalizado']]
            .map(([id, l]) => `<button type="button" class="chip ${kind === id ? 'on' : ''}" data-kind="${id}" aria-pressed="${kind === id}">${l}</button>`).join('')}</div></div>
        <div class="field" data-month hidden><div class="field-label"><span class="eyebrow">Mes</span></div>
          <div class="input-shell"><input type="month" name="month" value="${thisMonth}" max="${thisMonth}"></div></div>
        <div class="field grid2" data-range hidden>
          <div><div class="field-label"><span class="eyebrow">Desde</span></div><div class="input-shell"><input type="date" name="from" value="${addDays(dayKey(), -13)}" max="${dayKey()}"></div></div>
          <div><div class="field-label"><span class="eyebrow">Hasta</span></div><div class="input-shell"><input type="date" name="to" value="${dayKey()}" max="${dayKey()}"></div></div></div>
        <div class="field"><div class="field-label"><span class="eyebrow">Medicamento</span></div>
          <div class="input-shell select"><select name="med"><option value="">Todos los medicamentos</option>${all.map((m) => `<option value="${m.id}" ${m.id === medId ? 'selected' : ''}>${esc(medTitle(m))}${m.archived ? ' (quitado de la lista)' : m.status === 'finalizado' ? ' (finalizado)' : ''}</option>`).join('')}</select></div></div>
        <div class="note-box">${icons.shield({ size: 18 })}<span>El informe solo incluye tomas registradas. Las tomas previstas que no se registraron aparecen como "sin registrar", nunca como realizadas.</span></div>
        <p class="form-error" role="alert"></p>
        <div class="form-actions"><button type="submit" class="btn btn-primary btn-block">${icons.pdf({ size: 20 })} EXPORTAR INFORME PDF</button></div></form>`;
      const form = $('form', body);
      const err = $('.form-error', body);
      body.addEventListener('click', (e) => {
        const k = e.target.closest('[data-kind]');
        if (!k) return;
        kind = k.dataset.kind;
        $$('[data-kind]', body).forEach((b) => { b.classList.toggle('on', b === k); b.setAttribute('aria-pressed', String(b === k)); });
        $('[data-month]', body).hidden = kind !== 'month';
        $('[data-range]', body).hidden = kind !== 'range';
      });
      form.onsubmit = async (e) => {
        e.preventDefault();
        err.textContent = '';
        if (kind === 'range' && (!form.from.value || !form.to.value || form.to.value < form.from.value)) { err.textContent = 'Revisa las fechas del intervalo.'; return; }
        if (kind === 'month' && !form.month.value) { err.textContent = 'Elige un mes.'; return; }
        const btn = $('button[type="submit"]', form);
        btn.disabled = true; btn.textContent = 'Preparando el informe…';
        try {
          const range = periodRange(kind, { month: form.month.value, from: form.from.value, to: form.to.value });
          const med = form.med.value ? getMed(form.med.value) : null;
          const data = reportData({ meds: allMeds(), intakes: store.all('intakes') }, {
            from: range.from, to: range.to, medId: med?.id || null,
            periodLabel: med ? `${range.label} · ${medTitle(med)}` : range.label, toleranceMin: store.settings.toleranceMin,
          });
          const blob = await buildPdf(data, { email: account.user?.email || '' });
          const name = `MEDICINA-informe-${dayKey()}.pdf`;
          await deliverFile(name, blob, 'application/pdf');
          close();
        } catch (ex) {
          console.error(ex);
          err.textContent = `No se pudo crear el PDF: ${ex.message}`;
          btn.disabled = false; btn.innerHTML = `${icons.pdf({ size: 20 })} EXPORTAR INFORME PDF`;
        }
      };
    },
  });
}

export { RX, intervalHours };
