// BIBLIOTECA: buscar medicamentos autorizados en España y leer su prospecto
// oficial (CIMA · AEMPS) sin salir de la app. Se puede añadir a "Mis medicamentos".
import { icons, scene } from '../art.js';
import { esc, openSheet, toast, $ } from '../ui.js';
import { searchMedicines, getLeaflet, cleanLeafletHTML, leafletText, niceName, formFromCima, libraryAvailable } from '../library.js';
import { syncPill, offlineBar, emptyState } from './common.js';

export const lib = { query: '', onlyMarketed: true, loading: false, error: '', results: null, total: 0, last: '' };

function resultRow(m) {
  return `<li><button class="row lib-row" data-lib="${esc(m.nregistro)}">
    ${m.foto ? `<img class="lib-thumb" src="${esc(m.foto)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="med-ico">${icons.capsule({ size: 22 })}</span>`}
    <span class="row-main"><span class="row-title">${esc(niceName(m.nombre))}</span>
      <span class="row-sub">${esc([m.pactivos, m.lab].filter(Boolean).join(' · '))}</span>
      <span class="tags">${m.receta ? '<span class="pill blue">Con receta</span>' : '<span class="pill teal">Sin receta</span>'}${m.comerc ? '' : '<span class="pill off">No comercializado</span>'}${m.generico ? '<span class="pill">Genérico</span>' : ''}</span></span>
    <span class="row-chev">${icons.right({ size: 18 })}</span></button></li>`;
}

export function renderLibrary() {
  const body = !libraryAvailable()
    ? emptyState('meds', 'Biblioteca no disponible', 'La biblioteca necesita la cuenta en la nube (Supabase) configurada.')
    : lib.loading ? `<div class="empty"><div class="spinner" aria-hidden="true"></div><div class="empty-sub">Buscando en CIMA…</div></div>`
      : lib.error ? `<div class="note-box warn">${icons.alert({ size: 18 })}<span>${esc(lib.error)}</span></div>`
        : lib.results == null ? `<div class="empty">${scene('meds', { width: 190 })}<div class="empty-title">Busca cualquier medicamento</div>
            <div class="empty-sub">Escribe el nombre comercial o el principio activo (por ejemplo, "ibuprofeno" o "Dalsy") para ver sus presentaciones y su prospecto oficial.</div></div>`
          : lib.results.length ? `<p class="subtle" style="margin:14px 2px 6px">${lib.total > lib.results.length ? `Mostrando ${lib.results.length} de ${lib.total} resultados. Escribe más para afinar.` : `${lib.results.length} ${lib.results.length === 1 ? 'resultado' : 'resultados'}`}</p>
              <div class="card" style="padding:2px 14px"><ul class="list">${lib.results.map(resultRow).join('')}</ul></div>`
            : emptyState('meds', 'Sin resultados', `No hay medicamentos que coincidan con "${lib.last}"${lib.onlyMarketed ? ' entre los comercializados' : ''}.`);
  return `
  <header class="topbar"><a class="icon-btn" href="#medicamentos" aria-label="Volver a Medicamentos">${icons.left()}</a><h1 class="h-page" style="flex:1">Biblioteca</h1>${syncPill()}</header>
  ${offlineBar()}
  <form class="lib-search" data-lib-form role="search">
    <div class="input-shell"><span aria-hidden="true">${icons.search({ size: 20 })}</span>
      <input type="search" name="lib-q" value="${esc(lib.query)}" placeholder="Nombre o principio activo" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search" aria-label="Buscar medicamento"></div>
    <button class="btn btn-primary" type="submit">Buscar</button>
  </form>
  <label class="check-row" style="margin-top:10px"><span class="grow">Solo medicamentos comercializados</span><input type="checkbox" class="switch" name="lib-comerc" ${lib.onlyMarketed ? 'checked' : ''}></label>
  ${body}
  <p class="field-hint" style="margin-top:16px">Fuente: CIMA, Agencia Española de Medicamentos y Productos Sanitarios (AEMPS). Información oficial y orientativa: no sustituye la indicación de tu médico o farmacéutico.</p>`;
}

/** Lanza la búsqueda y redibuja con `rerender`. */
export async function runSearch(q, rerender) {
  lib.query = q;
  const term = q.trim();
  if (term.length < 3) { lib.error = 'Escribe al menos 3 letras.'; lib.results = null; return rerender(); }
  lib.loading = true; lib.error = ''; rerender();
  try {
    const data = await searchMedicines(term, { onlyMarketed: lib.onlyMarketed });
    lib.results = data?.resultados || [];
    lib.total = data?.total || lib.results.length;
    lib.last = term;
  } catch (e) {
    lib.error = e.message; lib.results = null;
  } finally {
    lib.loading = false; rerender();
  }
}

/**
 * Ficha de un medicamento de la biblioteca con su prospecto por apartados.
 * onAdd(prefill) abre el formulario de "Nuevo medicamento" con los datos rellenos.
 */
export function openLibraryItem(m, { onAdd }) {
  let sections = null;
  openSheet({
    label: niceName(m.nombre),
    render(body, close) {
      const facts = [
        ['Principio activo', m.pactivos], ['Dosis', m.dosis], ['Forma', m.forma && niceCase(m.forma)], ['Vía', m.via && niceCase(m.via)],
        ['Laboratorio', m.lab], ['Dispensación', m.cpresc], ['Nº de registro', m.nregistro],
      ].filter(([, v]) => v);
      const draw = (state = 'loading', error = '') => {
        body.innerHTML = `<div class="sheet-head"><div class="grow"><span class="eyebrow">Biblioteca · CIMA</span><h2 class="h-section">${esc(niceName(m.nombre))}</h2></div>
            <button class="icon-btn" data-close aria-label="Cerrar">${icons.close()}</button></div>
          ${m.foto ? `<img class="lib-photo" src="${esc(m.foto)}" alt="Envase de ${esc(niceName(m.nombre))}" referrerpolicy="no-referrer">` : ''}
          <div class="tags" style="margin-bottom:12px">${m.receta ? '<span class="pill blue">Con receta</span>' : '<span class="pill teal">Sin receta</span>'}${m.comerc ? '<span class="pill ok">Comercializado</span>' : '<span class="pill off">No comercializado</span>'}${m.conduc ? '<span class="pill warn">Afecta a la conducción</span>' : ''}</div>
          <div class="card"><div class="facts">${facts.map(([k, v]) => `<div class="fact ${String(v).length > 22 ? 'wide' : ''}"><span class="fact-label">${k}</span><span class="fact-value" style="font-weight:500">${esc(v)}</span></div>`).join('')}</div></div>
          <div class="form-actions"><button class="btn btn-primary btn-block" data-lib-add>${icons.plus({ size: 20 })} Añadir a mis medicamentos</button></div>
          <section class="section" style="margin-top:20px"><div class="section-head"><h3 class="h-section">Prospecto oficial</h3>
            ${m.prospecto?.url ? `<a class="link-btn" href="${esc(m.prospecto.url)}" target="_blank" rel="noopener">${icons.pdf({ size: 16 })} PDF</a>` : ''}</div>
            ${state === 'loading' ? '<div class="empty"><div class="spinner" aria-hidden="true"></div><div class="empty-sub">Cargando el prospecto…</div></div>'
              : state === 'error' ? `<div class="note-box warn">${icons.alert({ size: 18 })}<span>${esc(error)}</span></div>`
                : sections?.length ? sections.filter((s) => s.seccion !== '0').map((s, i) => `<details class="leaflet-sec" ${i === 0 ? 'open' : ''}><summary>${esc(s.titulo || `Apartado ${s.seccion}`)}</summary><div class="leaflet-body">${cleanLeafletHTML(s.contenido)}</div></details>`).join('')
                  : `<p class="subtle">Este medicamento no tiene el prospecto por apartados.${m.prospecto?.url ? ' Puedes abrir el PDF oficial.' : ''}</p>`}
          </section>
          <p class="field-hint">Fuente: CIMA (AEMPS). Lee siempre el prospecto de tu caja y sigue las indicaciones de tu médico o farmacéutico.</p>`;
      };
      draw();
      getLeaflet(m.nregistro).then((d) => { sections = Array.isArray(d) ? d : []; draw('ok'); }).catch((e) => draw('error', e.message));
      body.addEventListener('click', (e) => {
        if (!e.target.closest('[data-lib-add]')) return;
        const { form, unit } = formFromCima(m.forma);
        const uso = sections?.find((s) => s.seccion === '1');
        const conserva = sections?.find((s) => s.seccion === '5');
        close();
        onAdd({
          name: niceName(m.nombre), strength: m.dosis || '', form, unit, needsRx: Boolean(m.receta),
          leaflet: { ...(uso ? { uso: leafletText(uso.contenido) } : {}), ...(conserva ? { conservacion: leafletText(conserva.contenido) } : {}) },
          cimaId: m.nregistro,
        });
        toast('Revisa los datos y completa la pauta que te han indicado');
      });
    },
  });
}

const niceCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();
export { $ };
