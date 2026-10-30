// Biblioteca: búsqueda de medicamentos y prospectos oficiales en CIMA, el
// registro de la Agencia Española de Medicamentos y Productos Sanitarios (AEMPS).
//
// CIMA no deja que una web la consulte directamente desde el navegador, así
// que las consultas pasan por la función "cima" de Supabase
// (supabase/functions/cima/index.ts), que solo permite estas búsquedas de lectura.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { account } from './account.js';
import { FORMS } from './meds.js';

const cache = new Map();

// (__MEDICINA_CIMA_BASE__ solo lo usan las pruebas automáticas, sin nube real)
const base = () => SUPABASE_URL || globalThis.__MEDICINA_CIMA_BASE__ || '';
export const libraryAvailable = () => Boolean(base());

async function call(params) {
  if (!libraryAvailable()) throw new Error('La biblioteca necesita la nube configurada (Supabase).');
  if (navigator.onLine === false) throw new Error('Sin conexión. La biblioteca necesita Internet.');
  const qs = new URLSearchParams(params).toString();
  if (cache.has(qs)) return cache.get(qs);
  let token = SUPABASE_ANON_KEY || 'prueba';
  try { token = (await account.client?.auth.getSession())?.data.session?.access_token || token; } catch { /* clave pública */ }
  const res = await fetch(`${base()}/functions/v1/cima?${qs}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY || token },
  });
  let data = null;
  try { data = await res.json(); } catch { /* respuesta vacía */ }
  if (!res.ok) throw new Error(data?.error || data?.message || 'La biblioteca no responde. Inténtalo más tarde.');
  cache.set(qs, data);
  return data;
}

/** Busca por nombre. Devuelve { total, resultados: [...] } (comercializados primero). */
export function searchMedicines(name, { onlyMarketed = false } = {}) {
  const q = name.trim();
  return call({ ruta: 'medicamentos', nombre: q, ...(onlyMarketed ? { comerc: '1' } : {}) });
}

export const getMedicine = (nregistro) => call({ ruta: 'medicamento', nregistro });

/** Prospecto por apartados: [{ seccion, titulo, contenido (HTML) }]. */
export const getLeaflet = (nregistro) => call({ ruta: 'docSegmentado/contenido/2', nregistro });

/* ------------------------------------------------------------------ */
/* Limpieza del HTML del prospecto                                      */
/* ------------------------------------------------------------------ */

const KEEP = new Set(['P', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'TR', 'TD', 'TH', 'TBODY', 'THEAD']);
const RENAME = { B: 'strong', I: 'em', H1: 'h4', H2: 'h4', H3: 'h5', H4: 'h5', H5: 'h5', H6: 'h5' };
const escText = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/**
 * Convierte el HTML de CIMA en HTML seguro: solo párrafos, listas, negritas y
 * tablas sencillas, sin atributos, estilos, enlaces ni scripts.
 */
export function cleanLeafletHTML(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const walk = (node) => {
    let out = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { out += escText(n.nodeValue.replace(/\s+/g, ' ')); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') continue;
      const inner = walk(n);
      if (!KEEP.has(tag)) { out += inner; continue; }
      if (tag === 'BR') { out += '<br>'; continue; }
      const t = (RENAME[tag] || tag).toLowerCase();
      if (['p', 'li', 'h4', 'h5', 'td', 'th'].includes(t) && !inner.replace(/<br>|&nbsp;| |\s/g, '')) continue; // vacíos
      out += `<${t}>${inner.trim()}</${t}>`;
    }
    return out;
  };
  return walk(doc.body.firstChild).replace(/(<br>\s*){3,}/g, '<br><br>');
}

/** Texto plano de un apartado (para copiar un resumen al medicamento). */
export function leafletText(html, max = 600) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  doc.querySelectorAll('p, li, br, h1, h2, h3, h4').forEach((el) => el.append('\n'));
  const t = doc.body.textContent.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : t;
}

/** "PARACETAMOL KERN PHARMA 1 g COMPRIMIDOS EFG" → "Paracetamol Kern Pharma 1 g comprimidos EFG" */
export function niceName(s = '') {
  const lower = s.toLowerCase().replace(/\b(efg|mg|ml|g|ui|mcg|µg)\b/g, (u) => (u === 'efg' ? 'EFG' : u));
  const words = lower.split(' ');
  // Mayúscula en la marca (palabras antes de la primera cifra)
  let brand = true;
  return words.map((w) => {
    if (/\d/.test(w)) brand = false;
    return brand && w !== 'EFG' ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  }).join(' ').slice(0, 80);
}

/** Presentación de la app que corresponde a la forma farmacéutica de CIMA. */
export function formFromCima(forma = '') {
  const f = forma.toUpperCase();
  const rules = [
    [/CÁPSULA|CAPSULA/, 'capsula'], [/COMPRIMIDO|GRAGEA|PASTILLA/, 'comprimido'], [/GOTAS|COLIRIO/, 'gotas'],
    [/SOBRE|GRANULADO|POLVO/, 'sobre'], [/INYECT|PERFUS/, 'inyectable'], [/INHALA|PULVERIZ|AEROSOL/, 'inhalador'],
    [/CREMA|POMADA|GEL|UNGÜENTO/, 'crema'], [/PARCHE|TRANSDÉRMICO/, 'parche'], [/SUPOSITORIO/, 'supositorio'],
    [/JARABE|SOLUCI|SUSPENSI|EMULSI/, 'jarabe'],
  ];
  const id = rules.find(([re]) => re.test(f))?.[1] || 'otro';
  return { form: id, unit: FORMS[id].unit };
}
