// Informe PDF del historial (jsPDF + AutoTable, incluidos en js/vendor y
// cargados solo al exportar). Solo incluye lo que está REGISTRADO: las tomas
// previstas que no se registraron aparecen como "sin registrar", nunca como
// realizadas.
import { dayKey, toTimeInput, parseDayKey, addDays } from './dates.js';
import { qty, medTitle, FORMS } from './meds.js';
import { scheduleText, slotStatuses, activeWindow } from './schedule.js';
import { STATUS } from './meds.js';

const TEAL = [14, 124, 123];
const TEAL_DEEP = [10, 94, 94];
const TURQ = [91, 194, 187];
const BLUE = [44, 110, 166];
const PEARL = [233, 238, 241];
const INK = [30, 50, 56];
const MUTED = [116, 135, 141];

let loading = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(s);
  });
}
/** Carga jsPDF y AutoTable la primera vez que se usan. */
export function loadPdfLib() {
  if (globalThis.jspdf?.jsPDF?.API?.autoTable) return Promise.resolve(globalThis.jspdf.jsPDF);
  loading ??= loadScript('js/vendor/jspdf.umd.min.js').then(() => loadScript('js/vendor/jspdf.plugin.autotable.min.js')).then(() => globalThis.jspdf.jsPDF);
  return loading;
}

const fmtDate = (ms) => new Date(ms).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtDateTime = (ms) => `${fmtDate(ms)} ${toTimeInput(ms)}`;
const STATE = { realizada: 'Realizada', omitida: 'Omitida' };

/**
 * Datos del informe (separado de la maquetación para poder probarlo).
 * opts: { from, to (ms, to exclusivo), medId|null, periodLabel, now, toleranceMin }
 */
