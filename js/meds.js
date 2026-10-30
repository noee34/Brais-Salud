// Catálogos de MEDICINA: presentaciones, unidades, estados y etiquetas.
// Todo lo que la app muestra como texto fijo sobre un medicamento sale de aquí.

/** Presentaciones y la unidad que se propone para cada una. */
export const FORMS = {
  comprimido: { label: 'Comprimido', unit: 'comprimidos' },
  capsula: { label: 'Cápsula', unit: 'cápsulas' },
  jarabe: { label: 'Jarabe', unit: 'ml' },
  gotas: { label: 'Gotas', unit: 'gotas' },
  sobre: { label: 'Sobre', unit: 'sobres' },
  inyectable: { label: 'Inyectable', unit: 'unidades' },
  inhalador: { label: 'Inhalador', unit: 'pulsaciones' },
  crema: { label: 'Crema o pomada', unit: 'aplicaciones' },
  parche: { label: 'Parche', unit: 'parches' },
  supositorio: { label: 'Supositorio', unit: 'supositorios' },
  otro: { label: 'Otro', unit: 'unidades' },
};

/** Unidades de medida: [plural, singular]. */
export const UNITS = {
  comprimidos: ['comprimidos', 'comprimido'],
  'cápsulas': ['cápsulas', 'cápsula'],
  ml: ['ml', 'ml'],
  gotas: ['gotas', 'gota'],
  sobres: ['sobres', 'sobre'],
  unidades: ['unidades', 'unidad'],
  pulsaciones: ['pulsaciones', 'pulsación'],
  aplicaciones: ['aplicaciones', 'aplicación'],
  parches: ['parches', 'parche'],
  supositorios: ['supositorios', 'supositorio'],
};

/** Número con coma decimal y sin ceros sobrantes: 1 → "1", 2.5 → "2,5". */
export function fmtNum(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const r = Math.round(Number(n) * 100) / 100;
  return String(r).replace('.', ',');
}

/** "1 comprimido", "2 comprimidos", "2,5 ml". */
export function qty(n, unit) {
  const [plural, singular] = UNITS[unit] || [unit, unit];
  return `${fmtNum(n)} ${Number(n) === 1 ? singular : plural}`;
}

export const STATUS = {
  activo: { label: 'Activo' },
  pausado: { label: 'Pausado' },
  finalizado: { label: 'Finalizado' },
};

/** Estados de receta / reposición (los cambia siempre la persona, nunca la app). */
export const RX = {
  sin_receta: { label: 'Sin necesidad de receta', short: 'Sin receta' },
  pendiente_solicitar: { label: 'Pendiente de solicitar receta', short: 'Pedir receta' },
  solicitada: { label: 'Receta solicitada', short: 'Receta pendiente' },
  disponible: { label: 'Receta disponible', short: 'Receta lista' },
  pendiente_compra: { label: 'Pendiente de compra o recogida', short: 'Por comprar' },
  repuesto: { label: 'Comprado o repuesto', short: 'Repuesto' },
};

/** Avisos de toma (minutos antes). null = sin aviso. */
export const REMINDERS = [
  [null, 'Sin aviso'],
  [0, 'A la hora de la toma'],
  [5, '5 minutos antes'],
  [15, '15 minutos antes'],
  [30, '30 minutos antes'],
];
export const reminderLabel = (m) => (REMINDERS.find(([v]) => v === m) || REMINDERS[0])[1];

/** Nombre visible: "Paracetamol 1 g". */
export const medTitle = (m) => [m.name, m.strength].filter(Boolean).join(' ');

/** Validación del formulario de medicamento. Devuelve el primer error o ''. */
export function validateMed(m) {
  if (!m.name || !m.name.trim()) return 'Escribe el nombre del medicamento.';
  if (m.name.trim().length > 80) return 'El nombre es demasiado largo.';
  if (!(Number(m.dose) > 0)) return 'La cantidad por toma debe ser mayor que cero.';
  if (Number(m.dose) > 1000) return 'La cantidad por toma parece demasiado alta.';
  if (!m.unit) return 'Elige la unidad de medida.';
  if (!m.startDate) return 'Indica la fecha de inicio.';
  if (m.endDate && m.endDate < m.startDate) return 'La fecha de finalización no puede ser anterior a la de inicio.';
  if (m.frequency !== 'demanda') {
    if (!m.times?.length) return 'Añade al menos un horario.';
    if (m.times.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) return 'Revisa los horarios (formato HH:MM).';
  }
  if (m.stockEnabled) {
    if (!(Number(m.stockInitial) >= 0)) return 'Indica cuántas unidades tienes ahora (puede ser 0).';
    if (!(Number(m.minReserve) >= 0)) return 'La reserva mínima no puede ser negativa.';
    if ((m.thresholds || []).some((t) => !(Number(t) >= 0))) return 'Revisa los umbrales de aviso.';
  }
  return '';
}