export function reportData({ meds, intakes }, { from, to, medId = null, periodLabel, now = Date.now(), toleranceMin = 30 }) {
  const inRange = (ms) => (from == null || ms >= from) && (to == null || ms < to);
  const list = intakes.filter((i) => inRange(i.at) && (!medId || i.medId === medId)).sort((a, b) => a.at - b.at || a.medName.localeCompare(b.medName));
  const medIds = new Set(list.map((i) => i.medId));
  if (medId) medIds.add(medId);
  // También los tratamientos vigentes en el periodo aunque no tengan tomas registradas.
  for (const m of meds) {
    if (medId && m.id !== medId) continue;
    const [w0, w1] = activeWindow(m);
    if (m.frequency !== 'demanda' && w0 < Math.min(to ?? now, now) && w1 > (from ?? -Infinity)) medIds.add(m.id);
  }
  const medList = meds.filter((m) => medIds.has(m.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  // Tomas previstas ya pasadas que no constan registradas en el periodo.
  const start = from ?? Math.min(...medList.map((m) => parseDayKey(m.startDate).getTime()), now);
  const end = Math.min(to ?? now, now);
  let unregistered = 0;
  const perMed = medList.map((m) => {
    const mine = list.filter((i) => i.medId === m.id);
    const slots = end > start ? slotStatuses(m, intakes, start, end, { now, toleranceMin }) : [];
    const missing = slots.filter((s) => !s.intake && s.status === 'retrasada').length;
    unregistered += missing;
    return {
      med: m,
      done: mine.filter((i) => i.status === 'realizada').length,
      omitted: mine.filter((i) => i.status === 'omitida').length,
      late: slots.filter((s) => s.late).length,
      missing,
      amount: mine.filter((i) => i.status === 'realizada').reduce((a, i) => a + Number(i.quantity || 0), 0),
    };
  });
  const done = list.filter((i) => i.status === 'realizada').length;
  const omitted = list.filter((i) => i.status === 'omitida').length;
  const days = new Set(list.filter((i) => i.status === 'realizada').map((i) => dayKey(i.at))).size;
  const expected = done + omitted + unregistered;
  return {
    periodLabel,
    first: list[0]?.at ?? null,
    last: list[list.length - 1]?.at ?? null,
    rows: list,
    perMed,
    summary: { total: list.length, done, omitted, unregistered, days, adherence: expected ? Math.round((done / expected) * 100) : null },
  };
}

/** Genera el PDF y devuelve un Blob. */
export async function buildPdf(data, { email = '', now = Date.now() } = {}) {
  const JsPDF = await loadPdfLib();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 16;

  const header = () => {
    doc.setFillColor(...TEAL); doc.rect(0, 0, W, 24, 'F');
    doc.setFillColor(...TURQ); doc.rect(0, 24, W, 1.2, 'F');
    // Cápsula de marca
    doc.setFillColor(255, 255, 255); doc.roundedRect(M, 8.5, 15, 7, 3.5, 3.5, 'F');
    doc.setFillColor(...TURQ); doc.roundedRect(M + 7.5, 8.5, 7.5, 7, 3.5, 3.5, 'F'); doc.rect(M + 7.5, 8.5, 3.5, 7, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('MEDICINA', M + 20, 14.2, { charSpace: 1.4 });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text('Informe del historial de medicación', M + 20, 19);
    doc.text(`Generado el ${fmtDateTime(now)}`, W - M, 14.2, { align: 'right' });
  };

  header();
  let y = 34;
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  const meta = [
    ['Período consultado', data.periodLabel],
    ['Registros incluidos', data.rows.length ? `${fmtDate(data.first)} – ${fmtDate(data.last)}` : 'Sin registros en este período'],
    ...(email ? [['Cuenta', email]] : []),
  ];
  for (const [k, v] of meta) {
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...MUTED); doc.setFontSize(8.5); doc.text(k.toUpperCase(), M, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK); doc.setFontSize(10.5); doc.text(String(v), M + 45, y);
    y += 6.5;
  }

  const section = (title) => {
    y += 4;
    if (y > 262) { doc.addPage(); header(); y = 36; }
    doc.setFillColor(...TEAL); doc.rect(M, y - 4, 1.4, 5.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...TEAL_DEEP);
    doc.text(title, M + 4, y);
    y += 4;
  };
  const table = (head, body, extra = {}) => {
    doc.autoTable({
      startY: y, head: [head], body, margin: { left: M, right: M, top: 32, bottom: 18 },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.4, textColor: INK, lineColor: PEARL, lineWidth: 0.2 },
      headStyles: { fillColor: TEAL, textColor: 255, fontStyle: 'bold', fontSize: 8.6 },
      alternateRowStyles: { fillColor: [246, 250, 251] },
      didDrawPage: () => header(),
      ...extra,
    });
    y = doc.lastAutoTable.finalY + 6;
  };

  // Resumen estadístico
  section('Resumen estadístico');
  const s = data.summary;
  const boxes = [
    ['Tomas realizadas', String(s.done)],
    ['Tomas omitidas', String(s.omitted)],
    ['Previstas sin registrar', String(s.unregistered)],
    ['Cumplimiento', s.adherence == null ? '—' : `${s.adherence} %`],
  ];
  const bw = (W - 2 * M - 9) / 4;
  boxes.forEach(([k, v], i) => {
    const x = M + i * (bw + 3);
    doc.setFillColor(237, 247, 246); doc.roundedRect(x, y, bw, 19, 2.5, 2.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...TEAL_DEEP); doc.text(v, x + 4, y + 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); doc.setTextColor(...MUTED); doc.text(k, x + 4, y + 15);
  });
  y += 24;
  doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text(doc.splitTextToSize(`Días con alguna toma realizada: ${s.days}. El cumplimiento es realizadas / (realizadas + omitidas + previstas sin registrar). Las "previstas sin registrar" son tomas de la pauta que no constan en el registro: no se cuentan como realizadas.`, W - 2 * M), M, y);
  y += 9;

  // Relación de medicamentos
  section('Relación de medicamentos');
  table(['Medicamento', 'Presentación', 'Pauta', 'Estado', 'Realizadas', 'Omitidas', 'Sin registrar'],
    data.perMed.map((p) => [
      medTitle(p.med), FORMS[p.med.form]?.label || '', `${qty(p.med.dose, p.med.unit)} · ${scheduleText(p.med)}`,
      p.med.archived ? 'Quitado de la lista' : STATUS[p.med.status]?.label || '', String(p.done), String(p.omitted), String(p.missing),
    ]),
    { columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } } });

  // Registro cronológico
  section('Registro cronológico de tomas');
  if (data.rows.length) {
    table(['Fecha', 'Hora', 'Medicamento', 'Cantidad', 'Estado', 'Observaciones'],
      data.rows.map((r) => [fmtDate(r.at), toTimeInput(r.at), r.medName, r.status === 'omitida' ? '—' : qty(r.quantity, r.unit), STATE[r.status], r.notes || '']),
      {
        columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 13 }, 3: { cellWidth: 26 }, 4: { cellWidth: 20 } },
        didParseCell: (c) => { if (c.section === 'body' && c.column.index === 4) c.cell.styles.textColor = c.cell.raw === 'Omitida' ? MUTED : [47, 158, 110]; },
      });
  } else {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(...MUTED); doc.text('No hay tomas registradas en este período.', M, y + 2); y += 8;
  }

  // Tomas omitidas
  const omitted = data.rows.filter((r) => r.status === 'omitida');
  section('Tomas omitidas');
  if (omitted.length) {
    table(['Fecha', 'Hora', 'Medicamento', 'Observaciones'], omitted.map((r) => [fmtDate(r.at), toTimeInput(r.at), r.medName, r.notes || '']));
  } else {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(...MUTED); doc.text('No hay tomas omitidas en este período.', M, y + 2); y += 8;
  }

  // Pie con paginación en todas las páginas
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const H = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...PEARL); doc.line(M, H - 13, W - M, H - 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); doc.setTextColor(...MUTED);
    doc.text('MEDICINA · Registro personal de tomas. Documento informativo: no sustituye la indicación de un profesional sanitario.', M, H - 8.5);
    doc.text(`Página ${p} de ${pages}`, W - M, H - 8.5, { align: 'right' });
  }
  doc.setProperties({ title: `MEDICINA - Informe ${data.periodLabel}`, creator: 'MEDICINA' });
  return doc.output('blob');
}

/** Rango de fechas para cada opción del formulario de exportación. */
export function periodRange(kind, { month, from, to, now = Date.now() } = {}) {
  const today = dayKey(now);
  const end = parseDayKey(addDays(today, 1)).getTime();
  const fmt = (k) => parseDayKey(k).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  switch (kind) {
    case 'all': return { from: null, to: null, label: 'Todo el historial' };
    case '7': return { from: parseDayKey(addDays(today, -6)).getTime(), to: end, label: `Últimos 7 días (${fmt(addDays(today, -6))} – ${fmt(today)})` };
    case '30': return { from: parseDayKey(addDays(today, -29)).getTime(), to: end, label: `Últimos 30 días (${fmt(addDays(today, -29))} – ${fmt(today)})` };
    case '90': {
      const d = parseDayKey(today); const f = dayKey(new Date(d.getFullYear(), d.getMonth() - 3, d.getDate() + 1));
      return { from: parseDayKey(f).getTime(), to: end, label: `Últimos 3 meses (${fmt(f)} – ${fmt(today)})` };
    }
    case 'month': {
      const [y, m] = month.split('-').map(Number);
      const name = new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      return { from: new Date(y, m - 1, 1).getTime(), to: new Date(y, m, 1).getTime(), label: name.charAt(0).toUpperCase() + name.slice(1) };
    }
    case 'range': return { from: parseDayKey(from).getTime(), to: parseDayKey(addDays(to, 1)).getTime(), label: `Del ${fmt(from)} al ${fmt(to)}` };
    default: return { from: null, to: null, label: 'Todo el historial' };
  }
}
